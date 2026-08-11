import * as THREE from "three";
import { createNoise2D } from "simplex-noise";

/**
 * Procedural glass-pane fracture. No model, no image — a rectangular pane is
 * recursively split by random straight cuts (Sutherland-Hodgman polygon
 * clipping) until it holds `shardCount` irregular convex pieces. Same family
 * of technique as dental-website's toothShape.ts (a hand-authored THREE.Shape
 * extruded with a bevel) — here the shapes are generated, not hand-drawn,
 * because we need N pieces whose edges actually fit together as one crack
 * pattern, not one fixed silhouette.
 */

export type ShardPiece = {
  id: number;
  /** Shape in shard-local space (already offset so its own centroid is the origin) — extrude this directly. */
  shape: THREE.Shape;
  /** Where this shard sits in pane space at rest — also doubles as the outward "explode" direction. */
  centroid: THREE.Vector2;
};

type Poly = THREE.Vector2[];

// Deterministic PRNG (mulberry32) — the crack pattern must be stable across
// server/client renders (no hydration mismatch) and reproducible by seed.
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function polygonArea(pts: Poly): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    a += p1.x * p2.y - p2.x * p1.y;
  }
  return a / 2;
}

function polygonCentroid(pts: Poly): THREE.Vector2 {
  const area = polygonArea(pts);
  if (Math.abs(area) < 1e-6) {
    // Degenerate sliver — fall back to a plain average rather than divide by ~0.
    const avg = new THREE.Vector2();
    pts.forEach((p) => avg.add(p));
    return avg.divideScalar(pts.length);
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const cross = p1.x * p2.y - p2.x * p1.y;
    cx += (p1.x + p2.x) * cross;
    cy += (p1.y + p2.y) * cross;
  }
  const factor = 1 / (6 * area);
  return new THREE.Vector2(cx * factor, cy * factor);
}

/** Sutherland-Hodgman: keep the part of `pts` where normal·p >= constant. */
function clipPolygon(pts: Poly, normal: THREE.Vector2, constant: number): Poly {
  const result: Poly = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const current = pts[i];
    const prev = pts[(i - 1 + n) % n];
    const currentSide = normal.dot(current) - constant;
    const prevSide = normal.dot(prev) - constant;
    const currentInside = currentSide >= 0;
    const prevInside = prevSide >= 0;
    if (currentInside !== prevInside) {
      const t = prevSide / (prevSide - currentSide);
      result.push(prev.clone().lerp(current, t));
    }
    if (currentInside) result.push(current.clone());
  }
  return result;
}

function boundingBox(pts: Poly) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  pts.forEach((p) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });
  return { minX, maxX, minY, maxY };
}

/** Splits `pts` in two along a random line through its bounding box. Retries a few times to avoid a degenerate (missed) cut; returns null if it can't find a valid split. */
function splitPolygon(pts: Poly, rand: () => number): [Poly, Poly] | null {
  const { minX, maxX, minY, maxY } = boundingBox(pts);
  for (let attempt = 0; attempt < 8; attempt++) {
    const point = new THREE.Vector2(
      minX + rand() * (maxX - minX),
      minY + rand() * (maxY - minY),
    );
    const angle = rand() * Math.PI;
    const normal = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
    const constant = normal.dot(point);
    const a = clipPolygon(pts, normal, constant);
    const b = clipPolygon(pts, normal.clone().negate(), -constant);
    if (a.length >= 3 && b.length >= 3) return [a, b];
  }
  return null;
}

/**
 * Clips a small flat facet off some corners instead of leaving a perfectly
 * sharp vertex — real broken glass corners chip, they don't stay razor
 * points. Deterministic per-polygon via `rand`, not every corner (a chip on
 * every single vertex reads as "rounded," not "broken").
 */
function chipCorners(points: Poly, rand: () => number, chance = 0.5, amount = 0.1): Poly {
  const n = points.length;
  const result: Poly = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    if (rand() < chance) {
      const towardPrev = curr.clone().lerp(prev, amount * (0.5 + rand() * 0.7));
      const towardNext = curr.clone().lerp(next, amount * (0.5 + rand() * 0.7));
      result.push(towardPrev, towardNext);
    } else {
      result.push(curr.clone());
    }
  }
  return result;
}

