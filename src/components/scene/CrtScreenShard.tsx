"use client";

import { forwardRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Mesh } from "three";

type CrtScreenShardProps = {
  width: number;
  height: number;
  /** 1 = fully present (the resting "one whole screen" state), 0 = gone
   * (the instant it's kicked and the shard cluster takes over). Driven with
   * a very narrow smoothstep window, not a slow fade — this should read as
   * a break, not a dissolve. */
  visibilityState?: { value: number };
  /** 0 = pure procedural static (no signal), 1 = the real hero video fully
   * resolved in — see heroEntry.ts's `signalBlend`. Independent of
   * `visibilityState`: the screen can be fully VISIBLE while still pure
   * static (before the entry click) or fully visible showing real video
   * (after it, until the scroll-driven break). */
  signalBlendState?: { value: number };
  /** Plain mutable object (not React state — same "no re-renders per
   * frame" rule as visibilityState/signalBlendState), read every frame in
   * useFrame below rather than passed as a changing prop. `.texture` is
   * null until HeroScene.tsx's SceneContent creates the real
   * THREE.VideoTexture (the shader falls back to a 1x1 dummy texture until
   * then, and `signalBlendState` stays 0 regardless, so nothing ever
   * actually samples garbage). `.scale` is the CONTAIN-fit expansion of
   * the video texture's sampled UV range on each axis (>=1 on the
   * letterboxed axis, 1 on the other) — the whole frame always fits, never
   * cropped, same idea as CSS `object-fit: contain` — [1, 1] (no
   * letterbox) until the video's real dimensions are known. */
  videoState?: { texture: THREE.Texture | null; scale: [number, number] };
};

const FULL = { value: 1 };
const NONE = { value: 0 };
const NO_VIDEO: { texture: THREE.Texture | null; scale: [number, number] } = { texture: null, scale: [1, 1] };

/** A rounded-rectangle screen shape — a real CRT/monitor bezel, not a sharp
 * rectangle. Standard THREE.Shape arc-corner construction. */
function createRoundedScreenShape(width: number, height: number, radius: number): THREE.Shape {
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w, h);
  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.absarc(w - r, -h + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(w, h - r);
  shape.absarc(w - r, h - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-w + r, h);
  shape.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-w, -h + r);
  shape.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
  return shape;
}

/** Pushes every vertex outward along Z proportional to how close it is to
 * the center (a parabolic falloff) — the convex "curved glass" bulge a real
 * CRT tube has, instead of a flat pane. Cheap: computed once at geometry
 * creation, not per frame. */
