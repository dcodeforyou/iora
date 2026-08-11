import * as THREE from "three";

// Real-time glass refraction shader — samples the ACTUAL rendered scene
// (see backgroundSceneMaterial.ts + ProofGlassCanvas.tsx's FBO pass) with
// UVs displaced by the glass's own edge-normal, rather than inventing a
// procedural "environment" just to have something to bend. Same texture
// is shown directly as the visible backdrop AND sampled here through the
// lens — genuinely the same content, correctly bent at the curved edge,
// not two independently-tuned effects that happen to resemble each
// other.
//
// A rounded-rect signed-distance-field gives the "lens profile": flat
// (zero displacement) through the middle, only curving in the outer
// `uDepth` px — glass stays genuinely clear in the center, all the
// bending happens right at the edge, same as a real lens. Chromatic
// aberration = sampling the background texture at slightly different UV
// offsets per color channel, same reason a real lens fringes color at
// high-contrast edges.

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform vec2 uResolution;        // this card's size, in px
  uniform float uRadius;           // corner radius, px
  uniform float uDepth;            // lens edge-zone thickness, px
  uniform vec2 uCardScreenCenter;  // this card's center, in screen px (origin top-left)
  uniform vec2 uViewportSize;      // full viewport, px — for screen-px -> background UV
  uniform sampler2D uBackgroundTexture;
  uniform vec3 uAccentColor;
  uniform float uChromaticAberration;
  uniform float uRefractStrength;
  uniform float uOpacity;

  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  // Samples the SAME texture the visible backdrop uses (see
  // ProofGlassCanvas.tsx) — this is what makes the refraction genuinely
  // "the actual background, bent," not an invented stand-in.
  vec3 sampleScene(vec2 screenPos) {
    // screenPos is top-left-origin/Y-down (matches getBoundingClientRect,
    // used everywhere else in this system); texture V is bottom-origin —
    // flip to sample the right pixel.
    vec2 uv = vec2(screenPos.x / uViewportSize.x, 1.0 - screenPos.y / uViewportSize.y);
    return texture2D(uBackgroundTexture, clamp(uv, 0.0, 1.0)).rgb;
  }

  void main() {
    // vUv.y=1 is the geometry's top edge (world +Y, screen-up / SMALLER
    // screen-space Y), but screenPos below is Y-DOWN (top-left origin,
    // matching sampleScene()). Flipping y here is what makes p's "top of
    // card" actually correspond to a smaller screenPos.y -- without it,
    // the refraction sampled content from the wrong (mirrored) side of
    // the background, a real bug: the card's top edge was bending in
    // whatever sat below it on screen, and vice versa.
    vec2 p = vec2((vUv.x - 0.5) * uResolution.x, (0.5 - vUv.y) * uResolution.y);
    vec2 halfSize = uResolution * 0.5;
    float dist = sdRoundBox(p, halfSize, uRadius);
    if (dist > 0.0) { discard; }

    float distFromEdge = -dist;
    // 1 right at the rim, falling to 0 by uDepth px inward -- the clear
    // center starts exactly where this hits 0.
    float edgeFactor = 1.0 - smoothstep(0.0, uDepth, distFromEdge);

    // SDF gradient (central difference) approximates the surface normal
    // for both refraction direction and the specular highlight.
    vec2 e = vec2(1.5, 0.0);
    float dx = sdRoundBox(p + e.xy, halfSize, uRadius) - sdRoundBox(p - e.xy, halfSize, uRadius);
    float dy = sdRoundBox(p + e.yx, halfSize, uRadius) - sdRoundBox(p - e.yx, halfSize, uRadius);
    vec2 normal2D = normalize(vec2(dx, dy) + 1e-5);

    vec2 refractOffset = normal2D * edgeFactor * uRefractStrength;
    vec2 screenPos = uCardScreenCenter + p;

    vec3 colR = sampleScene(screenPos + refractOffset * (1.0 + uChromaticAberration));
    vec3 colG = sampleScene(screenPos + refractOffset);
    vec3 colB = sampleScene(screenPos + refractOffset * (1.0 - uChromaticAberration));
    vec3 refracted = vec3(colR.r, colG.g, colB.b);

    // Directional specular highlight -- light from the upper-left, same
    // corner the DOM version concentrated its highlight in. Stays
    // white/neutral (a light source reads as white, not brand-colored).
    // Y sign flipped to match: "up" is now negative y, per the p.y fix
    // above -- without this the specular would flip to the bottom-left
    // once the refraction direction itself was corrected.
    vec2 lightDir = normalize(vec2(-0.5, -0.85));
    float spec = pow(max(dot(normal2D, lightDir), 0.0), 2.2) * edgeFactor;
    vec3 color = refracted + spec * vec3(1.0, 0.97, 0.94) * 0.85;

    // A thin rim exactly at the boundary, tinted toward the accent --
    // THIS is where "orangish chromatic fringe" belongs: a thin edge
    // line, not a wash across the whole face.
    float rim = 1.0 - smoothstep(0.0, 2.5, distFromEdge);
    vec3 rimColor = mix(vec3(1.0, 0.95, 0.92), uAccentColor, 0.35);
    color += rim * rimColor * 0.55;

    // Real alpha transparency -- this is what makes it read as GLASS
    // instead of a painted rectangle: the canvas alpha-composites over
    // whatever's actually behind it in the page, same as any transparent
    // element. Slightly more opaque right at the edge (rim + specular),
    // matching how a real lens edge is denser/more reflective than its
    // clear center.
    float alpha = uOpacity * (0.5 + edgeFactor * 0.5);
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createLiquidGlassMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    uniforms: {
      uResolution: { value: new THREE.Vector2(448, 800) },
      uRadius: { value: 44 },
      uDepth: { value: 34 },
      uCardScreenCenter: { value: new THREE.Vector2(0, 0) },
      uViewportSize: { value: new THREE.Vector2(1440, 900) },
      uBackgroundTexture: { value: null },
      uAccentColor: { value: new THREE.Color("#ff4e32") },
      uChromaticAberration: { value: 0.55 },
      uRefractStrength: { value: 46 },
      uOpacity: { value: 0.55 },
    },
  });
}

export type LiquidGlassMaterial = ReturnType<typeof createLiquidGlassMaterial>;