/**
 * Subdivides each edge and displaces the new points along the edge normal
 * with seeded simplex noise — turns a razor-straight polygon edge into the
 * slightly jagged, uneven line real fracture surfaces actually have. Noise
 * (not per-point random) so neighboring points on the same edge displace
 * smoothly instead of spiking every vertex independently.
 */
function roughenEdges(points: Poly, noise2D: (x: number, y: number) => number, roughness = 0.038): Poly {
  const n = points.length;
  const result: Poly = [];
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const edgeLen = a.distanceTo(b);
    const segments = Math.min(4, Math.max(1, Math.round(edgeLen / 0.22)));
    const dir = b.clone().sub(a).normalize();
    const normal = new THREE.Vector2(-dir.y, dir.x);
    result.push(a.clone());
    for (let s = 1; s < segments; s++) {
      const t = s / segments;
      const point = a.clone().lerp(b, t);
      // Two octaves: a broader wander plus sharper high-frequency micro-jag
      // on top — a single smooth octave reads as "wavy coastline," not
      // "cracked glass."
      const broad = noise2D(point.x * 9, point.y * 9);
      const micro = noise2D(point.x * 27 + 100, point.y * 27 + 100);
      const jag = broad * 0.7 + micro * 0.3;
      point.addScaledVector(normal, jag * roughness);
      result.push(point);
    }
  }
  return result;
}

export function fracturePane(
  width: number,
  height: number,
  shardCount = 10,
  seed = 1,
): ShardPiece[] {
  const rand = mulberry32(seed);
  const polys: Poly[] = [
    [
      new THREE.Vector2(-width / 2, -height / 2),
      new THREE.Vector2(width / 2, -height / 2),
      new THREE.Vector2(width / 2, height / 2),
      new THREE.Vector2(-width / 2, height / 2),
    ],
  ];

  while (polys.length < shardCount) {
    // Always split the largest remaining piece — keeps shards reasonably
    // even-sized instead of spiraling into slivers.
    let idx = 0;
    let maxArea = -Infinity;
    polys.forEach((p, i) => {
      const a = Math.abs(polygonArea(p));
      if (a > maxArea) {
        maxArea = a;
        idx = i;
      }
    });
    const split = splitPolygon(polys[idx], rand);
    if (!split) break; // can't find a clean cut anywhere — stop with what we have
    polys.splice(idx, 1, split[0], split[1]);
  }

  // One noise field shared across all shards (seeded, deterministic) so
  // adjoining edges from the same original cut still jag in a visually
  // related way rather than each shard inventing unrelated noise.
  const noise2D = createNoise2D(mulberry32(seed + 1));

  return polys.map((poly, id) => {
    // Sharp polygon -> chipped corners -> jagged edges -> THEN centroid,
    // so the centroid (used for explosion direction) reflects the final
    // silhouette, not the pre-roughened one.
    const chipped = chipCorners(poly, mulberry32(seed * 97 + id * 13));
    const rough = roughenEdges(chipped, noise2D);
    const centroid = polygonCentroid(rough);
    // Inset toward centroid — leaves a hairline gap between resting shards,
    // so the crack pattern reads even before anything "explodes" outward.
    const inset = rough.map((p) => p.clone().lerp(centroid, 0.035));
    const shape = new THREE.Shape(inset.map((p) => p.clone().sub(centroid)));
    return { id, shape, centroid };
  });
}

export function createShardGeometry(shape: THREE.Shape, depth = 0.07, variantSeed = 0): THREE.ExtrudeGeometry {
  // Small per-shard bevel variation (not a fixed constant everywhere) so 11
  // shards don't read as stamped from the same die.
  const rand = mulberry32(variantSeed * 733 + 1);
  const bevelThickness = 0.014 + rand() * 0.014;
  const bevelSize = 0.01 + rand() * 0.012;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 2, // faceted, not rounded — reads as cut/broken glass, not a soft blob
    curveSegments: 1, // shape outline is already explicit line segments (see roughenEdges) — nothing to tessellate
  });
  geometry.center();
  return geometry;
}
