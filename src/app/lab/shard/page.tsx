"use client";

import { Suspense, useState, useSyncExternalStore } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls, Stats, useDetectGPU } from "@react-three/drei";
import ShardCluster from "@/components/scene/ShardCluster";
import GradientBackdrop from "@/components/scene/GradientBackdrop";
import StudioLights from "@/components/scene/StudioLights";

const subscribeNoop = () => () => {};

/** `useDetectGPU` does real browser GPU probing (WebGL context/extension
 * checks) — server and client resolve different tiers, which threw a
 * hydration mismatch when this rendered unconditionally. Same pattern as
 * ImpactSection/ProofGlassCanvas's own isClient checks: stays false through
 * the first client render (matching SSR) then flips once React confirms
 * we're on the client. */
function useIsClient() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

// Suspense-gated (useDetectGPU is backed by suspend-react) — isolated in its
// own tiny component so its Suspense boundary doesn't also cover the whole
// scene below, which already has its own fallback={null} for asset loading.
function GpuTierReadout() {
  const gpu = useDetectGPU();
  return (
    <p className="normal-case tracking-normal text-chalk-muted">
      Detected GPU tier: {gpu.tier} {gpu.isMobile ? "(mobile)" : "(desktop)"} — {gpu.gpu ?? "unknown"}
    </p>
  );
}

function ShardPoster() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="h-64 w-64 rounded-3xl bg-gradient-to-br from-glass-glow/30 to-transparent blur-2xl" />
    </div>
  );
}

/**
 * Isolated scene-lab route — dev-only inspection tool to prove the shard
 * material/fracture reads as convincing broken glass in total isolation,
 * before any scroll integration exists. Never linked from the real site nav
 * (see AGENTS.md verification checklist).
 */
export default function ShardLabPage() {
  const [explode, setExplode] = useState(0.35);
  const [shardCount, setShardCount] = useState(11);
  const [seed, setSeed] = useState(7);
  const [heroCount, setHeroCount] = useState(3);
  const isClient = useIsClient();

  return (
    <main className="relative h-svh w-full overflow-hidden bg-ink">
      <div className="pointer-events-none absolute left-6 top-6 z-10 font-mono-kicker text-[11px] uppercase tracking-[0.2em] text-chalk-muted">
        [ scene-lab / shard ] — dev only
      </div>

      <div className="absolute bottom-6 left-6 z-10 flex w-72 flex-col gap-4 rounded-xl border border-white/10 bg-ink-soft/80 p-4 font-mono-kicker text-[11px] uppercase tracking-[0.15em] text-chalk backdrop-blur">
        <label className="flex flex-col gap-1">
          explode: {explode.toFixed(2)}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={explode}
            onChange={(e) => setExplode(Number(e.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1">
          shard count: {shardCount}
          <input
            type="range"
            min={4}
            max={20}
            step={1}
            value={shardCount}
            onChange={(e) => setShardCount(Number(e.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1">
          seed: {seed}
          <input
            type="range"
            min={1}
            max={50}
            step={1}
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1">
          hero (high-tier) shards: {heroCount} / {shardCount}
          <input
            type="range"
            min={0}
            max={shardCount}
            step={1}
            value={Math.min(heroCount, shardCount)}
            onChange={(e) => setHeroCount(Number(e.target.value))}
          />
        </label>
        <p className="normal-case tracking-normal text-chalk-muted">
          High tier = real transmission (chromatic aberration, distortion,
          refraction) via drei&apos;s shared `transmissionSampler` mode — ONE
          renderer-level buffer shared across every high-tier shard, not one
          FBO render per shard like before. Low tier = no transmission at
          all, cheap fresnel+envMap fake-glass. Push hero count up and watch
          the FPS counter (top-left) — this used to visibly stall past ~3.
        </p>
        <p className="normal-case tracking-normal text-chalk-muted">
          Drag to orbit. This route proves the material/fracture in isolation
          — no scroll wiring yet.
        </p>
        {isClient && (
          <Suspense fallback={null}>
            <GpuTierReadout />
          </Suspense>
        )}
      </div>

      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 6], fov: 40 }}
        gl={{ antialias: true, alpha: true }}
        fallback={<ShardPoster />}
        onCreated={(state) => {
          // THREE's OWN shared transmission render target (what
          // `transmissionSampler` mode reads from) defaults to full
          // viewport resolution — capping this is the other half of the
          // fix alongside `transmissionSampler` itself: sharing one buffer
          // instead of N is the big win, but that one shared buffer still
          // shouldn't render at full-viewport res every frame either.
          state.gl.transmissionResolutionScale = 0.4;
        }}
      >
        <Stats className="!absolute !left-6 !top-16" />
        <ambientLight intensity={1.2} />
        <directionalLight position={[3, 4, 5]} intensity={1} />
        <GradientBackdrop />
        <Suspense fallback={null}>
          <ShardCluster
            width={3.2}
            height={3.2}
            shardCount={shardCount}
            seed={seed}
            explode={explode}
            heroCount={heroCount}
          />
          <Environment resolution={256}>
            <StudioLights />
          </Environment>
        </Suspense>
        <OrbitControls enablePan={false} minDistance={3} maxDistance={12} />
      </Canvas>
    </main>
  );
}
