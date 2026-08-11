import * as THREE from "three";

// The scene the glass actually refracts — rendered once to an offscreen
// texture (see ProofGlassCanvas.tsx's FBO pass), then sampled BOTH as the
// visible backdrop behind the cards AND, with UVs displaced by the glass
// shader's edge-normal, as what shows bent through the glass. Same
// source both times — genuine "the glass bends what's actually there,"
// not two independently-tuned effects that happen to look similar.
//
// Rebuilt against an actual reference (a real "iridescent bubble" motion
// graphic, screen-recorded frame-by-frame) after several earlier
// directions missed it entirely — worth recording what the reference
// actually showed, since it's the opposite of what a "glowing colored
// blob" model assumes:
//
// 1. TRANSPARENT interior, not filled. The bulk of the bubble is close
//    to invisible (matches the background almost exactly) — all the
//    color lives in a thin band right at the boundary, not spread across
//    the body. Earlier passes (translucent-liquid, opal) both had this
//    backwards to different degrees.
//
// 2. GRAVITY-WEIGHTED. The rim isn't uniform — thin and simple near the
//    top, pooling into much denser, more turbulent, swirling color at
//    the bottom. Real soap film is thinner at the top and thicker/more
//    turbulent at the bottom under gravity; the color pattern follows
//    that physical asymmetry, it isn't just decoration.
//
// 3. Multi-hue, not a two-tone shift — but curated to this brand rather
//    than a literal RGB spectrum, and orange-DOMINANT: the site's own
//    accent gets the widest band (see thematicColor()), with gold as its
//    neighbor, ember red-orange and violet as minority accents. Genuine
//    multi-color iridescence is a deliberate, scoped exception to the
//    site's near-monochrome+accent palette rule (see AGENTS.md),
//    confirmed explicitly rather than assumed — same pattern as the
//    marble's bounce-ease exception — but a crimson stop tried earlier
//    read as magenta-pink and became the visually dominant color by
//    accident, the opposite of the brief, so it was replaced.
//
// 4. The outline deforms via domain warping — 2D noise displaces the
//    SAMPLE POSITION before distance-to-center is measured, rather than
//    perturbing the radius by angle. An earlier attempt used angle-driven
//    wobble (sin(atan2(...))) and produced persistent dimple artifacts no
//    matter how it was tuned, because atan2's own derivative is genuinely
//    unstable in ways a gradient-based normal is sensitive to; a later
//    affine squash/stretch attempt was rejected as still reading like a
//    stretched oval, not "liquidy." Domain warp is smooth and non-periodic
//    everywhere so it can't hit a wrap-around discontinuity, and it
//    genuinely randomizes the outline rather than just rotating/scaling a
//    circle.
//
// 5. Real 3D readability needs a WHITE specular highlight, separate from
//    the thematic color cycle, but kept as an ACCENT — a first pass added
//    an inboard ring running parallel to the outer edge at a constant
//    offset, which (combined with the boundary highlight) put two crisp
//    white lines side by side everywhere around the ring, reading as a
//    pipe's cross-section rather than a bubble. Fixed by dropping the
//    parallel inner ring entirely and dialing the remaining highlights
//    (edge line + two glints) down to modest accents on top of the color,
//    not competing lines.
//
// 6. The interior edge should BLEED, not cut off. An early version faded
//    the color out over a tight ~28px band toward the transparent
//    center, which combined with the pipe-ring issue above to read as a
//    rigid tube wall. The interior falloff is now a much wider (~95px),
//    gradual smoothstep — color melts into the transparent center rather
//    than stopping at a fixed inward line, closer to how a real soap
//    film's color actually fades.

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    // Flipped Y: this plane's default UV has v=1 at world +Y (screen
    // "up," the SMALLER screen-space Y), but uGlowCenter is assigned
    // from JS in Y-DOWN terms (viewportHeight * fraction-from-top, same
    // convention as getBoundingClientRect and everywhere else in this
    // app). Left unflipped, "move the JS fraction toward 0" moved the
    // shape toward the BOTTOM of the screen instead of the top — the
    // actual root cause of several rounds of position tuning each
    // appearing to move the shape the wrong way.
    vUv = vec2(uv.x, 1.0 - uv.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform vec2 uResolution;
  uniform vec2 uGlowCenter;
  uniform float uGlowIntensity;
  uniform vec2 uGlow2Center;
  uniform float uGlow2Intensity;
  uniform vec3 uInkColor;
  uniform float uTime;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  // Genuine prism/thin-film spectrum — a continuous HSV hue sweep, the
  // same underlying idea as real soap-bubble or oil-slick interference
  // (white light dispersed into a smooth, unbroken color gradient), not
  // an authored set of curated stops. Several rounds of hand-picked
  // palettes (thematic warm-only, warm+violet, warm+cyan) were each
  // rejected in turn — the actual ask was the physically-motivated
  // prismatic look itself, which a real continuous spectrum gives
  // directly instead of approximating with a handful of mixed stops.
  vec3 hsv2rgb(vec3 c) {
    vec4 k = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + k.xyz) * 6.0 - k.www);
    return c.z * mix(k.xxx, clamp(p - k.xxx, 0.0, 1.0), c.y);
  }

  // Biases the hue traversal to DWELL longer near this site's orange
  // accent (~0.024) while still passing through every hue exactly once
  // per revolution — a monotonic phase-warp, not a hard palette stop, so
  // "keep the full spectrum, just have orange show up more" instead of
  // carving out a fixed orange-only band (which is what a curated
  // palette would do, and was already tried and rejected). Derivative is
  // 1 - A*cos(...), which stays positive for A<1, so this is guaranteed
  // to remain bijective around the circle — no hue gets skipped, they
  // just don't get equal screen time anymore.
  float warpHue(float t) {
    float A = 0.32;
    return t - (A / 6.28318530718) * sin(6.28318530718 * (t - 0.024));
  }

  // Saturation kept near max (0.95) — the earlier "candy" read turned
  // out to be the tight repeating hue-cycling from the swirl term (fixed
  // at its source, in main() below), not the saturation level itself.
  // Wherever the hue lands near this site's own orange accent (~0.024),
  // saturation goes to a clean 1.0 — HSV can't literally exceed that, so
  // the rest of "make orange hotter" comes from the brightness multiplier
  // in main() below, which is where an over-100% pop actually lives.
  vec3 thematicColor(float t) {
    float hue = fract(warpHue(t));
    float orangeDist = abs(hue - 0.024);
    orangeDist = min(orangeDist, 1.0 - orangeDist);
    float sat = mix(0.95, 1.0, smoothstep(0.14, 0.0, orangeDist));
    return hsv2rgb(vec3(hue, sat, 1.0));
  }

  void main() {
    vec2 p = vUv * uResolution;
    vec3 col = uInkColor;

    vec2 center = uGlowCenter + vec2(sin(uTime * 0.1) * 22.0, cos(uTime * 0.08) * 16.0);
    float radius = mix(250.0, 330.0, uGlow2Intensity);

    // Domain warp — perturb the SAMPLE POSITION with 2D noise before
    // measuring distance to the center, rather than perturbing the
    // radius by angle. This is the actual standard technique for
    // organic/random blob edges (Inigo Quilez's domain-warping articles
    // cover it at length): noise is smooth and non-periodic everywhere,
    // so unlike atan2-driven wobble it can't hit a wrap-around
    // discontinuity — reads as genuinely random and fluid rather than a
    // stretched/rotated circle (which an affine transform alone,
    // tried first, still reads as — an oval is still a recognizable
    // shape, not "random"). Back to the original 0.0055/130 tuning — a
    // "snake pattern" complaint at this same tuning turned out to be the
    // now-removed parallel inner ring (two lines tracing one wavy path
    // reads exactly like a snake's striped body), not this shape itself;
    // dialing the warp down to fix it just made the shape read as a
    // plain circle instead, which was a wrong diagnosis corrected here.
    vec2 warp = vec2(
      noise(p * 0.0055 + uTime * 0.05),
      noise(p * 0.0055 + vec2(41.0, 17.0) + uTime * 0.045)
    ) - 0.5;
    vec2 local = (p - center) + warp * 130.0;
    float dist = length(local) - radius;

    // A soft but MINIMAL bleed toward the transparent interior (16px) —
    // matched to the same tightness as the white specular highlights
    // below rather than a wide melt, so the color fades softly right at
    // the boundary without visibly thickening the band. (95px and then
    // 36px were both overcorrections toward "thick.")
    float rimWidth = 46.0;
    float insideBleed = smoothstep(-16.0, 0.0, dist);
    float outsideFalloff = 1.0 - smoothstep(0.0, rimWidth, max(dist, 0.0));
    float rimMask = insideBleed * outsideFalloff;

    // Gravity weight: ~0 at the top of the bubble, 1 at the bottom
    // (screen Y increases downward, so +local.y IS downward already).
    // Steep power curve — the top should read as almost bare, all the
    // density belongs low, or the asymmetry that actually sells "real
    // soap film under gravity" disappears.
    float verticalT = clamp((local.y + radius) / (radius * 2.0), 0.0, 1.0);
    float gravityWeight = pow(verticalT, 2.4);

    // Hue position around the ring. atan wraps from +pi to -pi at one
    // point on the circle (due-left), a hard 2*pi jump — dividing by
    // exactly 2*pi makes that jump exactly "1.0 cycle," which fract()
    // absorbs with no visible seam. This is the fix for a real bug: the
    // previous version used an arbitrary 0.32 coefficient, so the jump
    // landed on a NON-integer number of cycles and produced a visible
    // hard color seam at that point on the ring (reported as "the joint
    // of this shape is visible"). Same underlying lesson as the domain-
    // warp note above — angle wraps, so anything derived from it must
    // either avoid the wrap or land exactly on an integer cycle at it.
    float angle = atan(local.y, local.x);
    float baseHue = angle / 6.28318530718;

    // Turbulence sampled in screen space, NOT angle space — noise(angle)
    // has the same wrap problem as the old hue coefficient (a value-noise
    // hash grid has no reason to agree with itself 2*pi apart), so this
    // reads local position directly. Positions repeat exactly at the
    // wrap point (it's the same physical spot), so this is seamless by
    // construction rather than by tuning.
    // Frequency and amplitude both cut way down from an earlier pass
    // (0.02 / 2.4) — that combination cycled the hue through several
    // full rotations within one small turbulent patch, reading as tight
    // repeating rainbow stripes ("candy") rather than a slow, glassy
    // color drift. A real glass/soap-film gradient shifts gradually;
    // this now nudges phase by a fraction of a cycle at most, only in
    // the gravity-dense zone.
    float swirl = (noise(local * 0.006 + vec2(3.0, 9.0) + uTime * 0.12) - 0.5) * gravityWeight * 0.4;
    float phase = baseHue + swirl + uTime * 0.05;

    vec3 filmColor = thematicColor(phase);
    float rimIntensity = rimMask * mix(0.06, 1.0, gravityWeight) * mix(0.7, 1.3, uGlowIntensity);

    // Extra brightness specifically wherever the hue lands near this
    // site's own orange accent (~0.024 in hue-space) — the rest of the
    // spectrum stays a normal glassy brightness, but orange itself gets
    // to read as a genuinely hot, saturated pop, not just one hue among
    // equals in the sweep. Uses the same warpHue() as thematicColor() so
    // this lines up with the hue that's actually rendered, not the
    // pre-warp phase.
    float renderedHue = fract(warpHue(phase));
    float orangeHueDist = abs(renderedHue - 0.024);
    orangeHueDist = min(orangeHueDist, 1.0 - orangeHueDist);
    float orangeBoost = smoothstep(0.14, 0.0, orangeHueDist);

    // Glossy boost — pushes the hue brighter/more saturated than a flat
    // matte tint would read, closer to lit glass than colored paper.
    vec3 glossyColor = filmColor * mix(1.35, 2.4, orangeBoost);
    col += glossyColor * rimIntensity;

    // Highlights peak slightly OUTWARD of the true boundary (dist ~16,
    // toward the exterior side), not at dist=0. The band itself is
    // asymmetric — it bleeds 46px outward but only 16px inward from the
    // true edge — so a highlight centered exactly at dist=0 visually
    // sits close to the band's inner side; shifting the peak out lines
    // it up with the band's actual outer half instead.
    float outerEdge = 16.0;
    float outerBand = 1.0 - smoothstep(0.0, 20.0, abs(dist - outerEdge));

    // A soft bright line near the outer boundary — tinted toward white
    // rather than pure white, and kept modest, so it reads as a glassy
    // sheen ON the color rather than a second parallel line racing
    // alongside it (two crisp parallel lines was what made the earlier
    // version read as a pipe's cross-section instead of a bubble; there
    // is deliberately no second inboard ring here anymore).
    float edgeHighlight = pow(1.0 - smoothstep(0.0, 9.0, abs(dist - outerEdge)), 2.2);
    col += mix(filmColor, vec3(1.0), 0.45) * edgeHighlight * rimMask * 0.3;

    // White specular glints — a real glass/bubble surface reads as 3D
    // because of a soft key-light hotspot plus a smaller secondary
    // glint, distinct from the colored interference rim. Direction from
    // center (not angle) drives placement so it stays stable and free of
    // the atan2 instability that broke the earlier shading pass. Kept
    // modest — these are accents on top of the color, not a second
    // dominant white line. Masked by outerBand rather than the full
    // rim so they sit toward the outer edge like the highlight above.
    vec2 dir = normalize(local);

    vec2 keyLightDir = normalize(vec2(-0.55, -0.82));
    float keyGlint = pow(max(dot(dir, keyLightDir), 0.0), 14.0);
    col += vec3(1.0) * keyGlint * outerBand * 0.5;

    vec2 fillLightDir = normalize(vec2(0.68, -0.35));
    float fillGlint = pow(max(dot(dir, fillLightDir), 0.0), 46.0);
    col += vec3(1.0) * fillGlint * outerBand * 0.3;

    // A third glint that slowly travels around the rim, on top of the
    // two fixed ones above — light catching a surface that's gently
    // turning reads as more alive than two static hotspots alone. Built
    // as a rotating unit vector from cos/sin directly (never an angle
    // computed FROM dir), dotted against dir exactly like the fixed
    // glints above — this sidesteps the atan2 wrap issue entirely rather
    // than risking it, since nothing here ever calls atan(). ~20s per
    // lap (doubled from an initial 0.16 that read as too slow) and a
    // soft, moderate falloff (pow 26, between the two fixed glints' 14
    // and 46) keeps it reading as slow light, not a spinner.
    vec2 travelDir = vec2(cos(uTime * 0.32), sin(uTime * 0.32));
    float travelGlint = pow(max(dot(dir, travelDir), 0.0), 26.0);
    col += vec3(1.0) * travelGlint * outerBand * 0.4;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createBackgroundSceneMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uResolution: { value: new THREE.Vector2(1440, 900) },
      uGlowCenter: { value: new THREE.Vector2(0, 0) },
      uGlowIntensity: { value: 0.5 },
      uGlow2Center: { value: new THREE.Vector2(0, 0) },
      uGlow2Intensity: { value: 0.3 },
      uInkColor: { value: new THREE.Color("#0b0c10") },
      uTime: { value: 0 },
    },
  });
}

export type BackgroundSceneMaterial = ReturnType<typeof createBackgroundSceneMaterial>;
