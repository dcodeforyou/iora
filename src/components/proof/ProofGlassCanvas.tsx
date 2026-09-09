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

/** Mobile's glass backdrop — replaces the WebGL "bubble shader" canvas
 * that used to sit here (see the removed ProofBackgroundScene usage
 * below). That canvas still needed to mount, create a WebGL context and
 * compile its shader before painting anything, and real-device reports
 * described exactly that window as the cards visibly "taking time to
 * load"/looking broken — on top of the ongoing per-frame cost of running
 * it continuously for the whole ~500vh Proof section. Pure CSS paints
 * instantly, no mount/compile latency at all.
 *
 * FOUR drifting, different-hued blobs — not GlassPoster's single static
 * gradient, and not just two accent/chalk blobs either (a first pass at
 * this used only those two and read as flat/washed-out next to desktop's
 * real multicolor refraction, reported directly as having lost the one
 * thing this page had going for it). The real WebGL shader this replaces
 * does a genuine multi-hue prism sweep (see backgroundSceneMaterial.ts's
 * own thematicColor) — this is that same "scoped exception to the
 * near-monochrome rule" (per that shader's own comment), approximated
 * with layered gradients instead of a per-pixel hue function. Each blob
 * drifts on its own duration/direction so they never move in lockstep —
 * reads as one continuously shifting field of color, not four separate
 * shapes taking turns.
 *
 * RADIAL-GRADIENT falloff, NOT `filter: blur()` on a solid circle — the
 * single most important detail in this component. An earlier version of
 * exactly this backdrop used four large `blur-[75-85px]` circles, which
 * is precisely the pattern WebKit bug 319187 documents as causing severe
 * iOS rendering stalls with large blurred layers, and it reproduced on
 * real hardware: iPhone 16 Pro Max (larger viewport + 120Hz ProMotion,
 * so bigger blur surfaces AND twice the frames to rasterize them for)
 * showed delayed/blank cards and heavy lag, while iPhone 12 Pro (60Hz,
 * smaller viewport) and an Android/Chromium device were both fine on the
 * same build. ImpactSection.tsx's own glow already documents this exact
 * lesson for this exact codebase ("no filter rasterization cost at all —
 * a real GPU tax on mobile, especially animated via scale/opacity every
 * frame"); this component simply failed to follow it. Baking the falloff
 * into gradient color stops is visually near-identical (a gaussian blur
 * has no hard core either — hence the multi-stop taper rather than two
 * distinct zones) at zero per-frame rasterization cost, which also means
 * the cards' own backdrop-filter has a far cheaper backdrop to resample.
 * Boxes are ~1.5x the old blurred circles' size because a blur visually
 * spreads well past its own box while a gradient cannot.
 *
 * transform+opacity only, compositor-only, genuinely free while
 * scrolling. motion-reduce disables all four loops (matches
 * ResolutionSection's own model-spin convention) — reducedMotion users
 * get the static GlassPoster instead anyway (see the parent's own
 * branch), this is just the same courtesy for anyone whose OS setting
 * this component can't otherwise see. */
/** Shared by both rings below. Hoisted to module scope rather than
 * inlined twice so the two can never drift apart — they are meant to read
 * as the same material seen at two depths, which only holds if the mask
 * profile and hue sweep are literally identical. */
const RING_MASK =
  "radial-gradient(closest-side, transparent 54%, rgba(0,0,0,0.3) 63%, #000 74%, #000 85%, rgba(0,0,0,0.28) 93%, transparent 100%)";

/** Full-spectrum sweep, opening and closing on the brand accent so the
 * loop point is seamless and the palette still reads as ïora's rather
 * than a generic rainbow — the same "scoped exception to the
 * near-monochrome rule" the real shader documents (see
 * backgroundSceneMaterial.ts's thematicColor). */
const RING_CONIC =
  "conic-gradient(from 0deg, rgba(255,78,50,0.58), rgba(255,150,60,0.5), rgba(255,210,79,0.5), rgba(120,230,160,0.46), rgba(79,214,255,0.52), rgba(120,150,255,0.5), rgba(170,130,255,0.5), rgba(255,95,214,0.52), rgba(244,244,242,0.4), rgba(255,78,50,0.58))";

function MobileGlassBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* The circular rainbow RING — desktop's most recognisable feature in
          this section, and the thing mobile visibly lost when the WebGL
          canvas was removed. Rebuilt with no WebGL and, critically, no
          `filter: blur()`:

          - a `conic-gradient` supplies the hue sweep around the circle,
            the same full-spectrum move the real shader makes (see
            backgroundSceneMaterial.ts's thematicColor), including the
            brand accent so it stays on-palette rather than arbitrary;
          - a radial-gradient `mask-image` carves that disc into an
            annulus, with the SOFT EDGES coming from the mask's own stops
            rather than a blur filter — the identical technique used for
            the glow blobs below, and the reason this can exist at all on
            a device that stalled on large blurred layers;
          - `mask-image` specifically (not `clip-path`) also follows the
            precedent AttentionSection documents for its own overlay: it
            rasterizes through a different path and sidesteps a real
            Chromium clip-path compositing bug.

          TWO overlapping, off-centre, ELLIPTICAL rings — not one circle.
          Two earlier attempts were rejected for looking basic: a perfect
          `rounded-full` ring (a rigid wheel of colour), and then a
          blob-shaped one that still read as circular. The reason the
          second failed is worth recording, because it is not obvious:
          `radial-gradient(closest-side, ...)` used as a mask is a perfect
          CIRCLE on a square element, so the mask was re-imposing
          circularity and quietly cancelling out whatever the
          border-radius did. The fix is that the same `closest-side`
          gradient becomes an ELLIPSE the moment the element stops being
          square — so irregularity has to come from the element's own
          proportions, not just its corner radii.

          Each ring is two counter-rotating layers:
            outer = the elliptical/blob outline, turning one way
            inner = the conic hue sweep, turning the other way
          Rotating an asymmetric outline reads as the form morphing rather
          than spinning, and the independently-turning colour underneath
          makes the hues flow THROUGH the shape instead of being welded to
          it. The second ring is offset, differently proportioned, spun
          the opposite way and held at lower opacity, so the two silhouettes
          drift in and out of alignment — that overlap is what produces the
          irregular, metaball-ish read the real WebGL version gets.

          Every period is deliberately non-harmonic (38/24/30/19s) so the
          set never settles into a visible loop.

          Seamlessness is the hard constraint here, and this is built for
          it: every animated layer moves `transform` ONLY. Nothing
          re-rasterizes per frame — no blur, no animated border-radius
          (which WOULD repaint each frame and walk straight back into the
          iOS stall this section was rescued from), no gradient
          regeneration. Inner layers are oversized to 170% so their own
          corners can never rotate into view inside the parent's clip. */}
      <div
        className="absolute left-[48%] top-[47%] h-[90vmin] w-[118vmin] overflow-hidden motion-reduce:animate-none animate-[proof-ring-shape_38s_linear_infinite]"
        style={{
          transform: "translate(-50%, -50%)",
          borderRadius: "62% 38% 52% 48% / 40% 60% 40% 60%",
          maskImage: RING_MASK,
          WebkitMaskImage: RING_MASK,
        }}
        aria-hidden="true"
      >
        <div
          className="absolute left-1/2 top-1/2 h-[170%] w-[170%] motion-reduce:animate-none animate-[proof-ring-hue_24s_linear_infinite]"
          style={{ transform: "translate(-50%, -50%)", background: RING_CONIC }}
        />
      </div>
      <div
        className="absolute left-[56%] top-[56%] h-[104vmin] w-[96vmin] overflow-hidden opacity-60 motion-reduce:animate-none animate-[proof-ring-shape_30s_linear_infinite_reverse]"
        style={{
          transform: "translate(-50%, -50%)",
          borderRadius: "45% 55% 60% 40% / 55% 42% 58% 45%",
          maskImage: RING_MASK,
          WebkitMaskImage: RING_MASK,
        }}
        aria-hidden="true"
      >
        <div
          className="absolute left-1/2 top-1/2 h-[170%] w-[170%] motion-reduce:animate-none animate-[proof-ring-hue_19s_linear_infinite_reverse]"
          style={{ transform: "translate(-50%, -50%)", background: RING_CONIC }}
        />
      </div>
      <div
        className="absolute left-1/4 top-1/3 h-[100vmin] w-[100vmin] -translate-x-1/2 -translate-y-1/2 rounded-full motion-reduce:animate-none animate-[proof-glass-drift_13s_ease-in-out_infinite]"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--color-accent) 30%, transparent) 0%, color-mix(in srgb, var(--color-accent) 25%, transparent) 12%, color-mix(in srgb, var(--color-accent) 18%, transparent) 22%, color-mix(in srgb, var(--color-accent) 11%, transparent) 32%, color-mix(in srgb, var(--color-accent) 6%, transparent) 42%, color-mix(in srgb, var(--color-accent) 2.5%, transparent) 52%, color-mix(in srgb, var(--color-accent) 0.8%, transparent) 64%, transparent 100%)",
        }}
        aria-hidden="true"
      />
      <div
        className="absolute left-[70%] top-[20%] h-[78vmin] w-[78vmin] -translate-x-1/2 -translate-y-1/2 rounded-full motion-reduce:animate-none animate-[proof-glass-drift_17s_ease-in-out_infinite]"
        style={{
          background:
            "radial-gradient(circle, rgba(79,214,255,0.32) 0%, rgba(79,214,255,0.26) 12%, rgba(79,214,255,0.19) 22%, rgba(79,214,255,0.12) 32%, rgba(79,214,255,0.06) 42%, rgba(79,214,255,0.026) 52%, rgba(79,214,255,0.009) 64%, transparent 100%)",
        }}
        aria-hidden="true"
      />
      {/* Two ambient blobs, down from four. The other two (pink, gold)
          existed to carry multi-hue colour back when this backdrop was
          just blobs; the rings above now supply the full spectrum, so
          keeping all four was both redundant and four more animated
          layers competing in the one section that has to stay smooth.
          The surviving accent-orange and cyan pair remain because they
          still do a job the rings don't: a broad, slow, off-centre wash
          of ambient light for the cards' own backdrop-filter to pick up,
          filling the corners the rings never reach. */}
    </div>
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
      {reducedMotion ? (
        <GlassPoster />
      ) : isMobile ? (
        // Real-time full refraction (background-to-FBO + per-card
        // chromatic-aberration sampling) was reported as still-severely
        // laggy on real mobile GPUs across multiple rounds of DPR/
        // resolution/antialias tuning. A lighter WebGL-only tier (just the
        // background bubble shader, no FBO/refraction) replaced it next,
        // but STILL read as slow-to-appear/buggy on real phones — a canvas
        // mount + shader compile is real, visible latency even at this
        // trimmed-down cost, on top of still running every frame for the
        // whole ~500vh section. Mobile now gets no WebGL at all — see
        // MobileGlassBackdrop above, a pure-CSS pair of drifting blurred
        // blobs instead, paints instantly and costs nothing ongoing.
        <MobileGlassBackdrop />
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
