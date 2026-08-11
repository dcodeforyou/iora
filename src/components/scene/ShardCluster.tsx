"use client";

import { forwardRef, useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Group } from "three";
import GlassShard from "./GlassShard";
import { fracturePane } from "./shardShapes";

type ShardClusterProps = {
  width?: number;
  height?: number;
  shardCount?: number;
  seed?: number;
  /** How many of the largest shards get real transmission material; the
   * rest get the cheap fresnel+envMap fake-glass (see GlassShard.tsx).
   * Previously this had to be kept very small (1-3) because
   * MeshTransmissionMaterial did its own per-instance render-to-texture
   * pass — N high-tier shards meant up to 2N extra full-scene renders/frame.
   * GlassShard.tsx's "high" tier now uses drei's `transmissionSampler` mode,
   * which shares ONE renderer-level transmission buffer across every
   * transmissive object instead of each shard rendering its own — the cost
   * no longer scales with shard count the same way. Still worth keeping
   * deliberate rather than defaulting to "all of them," since it's not
   * literally free (env reflections/distortion are still per-fragment
   * shader cost) — use /lab/shard's Stats HUD to judge the actual number
   * for a given design, don't assume. */
  heroCount?: number;
  /** 0 = resting/tiled pane, 1 = fully shattered outward. Ignored when
   * `explodeState` is provided. */
  explode?: number;
  /** Pre-built mutable state object (e.g. from a GSAP scroll timeline's
   * per-frame orchestrator) — when provided, used directly with zero React
   * re-render coupling, for 60fps scroll-driven updates. The lab route
   * doesn't need this (a slider re-rendering on change is fine); the real
   * scroll-integrated hero does. */
  explodeState?: { value: number };
  /** 0 = at rest, 1 = fully zoomed away — see GlassShard.tsx. Purely
   * pass-through; the lab route doesn't wire this up (no scroll exit beat
   * to drive it in isolation), so it stays undefined there and every
   * GlassShard falls back to its own always-0 default. */
  zoomState?: { value: number };
  /** Normalized -1..1 pointer position, for the settled-shard parallax —
   * see GlassShard.tsx. Same pass-through-only story as zoomState. */
  pointerState?: { x: number; y: number };
};

const ShardCluster = forwardRef<Group, ShardClusterProps>(function ShardCluster(
  {
    width = 3.2,
    height = 3.2,
    shardCount = 11,
    seed = 7,
    heroCount = 3,
    explode = 0,
    explodeState: externalExplodeState,
    zoomState,
    pointerState,
  },
  ref,
) {
  const pieces = useMemo(
    () => fracturePane(width, height, shardCount, seed),
    [width, height, shardCount, seed],
  );

  // "Hero" = largest-footprint shards, ranked by actual polygon area (not
  // id order — fracturePane's ids are assigned by final array position, not
  // by size) — these are the ones most likely to be camera-nearest and get
  // the expensive, best-looking material.
  const heroIds = useMemo(() => {
    const ranked = pieces
      .map((p) => ({ id: p.id, area: Math.abs(THREE.ShapeUtils.area(p.shape.getPoints())) }))
      .sort((a, b) => b.area - a.area);
    return new Set(ranked.slice(0, heroCount).map((p) => p.id));
  }, [pieces, heroCount]);

  // Plain mutable object, not a ref — a GSAP scroll timeline (or this lab's
  // slider) writes `.value` outside of render, and GlassShard reads it every
  // frame in its own useFrame. Stable identity across renders (useMemo, empty
  // deps) so passing it down never re-triggers child effects.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-time seed; explode changes sync via the effect below, not by recreating this object.
  const internalExplodeState = useMemo(() => ({ value: explode }), []);
  useEffect(() => {
    if (!externalExplodeState) internalExplodeState.value = explode;
  }, [explode, externalExplodeState, internalExplodeState]);

  const explodeState = externalExplodeState ?? internalExplodeState;
  const maxRadius = Math.sqrt(width * width + height * height) / 2;

  return (
    <group ref={ref}>
      {pieces.map((piece) => (
        <GlassShard
          key={piece.id}
          piece={piece}
          quality={heroIds.has(piece.id) ? "high" : "low"}
          explodeState={explodeState}
          zoomState={zoomState}
          pointerState={pointerState}
          maxRadius={maxRadius}
        />
      ))}
    </group>
  );
});

export default ShardCluster;
