"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useFBO } from "@react-three/drei";
import * as THREE from "three";
import { createLiquidGlassMaterial, type LiquidGlassMaterial } from "./liquidGlassMaterial";
import {
  createBackgroundSceneMaterial,
  type BackgroundSceneMaterial,
} from "./backgroundSceneMaterial";
import { HERO_VIDEO_BREAKPOINT } from "@/lib/scroll/heroEntry";

const subscribeNoop = () => () => {};

/** `matchMedia` reads are client-only and would mismatch server-rendered
 * output if read directly during render — this stays false through the
 * first client render (matching SSR) then flips once React confirms
 * we're on the client, same pattern as ImpactSection's isClient check.
 * Avoids the "no setState directly in an effect" lint rule a plain
 * useState+useEffect mount flag trips. */
function usePrefersReducedMotion() {
  const isClient = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  return isClient && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Same isClient-gated pattern as usePrefersReducedMotion above — this
 * now decides whether a structurally DIFFERENT element renders at all
 * (<GlassPoster/> vs <Canvas>, not just a prop value on an unconditionally-
 * rendered Canvas), so a raw `typeof window !== "undefined"` check (this
 * codebase's OWN earlier version of this exact hook, before this fix) is
 * unsafe here: it evaluates `false` during SSR but the real value on the
 * very first CLIENT render too (window is genuinely defined by then),
 * mismatching what was server-rendered and breaking hydration — confirmed
 * directly (a real hydration error, reproducible on any mobile viewport).
 * useSyncExternalStore's server-snapshot argument is what makes the FIRST
 * client render match the server (both false), with the real value only
 * applying on the following render, after hydration has already
 * succeeded. */
function useIsMobile() {
  const isClient = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  return isClient && window.innerWidth < HERO_VIDEO_BREAKPOINT;
}

export const CARD_COUNT = 3;

/** Plain mutable state ProofSection writes into from its GSAP onUpdate —
 * read every frame inside the canvas, never causes a React re-render (see
 * AGENTS.md: "Update Three.js state through refs/uniforms — no React
 * re-renders per frame"). All positions are in SCREEN px, origin
 * top-left, matching getBoundingClientRect — converted to Three.js world
 * space (origin center, Y-up) inside the orchestrator below. */
export type ProofGlassState = {
  cardCenters: { x: number; y: number }[];
  cardWidth: number;
  cardHeight: number;
  cardRadius: number;
  glowCenter: { x: number; y: number };
  glowIntensity: number;
  glow2Center: { x: number; y: number };
  glow2Intensity: number;
};

export function createProofGlassState(): ProofGlassState {
  return {
    cardCenters: Array.from({ length: CARD_COUNT }, () => ({ x: 0, y: 0 })),
    cardWidth: 448,
    cardHeight: 800,
    cardRadius: 44,
    glowCenter: { x: 0, y: 0 },
    glowIntensity: 0.35,
    glow2Center: { x: 0, y: 0 },
    glow2Intensity: 0.2,
  };
}

/** The scene the glass actually bends — lives OUTSIDE the main R3F tree
 * (a raw THREE.Scene, never auto-rendered by the Canvas) so it can be
 * rendered to an offscreen texture on its own, once per frame, before
 * anything else — see the parent's useFrame(-1) below. */
function useBackgroundScene() {
  const scene = useMemo(() => new THREE.Scene(), []);
  const material = useMemo<BackgroundSceneMaterial>(() => createBackgroundSceneMaterial(), []);
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    meshRef.current = mesh;
    scene.add(mesh);
    return () => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      material.dispose();
    };
  }, [scene, material]);

  return { scene, material, meshRef };
}

