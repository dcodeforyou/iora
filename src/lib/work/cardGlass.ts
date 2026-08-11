"use client";

import { gsap } from "@/lib/scroll/gsapSetup";
import { isChromiumBrowser } from "@/components/pitch/liquidGlassLens";

/**
 * A STATIC chromatic-refraction glass frame for the /work card grid —
 * same real technique as Pitch's liquidGlassLens.ts (an SVG
 * feDisplacementMap, one pass per RGB channel via feColorMatrix + screen
 * blending — genuine per-channel displacement, not a faked border), just
 * reshaped for a fixed rectangular card instead of a continuously
 * growing circular lens, plus a second, hover-only radial bulge pass for
 * a true fisheye read (see buildBulgeMap below).
 *
 * Both maps are built once, ever, and shared across every card on the
 * page (module-level cache) — neither map's shape ever changes, so
 * there's nothing to regenerate the way Pitch's constantly-growing lens
 * needs to.
 */

let cachedEdgeMapUri: string | null = null;
let cachedBulgeMapUri: string | null = null;

/** Per-pixel, not gradients — the previous version (linear red/blue
 * gradients combined via a "difference" blend, copied from Pitch's own
 * circular lens) produced genuinely UNEQUAL color intensity per side
 * (verified by extracting and looking at the actual generated map:
 * bright magenta left, dark navy right, dark maroon top, bright violet
 * bottom) — "difference" blending two independent gradients doesn't
 * produce a symmetric result just because each gradient individually
 * is linear. That's the real reason refraction only read strongly on
 * top: it wasn't a stretching/aspect-ratio bug, the source colors
 * themselves were unequal.
 *
 * This computes each pixel directly from its own geometry instead,
 * which is symmetric by construction:
 *   - `edgeDist` = distance to the NEAREST of the 4 borders (a plain
 *     min() of 4 numbers — inherently the same formula on every side,
 *     nothing directional baked in).
 *   - `strength` fades from 1 at the border to 0 at `margin` in.
 *   - a corner gets `cornerBoost` added on top when it's close to TWO
 *     borders at once (both an x-border and a y-border), which is what
 *     makes corners read thicker — from the geometry, not a separate
 *     radial-gradient hack that needed aspect-ratio correction.
 *   - direction is push-AWAY-from-center (same outward-radial idea as
 *     the fisheye bulge map below), scaled by that symmetric strength. */
function buildEdgeMap(): string {
  if (cachedEdgeMapUri) return cachedEdgeMapUri;
  const W = 400;
  const H = 300;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const imgData = ctx.createImageData(W, H);
  const data = imgData.data;
  const cx = W / 2;
  const cy = H / 2;
  // A straight edge's falloff reaches `margin` px in. A true corner's
  // falloff reaches `margin + cornerExtra` px in — genuinely FURTHER,
  // not just a stronger value at the same distance (the previous version's
  // bug: `strength` was already clamped to 1.0 right at the edge, so
  // "boosting" it there had nothing left to add — corners and edges read
  // identically up close and only diverged in a range that had already
  // saturated). `cornerFactor` blends smoothly between the two based on
  // how close to an actual corner (near BOTH an x-edge and a y-edge) a
  // pixel is, so a corner's reach tapers into a straight edge's reach
  // rather than snapping between two fixed values.
  const margin = 58;
  const cornerExtra = 60;
  const cornerZone = 130;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dLeft = x;
      const dRight = W - 1 - x;
      const dTop = y;
      const dBottom = H - 1 - y;
      const edgeDist = Math.min(dLeft, dRight, dTop, dBottom);

      const xProx = Math.max(0, 1 - Math.min(dLeft, dRight) / cornerZone);
      const yProx = Math.max(0, 1 - Math.min(dTop, dBottom) / cornerZone);
      const cornerFactor = xProx * yProx; // 1 right at a corner, 0 along a pure straight edge
      const effectiveMargin = margin + cornerFactor * cornerExtra;

      const finalStrength = Math.max(0, 1 - edgeDist / effectiveMargin);

      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      const idx = (y * W + x) * 4;
      data[idx] = Math.max(0, Math.min(255, 128 + nx * finalStrength * 127));
      data[idx + 1] = 128;
      data[idx + 2] = Math.max(0, Math.min(255, 128 + ny * finalStrength * 127));
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const uri = canvas.toDataURL();
  cachedEdgeMapUri = uri;
  return uri;
}

/** A genuine radial vector field, not a gradient approximation — every
 * pixel's displacement is computed from its actual angle and distance
 * from center (real per-pixel trigonometry via ImageData, not a
 * Canvas-gradient trick), the same underlying math a real lens-distortion
 * map needs: direction varies by ANGLE around the center (a simple
 * linear gradient can't express that, only distance-based magnitude
 * can), so every point pushes directly away from the card's own center,
 * quadratically stronger toward the edges — a true barrel/fisheye bulge,
 * not just "blurry in the middle." Only ever applied at scale 0 by
 * default (see applyCardGlassFrame) — invisible at rest, animated in on
 * hover. */
