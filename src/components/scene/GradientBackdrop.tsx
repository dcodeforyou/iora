"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type GradientBackdropProps = {
  /** Plane width/height in scene units, used when `width`/`height` aren't
   * given — a plain square, which is what every non-video caller (just
   * /lab/shard right now) still wants for the symmetric procedural glow. */
  size?: number;
  width?: number;
  height?: number;
  position?: [number, number, number];
  /** Plain mutable object (not React state) so a future scroll timeline can
   * dim this plane every frame with zero re-renders — same pattern as
   * dental-website's GradientBackdrop. Defaults to a stable module-level
   * constant so passing nothing never re-triggers effects. */
  dimState?: { value: number };
  /** Plain mutable object (not React state — same "no re-renders per
   * frame" rule as CrtScreenShard's own videoState), read every frame in
   * useFrame below. `.scale` is CONTAIN-fit (>=1 on the letterboxed axis)
   * — the exact same object CrtScreenShard's own videoState uses, safe to
   * share directly since this plane is sized to the same aspect (see
   * HeroScene.tsx's SceneContent). When `.texture` is set, THIS is what
   * every shard refracts/reflects/alpha-blends against instead of the
   * procedural grey glow — the whole reason the live hero video stays
   * visible after the CRT screen breaks (MeshTransmissionMaterial's
   * shared transmission buffer, see GlassShard.tsx, captures whatever
   * else is in the scene). Left at its default (`.texture: null`) for
   * every OTHER caller (currently just /lab/shard) falls back to the
   * procedural gradient below, unchanged. */
  videoState?: { texture: THREE.Texture | null; scale: [number, number] };
  /** 0 = nothing is covering this plane, safe to show video. Hero passes
   * its own `screenState` directly (1 = CRT screen fully whole/covering,
   * 0 = fully broken) — must match the exact threshold Orchestrator uses
   * to reveal the shard cluster itself (`screen < 0.999`), NOT a looser
   * one: shards become visible the instant the screen starts cracking at
   * all, so anything looser leaves a window where shards float over the
   * still-grey backdrop instead of the video. Defaults to always-show-
   * video for any caller with no screen of its own to hide behind. */
  coverState?: { value: number };
};

const FULL_DIM = { value: 1 };
const NO_COVER = { value: 0 };
const NO_VIDEO: { texture: THREE.Texture | null; scale: [number, number] } = { texture: null, scale: [1, 1] };

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  uniform float uShowVideo;
  uniform sampler2D uGreyTex;
  uniform sampler2D uVideoTex;
  uniform vec2 uVideoScale;
  varying vec2 vUv;

  void main() {
    vec4 greyColor = texture2D(uGreyTex, vUv);

    // Same CONTAIN-fit as CrtScreenShard's own shader — the whole video
    // frame, zero crop, zero stretch. Solid black (not transparent, not
    // smeared) outside the actual frame on the letterboxed axis — classic
    // TV letterbox bars, matching CrtScreenShard's own treatment exactly
    // so the two never visibly disagree.
    vec2 videoUv = (vUv - 0.5) * uVideoScale + 0.5;
    vec3 sampledColor = texture2D(uVideoTex, clamp(videoUv, 0.0, 1.0)).rgb;
    float inBounds = step(0.0, videoUv.x) * step(videoUv.x, 1.0) * step(0.0, videoUv.y) * step(videoUv.y, 1.0);
    vec3 videoColor = mix(vec3(0.0), sampledColor, inBounds);

    vec3 color = mix(greyColor.rgb, videoColor, uShowVideo);
    float alpha = mix(greyColor.a, 1.0, uShowVideo);

    gl_FragColor = vec4(color, alpha * uOpacity);
  }
