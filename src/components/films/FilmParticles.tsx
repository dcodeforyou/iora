/**
 * SUPERSEDED — not rendered anywhere.
 *
 * the canvas particle field was replaced by real looping footage
 * (see FilmsVideoBackground). Kept in the tree rather than deleted because
 * the current loops are explicitly a first/proof version: if better footage
 * does not materialise, this is the fallback that already matched the
 * canonical geometry, and rebuilding it from scratch would be expensive.
 * Delete once the video path is settled.
 */

"use client";

import { useEffect, useRef } from "react";

/**
 * Atmospheric particles — three tiers, deliberately sparse.
 *
 * The first version was a single tier of ~48 uniformly-sized dots with
 * halos, which is the "particle demo" look the correction rules out: at
 * that density and evenness it reads as an effect layer rather than as
 * air. Three tiers at a fraction of the count read as depth instead.
 *
 *   Tier 1  14-22 micro dust/stars, 0.7-2.0px, mostly warm off-white.
 *   Tier 2  5-8 soft embers, 2-4px with a small bloom, clustered near the
 *           flare and the glow fields rather than scattered.
 *   Tier 3  2-4 distant blooms, 18-42px at 2-8% opacity. These are not
 *           meant to be seen as particles at all — they are faint depth.
 *
 * Placement avoids the centre band where the hero type sits, because a
 * sparkle behind a headline is the one place it stops being atmosphere and
 * starts being noise.
 *
 * Seeded so the field is identical on every reload: one that reshuffles
 * per visit reads as noise, one that holds still reads as a photograph.
 */

function lcg(seed = 1847) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 4294967296);
}

type P = {
  x: number;
  y: number;
  r: number;
  base: number;
  period: number;
  phase: number;
  hue: "warm" | "gray" | "coral";
  bloom: number;
  twinkles: boolean;
  drift: number;
};

/** Three quiet clusters rather than an even scatter — an even field is
 *  what makes a background read as a starfield preset. Weighted, so the
 *  distribution is asymmetric by construction and not by luck.
 *
 *  Deliberately excluded: the centre band where the headline sits, the
 *  filter row, and the flare's own core. A sparkle behind a headline stops
 *  being atmosphere and becomes noise, and one on the flare fights it. */
const CLUSTERS: readonly (readonly [number, number, number, number, number])[] = [
  // x, y, w, h, weight
  [0.02, 0.04, 0.3, 0.28, 3], // A — upper-left sparse field
  [0.55, 0.3, 0.4, 0.28, 3], // B — centre/right mid-depth, right of the hero
  [0.74, 0.58, 0.26, 0.36, 2], // C — far-right / lower-right
  [0.06, 0.55, 0.2, 0.3, 2], // left-lower, keeps the left side from dying
];
const WEIGHTED: number[] = CLUSTERS.flatMap((c, i) => Array<number>(c[4]).fill(i));

/** Keep-out zones, in the same 0-1 space: the hero headline block and the
 *  filter row. Clusters alone were not enough — three points still landed
 *  behind the headline, because a cluster is a probability, not a promise.
 *  Rejection sampling makes it a guarantee. */
const KEEP_OUT: readonly (readonly [number, number, number, number])[] = [
  [0.3, 0.1, 0.4, 0.38], // hero headline + subline
  [0.14, 0.48, 0.72, 0.1], // filter row
];
const blocked = (x: number, y: number) =>
  KEEP_OUT.some(([kx, ky, kw, kh]) => x > kx && x < kx + kw && y > ky && y < ky + kh);

function build(rand: () => number, count: number, tier: 1 | 2 | 3): P[] {
  const out: P[] = [];
  for (let i = 0; i < count; i++) {
    let x = 0;
    let y = 0;
    // Resample rather than nudge: nudging a rejected point pushes it to the
    // zone's edge, which draws a visible outline around the headline.
    for (let attempt = 0; attempt < 12; attempt++) {
      const [cx, cy, cw, ch] = CLUSTERS[WEIGHTED[Math.floor(rand() * WEIGHTED.length)]];
      x = cx + rand() * cw;
      y = cy + rand() * ch;
      if (!blocked(x, y)) break;
    }
    const roll = rand();
    let r: number;
    if (tier === 1) r = roll < 0.65 ? 0.4 + rand() * 0.2 : roll < 0.9 ? 0.6 + rand() * 0.2 : 0.7 + rand() * 0.1;
    else if (tier === 2) r = 0.9 + rand() * 1;
    else r = 8 + rand() * 9;
    out.push({
      x,
      y,
      r,
      base: tier === 1 ? 0.18 + rand() * 0.37 : tier === 2 ? 0.1 + rand() * 0.12 : 0.02 + rand() * 0.04,
      period: 2400 + rand() * 4100,
      phase: rand() * 6.283,
      hue: tier === 3 ? "coral" : roll < 0.65 ? "warm" : roll < 0.9 ? "gray" : "coral",
      bloom: tier === 1 ? 0 : tier === 2 ? 2 + rand() * 3 : 18 + rand() * 12,
      // Only a MINORITY animates. Everything twinkling at once is what
      // makes a background read as a screensaver, so ~35% twinkle and the
      // rest are simply held at their base opacity.
      twinkles: tier === 1 ? rand() < 0.42 : rand() < 0.34,
      // Only a minority drift, and never fast enough to track.
      drift: tier === 1 && rand() > 0.84 ? 2 + rand() * 2 : 0,
    });
  }
  return out;
}

const COLORS = {
  warm: "255,244,232",
  gray: "226,222,216",
  coral: "255,138,102",
} as const;

export default function FilmParticles({ variant }: { variant: "index" | "banner" | "detail" }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const small = window.matchMedia("(max-width: 767px)").matches;

    // Banner is deliberately calmer than the films page: 6-12 micro,
    // 2-4 embers, 0-2 blooms, per the compact-strip brief.
    const scale = small ? 0.55 : variant === "banner" ? 0.35 : variant === "detail" ? 0.7 : 1;
    const rand = lcg(1847);
    const parts = [
      ...build(rand, Math.round(26 * scale), 1),
      ...build(rand, Math.round(8 * scale), 2),
      ...build(rand, Math.max(2, Math.round(3 * scale)), 3),
    ];

    let raf = 0;
    let last = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      // ~30fps is explicitly enough for atmosphere, and halving the paint
      // rate halves its cost on the devices that need the headroom.
      if (t - last < 33) return;
      last = t;
      ctx.clearRect(0, 0, w, h);

      for (const p of parts) {
        const a =
        reduce || !p.twinkles ? p.base : p.base * (0.8 + 0.2 * Math.sin((t / p.period) * 6.283 + p.phase));
        const x = p.x * w;
        const y = p.y * h + (reduce || !p.drift ? 0 : Math.sin(t / 13000 + p.phase) * p.drift);
        const rgb = COLORS[p.hue];
        if (p.bloom > 0) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, p.r + p.bloom);
          g.addColorStop(0, `rgba(${rgb},${a})`);
          g.addColorStop(1, `rgba(${rgb},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, p.r + p.bloom, 0, 6.283);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(${rgb},${a})`;
          ctx.beginPath();
          ctx.arc(x, y, p.r, 0, 6.283);
          ctx.fill();
        }
      }
    };

    resize();
    window.addEventListener("resize", resize);
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [variant]);

  return <canvas ref={ref} className="film-particles" aria-hidden="true" />;
}