function GlassCards({
  state,
  backgroundTexture,
}: {
  state: ProofGlassState;
  backgroundTexture: THREE.Texture;
}) {
  const { size } = useThree();
  const materials = useMemo<LiquidGlassMaterial[]>(
    () => Array.from({ length: CARD_COUNT }, () => createLiquidGlassMaterial()),
    [],
  );
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(() => {
    for (let i = 0; i < CARD_COUNT; i++) {
      const mesh = meshRefs.current[i];
      const material = materials[i];
      if (!mesh || !material) continue;

      const center = state.cardCenters[i];
      // Screen px (origin top-left, Y down) -> Three.js world units
      // (origin center of viewport, Y up) — the orthographic camera
      // below is set up so 1 world unit = 1 screen px.
      const worldX = center.x - size.width / 2;
      const worldY = size.height / 2 - center.y;
      mesh.position.set(worldX, worldY, 0.1);
      mesh.scale.set(state.cardWidth, state.cardHeight, 1);

      // Skip shading entirely for any card that's fully off-screen —
      // this carousel only ever shows one card centered at a time
      // (occasionally two, mid-transition), but all 3 meshes existed
      // and ran their full fragment shader unconditionally regardless:
      // 3 texture samples (chromatic aberration) plus 4 extra SDF
      // evaluations just for the surface normal, EACH, every frame.
      // Pure correctness-preserving — a card outside these bounds was
      // never visually different either way — so this applies on every
      // device, not just mobile, unlike the DPR/resolution trims
      // elsewhere in this file which do trade some visual quality for
      // speed. Roughly halves the average card-shader cost given the
      // carousel's own dwell/transition timing (~66% of scroll time
      // sits in a single-card dwell zone — see ProofSection's
      // DWELL/TRANSITION constants). Small margin so a card doesn't
      // visibly pop the instant it crosses the exact edge.
      const halfW = state.cardWidth / 2;
      const halfH = state.cardHeight / 2;
      const margin = 40;
      const onScreen =
        center.x + halfW > -margin &&
        center.x - halfW < size.width + margin &&
        center.y + halfH > -margin &&
        center.y - halfH < size.height + margin;
      mesh.visible = onScreen;
      if (!onScreen) continue;

      const u = material.uniforms;
      u.uResolution.value.set(state.cardWidth, state.cardHeight);
      u.uRadius.value = state.cardRadius;
      u.uCardScreenCenter.value.set(center.x, center.y);
      u.uViewportSize.value.set(size.width, size.height);
      u.uBackgroundTexture.value = backgroundTexture;
    }
  });

  useEffect(() => {
    return () => {
      materials.forEach((m) => m.dispose());
    };
  }, [materials]);

  return (
    <>
      {materials.map((material, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshRefs.current[i] = el;
          }}
          material={material}
        >
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
    </>
  );
}

/** Renders the background scene to an FBO every frame (before the main
 * pass, via negative useFrame priority), shows that SAME texture as the
 * visible full-viewport backdrop, and hands it to the glass cards for
 * refraction — one source, shown two ways, so what bends through the
 * glass is genuinely the same content visible around it. */
function ProofGlassScene({ state }: { state: ProofGlassState }) {
  const { gl, camera, size, clock } = useThree();
  // HalfFloatType, not the default 8-bit UnsignedByteType — the
  // background shader's gradients are subtle enough (soft diffuse
  // shading, fresnel falloff, iridescence drift) that 256 levels per
  // channel visibly banded, especially in the darker tones most of this
  // scene sits in. Read as "dimple" artifacts at first, survived two
  // separate genuine geometry fixes (exponential smin, simpler wobble)
  // — a real tell it was never the shape's math, it was precision.
  //
  // This whole Canvas is desktop-only now (see ProofGlassCanvas below) —
  // real-time WebGL refraction is the single most expensive thing on
  // this page (a full-viewport procedural shader run every frame,
  // continuously, for the whole time any part of the ~500vh Proof
  // section is on screen), and repeated real-device reports confirmed
  // even an aggressively DPR/resolution-trimmed version of it still
  // wasn't smooth on mobile GPUs. Mobile gets a CSS-only card (see
  // ProofSection's own continuously-playing glimpse video) instead of a
  // cheaper WebGL variant — the earlier mobile-only DPR/FBO-scale
  // tuning that used to live here is gone; there's no mobile path left
  // to tune.
  const fbo = useFBO(Math.max(1, Math.round(size.width)), Math.max(1, Math.round(size.height)), {
    type: THREE.HalfFloatType,
  });
  // The background shader does its own light math in linear space (sums
  // of THREE.Color-derived values, which ColorManagement already stores
  // as linear internally) and writes raw, unencoded output — so the FBO
  // holds LINEAR data, not sRGB. Left at the default, MeshBasicMaterial's
  // automatic texture handling below would assume sRGB-encoded data and
  // double-decode it, which is exactly the kind of mismatch that makes an
  // identical hex value render as a visibly different black on canvas
  // vs. DOM. Marking it explicitly linear fixes that at the source.
  fbo.texture.colorSpace = THREE.LinearSRGBColorSpace;
  const { scene: bgScene, material: bgMaterial, meshRef: bgMeshRef } = useBackgroundScene();
  const backdropRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const bgMesh = bgMeshRef.current;
    if (bgMesh) {
      bgMesh.scale.set(size.width, size.height, 1);
    }
    if (backdropRef.current) {
      backdropRef.current.scale.set(size.width, size.height, 1);
    }

    const u = bgMaterial.uniforms;
    u.uResolution.value.set(size.width, size.height);
    u.uGlowCenter.value.set(state.glowCenter.x, state.glowCenter.y);
    u.uGlowIntensity.value = state.glowIntensity;
    u.uGlow2Center.value.set(state.glow2Center.x, state.glow2Center.y);
    u.uGlow2Intensity.value = state.glow2Intensity;
    // Time-based, independent of scroll — the metaball form keeps
    // flowing even while the page is stationary, and since this scene
    // is re-rendered to the FBO every single frame (not cached), the
    // glass refracts that live motion the same frame it happens.
    u.uTime.value = clock.elapsedTime;

    // Render the background scene into the FBO using the SAME camera as
    // the main pass, so the resulting texture lines up pixel-for-pixel
    // with what the visible backdrop quad below shows.
    const prevTarget = gl.getRenderTarget();
    gl.setRenderTarget(fbo);
    gl.render(bgScene, camera);
    gl.setRenderTarget(prevTarget);
  }, -1);

  return (
    <>
      <mesh ref={backdropRef} position={[0, 0, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={fbo.texture} depthWrite={false} />
      </mesh>
      <GlassCards state={state} backgroundTexture={fbo.texture} />
    </>
  );
}

/** Keeps the orthographic camera's frustum matched to the canvas's actual
 * pixel size on every resize, so 1 world unit stays exactly 1 screen px
 * (needed for pixel-accurate alignment with the DOM cards underneath). */
function ResizeSyncedCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    cam.left = size.width / -2;
    cam.right = size.width / 2;
    cam.top = size.height / 2;
    cam.bottom = size.height / -2;
    cam.near = -1000;
    cam.far = 1000;
    cam.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

function GlassPoster() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "radial-gradient(60% 40% at 50% 40%, color-mix(in srgb, var(--color-accent) 15%, transparent), transparent 70%)",
      }}
    />
  );
}