function buildBulgeMap(): string {
  if (cachedBulgeMapUri) return cachedBulgeMapUri;
  const W = 400;
  const H = 300;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const imgData = ctx.createImageData(W, H);
  const data = imgData.data;
  const cx = W / 2;
  const cy = H / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const norm = dist / maxR; // 0 at center, 1 at the farthest corner
      const strength = norm * norm; // quadratic — gentle near center, real bulge at the rim
      const nx = dist > 0 ? dx / dist : 0;
      const ny = dist > 0 ? dy / dist : 0;
      const idx = (y * W + x) * 4;
      data[idx] = Math.max(0, Math.min(255, 128 + nx * strength * 127)); // R = X displacement
      data[idx + 1] = 128;
      data[idx + 2] = Math.max(0, Math.min(255, 128 + ny * strength * 127)); // B = Y displacement
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  const uri = canvas.toDataURL();
  cachedBulgeMapUri = uri;
  return uri;
}

const BULGE_HOVER_SCALE = 34;

let instanceCount = 0;

/** Attaches the glass frame (chromatic edges, always on) plus a
 * hover-animated fisheye bulge to `element`. Call once per card on
 * mount; nothing to update per frame or on resize — both maps are
 * scale-independent (feImage stretches to fill via
 * preserveAspectRatio="none"). Hover listeners are attached to the
 * nearest `<a>`/`.group` ancestor (the actual hoverable card), not
 * `element` itself, since `element` is just the frame overlay div.
 * Returns a cleanup function. */
export function applyCardGlassFrame(element: HTMLElement): () => void {
  if (!isChromiumBrowser) {
    element.style.backdropFilter = "blur(6px) saturate(1.1)";
    element.style.setProperty("-webkit-backdrop-filter", "blur(6px) saturate(1.1)");
    return () => {
      element.style.backdropFilter = "";
      element.style.setProperty("-webkit-backdrop-filter", "");
    };
  }

  const id = `work-card-glass-${++instanceCount}`;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.style.cssText = "position:absolute;width:0;height:0;pointer-events:none;";
  svg.innerHTML = `
    <defs>
      <filter id="${id}" color-interpolation-filters="sRGB" x="-20%" y="-20%" width="140%" height="140%">
        <feImage href="${buildBulgeMap()}" result="bulgeMap" preserveAspectRatio="none" />
        <feDisplacementMap in="SourceGraphic" in2="bulgeMap" xChannelSelector="R" yChannelSelector="B" scale="0" result="bulged" />
        <feImage href="${buildEdgeMap()}" result="edgeMap" preserveAspectRatio="none" />
        <feDisplacementMap in="bulged" in2="edgeMap" xChannelSelector="R" yChannelSelector="B" scale="48" result="dispRed" />
        <feColorMatrix in="dispRed" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red" />
        <feDisplacementMap in="bulged" in2="edgeMap" xChannelSelector="R" yChannelSelector="B" scale="30" result="dispGreen" />
        <feColorMatrix in="dispGreen" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green" />
        <feDisplacementMap in="bulged" in2="edgeMap" xChannelSelector="R" yChannelSelector="B" scale="14" result="dispBlue" />
        <feColorMatrix in="dispBlue" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue" />
        <feBlend in="red" in2="green" mode="screen" result="rg" />
        <feBlend in="rg" in2="blue" mode="screen" />
      </filter>
    </defs>
  `;
  document.body.appendChild(svg);
  const filterUrl = `url(#${id})`;

  // backdrop-filter is genuinely expensive to keep compositing — the
  // browser has to re-sample and re-run this whole multi-pass chain
  // (bulge + 3 chromatic displacement passes + blends) on every frame
  // the element exists, even off-screen, since nothing else tells it
  // the result is currently invisible. Same IntersectionObserver-gating
  // AGENTS.md already prescribes for canvases, applied here: the filter
  // is only actually attached while the card is near the viewport.
  const io = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        element.style.backdropFilter = filterUrl;
        element.style.setProperty("-webkit-backdrop-filter", filterUrl);
      } else {
        element.style.backdropFilter = "";
        element.style.setProperty("-webkit-backdrop-filter", "");
      }
    },
    { rootMargin: "40% 0px" },
  );
  io.observe(element);

  const bulgeDisp = svg.querySelector('feDisplacementMap[result="bulged"]') as SVGFEDisplacementMapElement | null;
  const hoverTarget = element.closest<HTMLElement>("a, .group") ?? element;
  const bulgeState = { scale: 0 };
  const tween = gsap.quickTo(bulgeState, "scale", {
    duration: 0.5,
    ease: "power2.out",
    onUpdate: () => bulgeDisp?.setAttribute("scale", String(bulgeState.scale)),
  });
  const onEnter = () => tween(BULGE_HOVER_SCALE);
  const onLeave = () => tween(0);
  hoverTarget.addEventListener("pointerenter", onEnter);
  hoverTarget.addEventListener("pointerleave", onLeave);

  return () => {
    io.disconnect();
    hoverTarget.removeEventListener("pointerenter", onEnter);
    hoverTarget.removeEventListener("pointerleave", onLeave);
    element.style.backdropFilter = "";
    element.style.setProperty("-webkit-backdrop-filter", "");
    svg.remove();
  };
}