`;

/**
 * MeshTransmissionMaterial refracts whatever is behind it — with nothing
 * back there it reads as flat black. This plane gives every shard something
 * bright to bend. On the real site (Hero), that "something" is the live
 * hero video once it's playing (see `videoState` above) — the procedural
 * Canvas2D gradient below (a whisper of ice-blue, not pure white/grey —
 * flat neutral reads as dull, this reads as pristine) is now only ever the
 * fallback for callers with no video at all (/lab/shard).
 *
 * A raw ShaderMaterial (not meshBasicMaterial) for the exact same reason as
 * CrtScreenShard: a built-in material's automatic sRGB texture handling,
 * combined with a video texture uploaded with an sRGB-aware GPU internal
 * format, was producing a systematically washed-out/whitish result — GPU
 * texture units auto-linearize samples from an sRGB-format texture
 * regardless of which shader reads them, and without a matching output
 * re-encode step the result reads too bright/flat everywhere the video
 * shows, not just where shards overlap it. Sampling and writing raw bytes
 * directly (no color-space math at all) sidesteps the whole question:
 * texture in, same bytes out.
 */
export default function GradientBackdrop({
  size = 6,
  width = size,
  height = size,
  position = [0, 0, -1.4],
  dimState = FULL_DIM,
  videoState = NO_VIDEO,
  coverState = NO_COVER,
}: GradientBackdropProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const greyTexture = useMemo(() => {
    const res = 512;
    const canvas = document.createElement("canvas");
    canvas.width = res;
    canvas.height = res;
    const ctx = canvas.getContext("2d")!;

    // Centered at (0.5, 0.5) — was (0.5, 0.42), a "light from above" offset
    // inherited from the reference this was adapted from, which read as
    // simply off-center here since nothing else in this scene motivates an
    // asymmetric key light.
    const gradient = ctx.createRadialGradient(
      res * 0.5,
      res * 0.5,
      res * 0.03,
      res * 0.5,
      res * 0.5,
      res * 0.42,
    );
    // Every stop uses the SAME rgb triplet — only alpha changes. The
    // previous version interpolated color AND alpha together through
    // white -> light-blue -> dark-grey -> transparent-black, and that hue
    // drift through low-alpha regions is exactly what shows up as visible
    // color fringing/banding (reported as "yellow dots") on Safari/mobile's
    // canvas color handling. A single-hue alpha-only ramp has no color to
    // fringe, regardless of the exact underlying cause.
    gradient.addColorStop(0, "rgba(245, 250, 255, 1)");
    gradient.addColorStop(0.4, "rgba(245, 250, 255, 0.55)");
    gradient.addColorStop(0.7, "rgba(245, 250, 255, 0.15)");
    gradient.addColorStop(1, "rgba(245, 250, 255, 0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, res, res);

    // Dithering: nudge every pixel's RGB by a small random amount before
    // upload. This is the universal fix for 8-bit gradient banding/color
    // fringing regardless of which part of the pipeline causes it (canvas
    // color management, sRGB decode precision, GPU-specific rounding) — it
    // can't be diagnosed further without a real Safari device to inspect,
    // so this targets the symptom directly rather than guessing at a cause
    // a second time.
    const imageData = ctx.getImageData(0, 0, res, res);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      // Deterministic hash, not Math.random() — same pattern as
      // shardShapes.ts. Dithering just needs per-pixel variation, not true
      // randomness, and this keeps the texture generation a pure function
      // of nothing (safe inside useMemo).
      const h = Math.sin(i * 12.9898) * 43758.5453;
      const noise = ((h - Math.floor(h)) - 0.5) * 6;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    }
    ctx.putImageData(imageData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    // Raw pass-through, not SRGBColorSpace — see this file's own doc
    // comment on why a custom shader needs NoColorSpace to avoid the GPU
    // auto-linearizing samples with no matching output re-encode.
    tex.colorSpace = THREE.NoColorSpace;
    // No mipmaps: a sharp-alpha gradient like this can ring at downsampled
    // mip levels (Gibbs-phenomenon-style artifacts), another possible
    // source of stray colored specks on some GPUs/mobile browsers. This
    // plane is never viewed at a demanding minified angle, so there's no
    // real cost to just not generating them.
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }, []);

  const fallbackVideoTexture = useMemo(() => {
    const data = new Uint8Array([0, 0, 0, 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uOpacity: { value: 1 },
          uShowVideo: { value: 0 },
          uGreyTex: { value: greyTexture },
          uVideoTex: { value: fallbackVideoTexture },
          uVideoScale: { value: new THREE.Vector2(1, 1) },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable useMemo textures, intentionally excluded to avoid material recreation
    [],
  );

  useFrame(() => {
    material.uniforms.uOpacity.value = dimState.value;
    const video = videoState.texture;
    const showVideo = video && coverState.value < 0.999;
    material.uniforms.uShowVideo.value = showVideo ? 1 : 0;
    material.uniforms.uVideoTex.value = video ?? fallbackVideoTexture;
    (material.uniforms.uVideoScale.value as THREE.Vector2).set(videoState.scale[0], videoState.scale[1]);
  });

  return (
    <mesh position={position}>
      <planeGeometry args={[width, height]} />
      <primitive object={material} ref={materialRef} attach="material" />
    </mesh>
  );
}