/** Full-bounds WebGL layer behind Proof's card track — real-time glass
 * refraction (see liquidGlassMaterial.ts) synced pixel-for-pixel to the
 * DOM `.liquid-glass-card` divs via `state`, which ProofSection's own
 * GSAP onUpdate writes into every scroll tick. IntersectionObserver-gated
 * per AGENTS.md: the render loop only runs while this section is
 * actually on screen. */
export default function ProofGlassCanvas({ state }: { state: ProofGlassState }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const isMobile = useIsMobile();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0">
      {reducedMotion || isMobile ? (
        // Mobile gets the cheap CSS poster instead of the WebGL canvas —
        // real-time refraction here (a full-viewport procedural
        // background shader plus per-card chromatic-aberration sampling,
        // run every frame) was reported as still-severely laggy on real
        // mobile GPUs across multiple rounds of DPR/resolution/antialias
        // tuning; the marble that lands on these cards is a trivial CSS
        // transform with zero GPU cost of its own, so its own lag was
        // strong evidence of real GPU contention, not something another
        // tuning pass alone was going to fix. Each card's own visual
        // interest on mobile now comes from its glimpse video playing
        // continuously instead (see ProofSection — no hover to gate it
        // on, on a touch device, so it just plays). Desktop is untouched.
        <GlassPoster />
      ) : (
        <Canvas
          orthographic
          // Trimmed from [1, 1.75] + antialias:true — this canvas renders
          // a full-viewport offscreen background scene into an FBO EVERY
          // single frame (see ProofGlassScene's useFrame), continuously,
          // for the entire time even 1px of this ~500vh section is on
          // screen (threshold: 0 below) — real, sustained GPU cost, not a
          // one-off. MSAA antialiasing on top of that (and on top of a
          // >1x DPR, which already does its own supersampling-like
          // smoothing) was doubling down on the same job for limited
          // visible gain.
          dpr={[1, 1.5]}
          gl={{ antialias: false, alpha: true }}
          frameloop={isVisible ? "always" : "never"}
          fallback={<GlassPoster />}
        >
          <ResizeSyncedCamera />
          <ProofGlassScene state={state} />
        </Canvas>
      )}
    </div>
  );
}
