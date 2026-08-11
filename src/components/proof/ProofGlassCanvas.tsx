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
      {reducedMotion ? (
        <GlassPoster />
      ) : (
        <Canvas
          orthographic
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: true }}
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