function applyCrtBulge(geometry: THREE.ExtrudeGeometry, width: number, height: number, amount: number) {
  const pos = geometry.attributes.position;
  const maxDist = Math.sqrt((width / 2) ** 2 + (height / 2) ** 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const distRatio = Math.min(1, Math.sqrt(x * x + y * y) / maxDist);
    const bulge = (1 - distRatio * distRatio) * amount;
    pos.setZ(i, z + bulge);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

const VERTEX = /* glsl */ `
  uniform float uWidth;
  uniform float uHeight;
  varying vec2 vUv;
  void main() {
    vUv = vec2(position.x / uWidth + 0.5, position.y / uHeight + 0.5);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uVisibility;
  uniform float uSignalBlend;
  uniform sampler2D uVideoTex;
  uniform vec2 uVideoScale;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec2 uv = vUv;

    // Fine, subtle static grain — a single octave, no blocky/pixelated
    // low-frequency layer (an earlier version added one to make the grain
    // more "visible" and it just looked chunky/pixelated instead of subtle).
    float grain = hash(uv * vec2(900.0, 900.0) + uTime * 60.0);

    // Scanlines rolling slowly downward.
    float scan = pow(sin(uv.y * 340.0 - uTime * 4.0) * 0.5 + 0.5, 2.0);

    // A soft horizontal tracking-error band drifting over time.
    float band = smoothstep(0.5, 0.0, abs(fract(uv.y * 2.2 - uTime * 0.15) - 0.5));

    float signal = mix(0.08, 0.9, grain) * 0.55 + scan * 0.25 + band * 0.08;
    vec3 staticColor = vec3(signal);

    // Faint cool tint — matches --color-glass-glow rather than neutral grey.
    staticColor = mix(staticColor, staticColor * vec3(0.85, 0.95, 1.05), 0.4);

    // Fake edge-glass highlight near the screen's own silhouette — part of
    // the STATIC look only now (see below): applying this additive white
    // near the edges to real video read as a washed-out, whitish haze over
    // the footage, confirmed directly as a real complaint, not a
    // hypothetical — the raw file itself was never touched (the web cut is
    // a byte-for-byte stream copy of the master, no re-encode at all).
    float edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    float edgeGlow = 1.0 - smoothstep(0.0, 0.05, edgeDist);
    staticColor += edgeGlow * 0.35;

    float distFromCenter = length(uv - 0.5);
    float vignette = 1.0 - smoothstep(0.15, 0.72, distFromCenter);

    // Corner darkening — the actual thing that sells "curved CRT tube," not
    // the geometry rounding alone (that reads as too subtle to notice at a
    // glance). High specifically where UV is near BOTH a vertical edge AND
    // a horizontal edge at once — i.e. the four corners — and near-zero
    // along the flat edges/center, unlike the circular vignette above which
    // darkens uniformly by radius.
    float nearVertEdge = 1.0 - smoothstep(0.0, 0.4, min(uv.x, 1.0 - uv.x));
    float nearHorizEdge = 1.0 - smoothstep(0.0, 0.4, min(uv.y, 1.0 - uv.y));
    float cornerDarken = nearVertEdge * nearHorizEdge;
    staticColor *= 1.0 - cornerDarken;

    // The static's own alpha stays deliberately faint/moody, well short of
    // fully opaque anywhere — that's correct for abstract noise, wrong for
    // real footage (see below).
    float staticAlpha = clamp(signal * 0.6 + edgeGlow * 0.35 + 0.18, 0.0, 0.75) * mix(0.35, 1.0, vignette) * (1.0 - cornerDarken);

    // CONTAIN-fit sample of the video texture — the WHOLE frame, zero crop,
    // zero stretch. uVideoScale is >=1 on the axis being letterboxed (1 on
    // the other), so this EXPANDS the sampled UV range beyond [0,1] on that
    // axis instead of shrinking it (the opposite of a cover-fit crop) —
    // anywhere that lands outside [0,1] is outside the actual video frame:
    // solid black there (classic TV letterbox bars), not a stretched edge-
    // pixel smear and not transparent (an earlier version was transparent
    // there, which is wrong for a whole-viewport screen — real letterboxing
    // is opaque black bars, explicitly asked for).
    vec2 videoUv = (uv - 0.5) * uVideoScale + 0.5;
    vec3 sampledColor = texture2D(uVideoTex, clamp(videoUv, 0.0, 1.0)).rgb;
    float inBounds = step(0.0, videoUv.x) * step(videoUv.x, 1.0) * step(0.0, videoUv.y) * step(videoUv.y, 1.0);
    vec3 videoColor = mix(vec3(0.0), sampledColor, inBounds);
    // Corner-DARKENING (reused directly from the static look above, same
    // cornerDarken value) plus a scanline MULTIPLIER — real alternating
    // bright/dark lines now (1.08x on the bright phosphor line, 0.65x on
    // the dark gap between them), not just occasional dark bands on an
    // unchanged background, per direct feedback that the lines needed a
    // whitish quality of their own. Still purely MULTIPLICATIVE, never a
    // flat additive veil across the whole frame — that distinction is what
    // keeps this from re-washing out the video the way the old additive
    // edge-glow/grain treatment did: multiplying a genuinely black pixel
    // by 1.08 is still black, so shadows/blacks can't lift into grey the
    // way an additive brightening would.
    videoColor *= mix(1.08, 0.65, scan);
    // Full color otherwise, full opacity everywhere (letterbox bars
    // included) — the exact source video, no crop, no stretch, no other
    // filter beyond these two subtle darkening cues.
    videoColor *= 1.0 - cornerDarken;
    float videoAlpha = 1.0;

    vec3 color = mix(staticColor, videoColor, uSignalBlend);
    float alpha = mix(staticAlpha, videoAlpha, uSignalBlend);

    gl_FragColor = vec4(color, alpha * uVisibility);
  }
`;

/**
 * The single, whole-viewport "screen" at rest — a rounded-corner CRT pane
 * with a convex glass bulge, dressed in a transparent grain/scanline
 * material that blends into the real hero video once the entry sequence
 * starts. Not the fracture pipeline's chipped/roughened shard shape — this
 * one is meant to read as clean old-TV glass, not broken glass.
 */
const CrtScreenShard = forwardRef<Mesh, CrtScreenShardProps>(function CrtScreenShard(
  { width, height, visibilityState = FULL, signalBlendState = NONE, videoState = NO_VIDEO },
  ref,
) {
  const geometry = useMemo(() => {
    const cornerRadius = Math.min(width, height) * 0.09;
    const shape = createRoundedScreenShape(width, height, cornerRadius);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.09,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.025,
      bevelSegments: 4,
      curveSegments: 16,
    });
    geo.center();
    // Bulge magnitude cut hard (0.035 -> 0.006) — the curved-glass bulge
    // pushes center vertices closer to the camera than edge vertices, and
    // under perspective projection that means the SAME world-space offset
    // from the optical axis projects to a slightly LARGER screen-space
    // offset near the center than near the edges: real, if subtle,
    // uneven pixel density that reads as the video's center being very
    // slightly magnified relative to its own edges. Independent of (and
    // additive to) any UV-mapping/crop concern — a flat plane has zero of
    // this distortion regardless of UV math. Not zeroed outright: a hint
    // of curve still sells "glass tube," just far too little to visibly
    // skew the video's own proportions.
    applyCrtBulge(geo, width, height, Math.min(width, height) * 0.006);
    return geo;
  }, [width, height]);

  // A 1x1 dummy texture — the shader's `uVideoTex` sampler always has SOME
  // bound texture (avoids WebGL "no texture bound to unit" console warnings)
  // even before the real video texture exists; harmless since
  // `uSignalBlend` stays 0 until then, so this value is never actually
  // visible in the final blended color.
  const fallbackTexture = useMemo(() => {
    const data = new Uint8Array([0, 0, 0, 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uVisibility: { value: 1 },
          uSignalBlend: { value: 0 },
          uVideoTex: { value: fallbackTexture },
          uVideoScale: { value: new THREE.Vector2(1, 1) },
          uWidth: { value: width },
          uHeight: { value: height },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fallbackTexture is a stable useMemo, intentionally excluded to avoid material recreation
    [width, height],
  );

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uVisibility.value = visibilityState.value;
    material.uniforms.uSignalBlend.value = signalBlendState.value;
    material.uniforms.uVideoTex.value = videoState.texture ?? fallbackTexture;
    (material.uniforms.uVideoScale.value as THREE.Vector2).set(videoState.scale[0], videoState.scale[1]);
  });

  return <mesh ref={ref} geometry={geometry} material={material} />;
});

export default CrtScreenShard;
