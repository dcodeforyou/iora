/**
 * A growing circular "liquid glass" lens — real optical displacement of
 * whatever's actually behind it (via `backdrop-filter: url(#svg-filter)`
 * + `feDisplacementMap`, three passes at different scales for chromatic
 * aberration at the rim), not a WebGL approximation. This is the ONLY
 * technique that can genuinely bend/melt real DOM content the way the
 * reference footage (gel1.mov/gel2.mov, Apple's "Liquid Glass" look)
 * shows — a WebGL shader can fake the chromatic ring but can't refract
 * real page pixels without capturing them into a texture.
 *
 * Core displacement-map + SVG-filter logic adapted from rizroze/liquid-
 * glass (MIT license, https://github.com/rizroze/liquid-glass) — "matches
 * studio's proven values" per that project's own comments, so the base
 * scale/aberration/border numbers below start from there rather than
 * being guessed. Adapted here for a circle that GROWS continuously
 * (driven by GSAP) rather than a fixed-size pill, with throttled map
 * regeneration since canvas.toDataURL() per frame would be real jank.
 *
 * Chromium only — Safari/Firefox accept `backdrop-filter` but silently
 * drop the SVG portion, leaving a flat blur. That's a real, unavoidable
 * platform gap, not a bug here: those browsers get `fallbackFilter`
 * (plain blur) instead, and the color-flip reveal this lens sits above
 * (see PitchSection's ghost layer) still works independently either way.
 */

export interface GrowingLensOptions {
  /** Base displacement strength in px. Negative = inward refraction
   * (matches the reference's "melt toward center" look). */
  scale?: number;
  /** Per-channel scale offsets [r, g, b] added to `scale` — the actual
   * source of the chromatic fringe (each color channel gets displaced
   * a different amount). */
  aberration?: [number, number, number];
  /** Edge blur (px) for the center-neutralization falloff. */
  blur?: number;
  /** Neutral (clear, non-displaced) zone inset, as a fraction of the
   * lens diameter — this is what keeps the CENTER of the lens clear
   * (per the reference footage) while all the bending happens right at
   * the rim. */
  border?: number;
  lightness?: number;
  alpha?: number;
  /** Non-Chromium fallback — Safari/Firefox get this instead of the
   * real displacement (see file header). */
  fallbackFilter?: string;
  /** Minimum px change in diameter before the (expensive) displacement
   * map is regenerated — the element's own CSS size still updates every
   * call for smooth visual growth; only the costlier SVG map redraw is
   * throttled. This is a FLOOR, not a fixed step: the actual threshold
   * scales up with current size (see `regenStepFraction`), since a fixed
   * px step means a canvas growing toward full viewport coverage
   * (~1800px) regenerates just as often per-px as a small one, and a
   * fixed 6px step over that range is dozens of unnecessary large-canvas
   * toDataURL() calls. */
  regenStepPx?: number;
  /** Regen threshold as a fraction of the CURRENT diameter (default 3%)
   * — visually, "1500px vs 1506px" is imperceptible while "10px vs 16px"
   * is not, so the threshold should grow with size. `regenStepPx` is the
   * floor this fraction can't go below at small sizes. */
  regenStepFraction?: number;
}

export interface GrowingLensInstance {
  /** Grow/shrink the lens to this diameter, in px. Safe to call every
   * frame — internally throttles the expensive part. */
  setDiameter(diameterPx: number): void;
  /** Nudge each RGB channel's displacement scale by a deterministic
   * offset (in px) around its base value — cheap (a plain SVG attribute
   * set, no canvas regen), safe to call every frame. Meant to be driven
   * by a smooth, caller-computed wave (e.g. a decaying sine) over a
   * short window right before the lens fades out, so the channels read
   * as "settling" back into alignment rather than cutting off flatly.
   * Deliberately takes an exact signed offset rather than picking its
   * own randomness — a random per-frame value here reads as a jarring
   * jump, not a wave. Call with 0 to return to the base alignment. */
  jitterAberration(offsetPx: number): void;
  destroy(): void;
  readonly isActive: boolean;
}

// Chromium-based Edge's UA also contains "Chrome/" (same Blink engine,
// same real support for this feature) — so this deliberately does NOT
// try to exclude it, unlike some UA-sniff snippets that filter on "Edg/"
// too. Only Safari/Firefox actually lack support.
export const isChromiumBrowser = typeof navigator !== "undefined" && /Chrome\//.test(navigator.userAgent);

interface ResolvedConfig {
  size: number;
  scale: number;
  border: number;
  lightness: number;
  alpha: number;
  blur: number;
  r: number;
  g: number;
  b: number;
}

const DEFAULTS: Required<Omit<GrowingLensOptions, "fallbackFilter">> = {
  scale: -120,
  aberration: [0, 14, 28],
  blur: 11,
  border: 0.1,
  lightness: 55,
  alpha: 0.85,
  regenStepPx: 6,
  // 0.03 -> 0.09: measured (real GPU Chrome) the forward spread doing a
  // burst of ~60-70ms main-thread hitches throughout the ~1.1s growth —
  // canvas.toDataURL() on the displacement map (which grows to viewport-
  // diagonal size, ~1800px+pad) is synchronous and blocks the frame it
  // runs on; the cache in buildDisplacementMap only helps re-visited
  // sizes (the shrink-back-down reverse direction), not this first
  // forward growth, where every regen is a fresh, uncached, expensive
  // encode. Tripling the threshold cuts the regen COUNT roughly
  // proportionally with no change to the growth curve itself or the
  // final displacement look at any given size — only how often the
  // map is rebuilt along the way, and per the fraction's own original
  // reasoning ("1500px vs 1506px is imperceptible"), the wider gaps this
  // produces are still well under what's visible at these sizes.
  regenStepFraction: 0.09,
};

const mapCache = new Map<string, string>();

/** Same drawing recipe as the source project: neutral gray everywhere
 * (zero displacement), a red horizontal + blue vertical gradient inside
 * the circle (the actual X/Y displacement field), then a blurred,
 * inset, semi-opaque circle layered on top to neutralize the CENTER —
 * this asymmetry (sharp field at the rim, flattened in the middle) is
 * exactly what makes the distortion concentrate at the edge instead of
 * smearing evenly across the whole lens. */
function buildDisplacementMap(c: ResolvedConfig): string {
  const key = `${c.size}:${c.scale}:${c.border}:${c.blur}:${c.lightness}:${c.alpha}`;
  const cached = mapCache.get(key);
  if (cached) return cached;

  const maxDisplace = Math.max(Math.abs(c.scale) * 0.5, 20);
  const pad = Math.ceil(maxDisplace);
  const total = c.size + pad * 2;

  const canvas = document.createElement("canvas");
  canvas.width = total;
  canvas.height = total;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "rgb(128, 128, 128)";
  ctx.fillRect(0, 0, total, total);

  const o = pad;
  ctx.save();
  ctx.beginPath();
  ctx.arc(o + c.size / 2, o + c.size / 2, c.size / 2, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = "#000000";
  ctx.fillRect(o, o, c.size, c.size);

  const redGrad = ctx.createLinearGradient(o + c.size, o, o, o);
  redGrad.addColorStop(0, "#000000");
  redGrad.addColorStop(1, "#ff0000");
  ctx.fillStyle = redGrad;
  ctx.fillRect(o, o, c.size, c.size);

  ctx.globalCompositeOperation = "difference";
  const blueGrad = ctx.createLinearGradient(o, o, o, o + c.size);
  blueGrad.addColorStop(0, "#000000");
  blueGrad.addColorStop(1, "#0000ff");
  ctx.fillStyle = blueGrad;
  ctx.fillRect(o, o, c.size, c.size);

  ctx.globalCompositeOperation = "source-over";
  const borderPx = c.size * (c.border * 0.5);
  ctx.filter = `blur(${c.blur}px)`;
  ctx.fillStyle = `hsla(0, 0%, ${c.lightness}%, ${c.alpha})`;
  ctx.beginPath();
  ctx.arc(o + c.size / 2, o + c.size / 2, c.size / 2 - borderPx, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  const uri = canvas.toDataURL();
  mapCache.set(key, uri);
  return uri;
}

let instanceCount = 0;

function createFilterSVG(id: string) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.style.cssText = "position:absolute;width:0;height:0;pointer-events:none;";
  svg.innerHTML = `
    <defs>
      <filter id="${id}" color-interpolation-filters="sRGB" x="-50%" y="-50%" width="200%" height="200%">
        <feImage result="map" preserveAspectRatio="none" />
        <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" result="dispRed" />
        <feColorMatrix in="dispRed" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red" />
        <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" result="dispGreen" />
        <feColorMatrix in="dispGreen" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green" />
        <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" result="dispBlue" />
        <feColorMatrix in="dispBlue" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue" />
        <feBlend in="red" in2="green" mode="screen" result="rg" />
        <feBlend in="rg" in2="blue" mode="screen" />
      </filter>
    </defs>
  `;
  const filter = svg.querySelector("filter") as SVGFilterElement;
  const feImage = svg.querySelector("feImage") as SVGFEImageElement;
  const [dispRed, dispGreen, dispBlue] = Array.from(
    svg.querySelectorAll("feDisplacementMap"),
  ) as SVGFEDisplacementMapElement[];
  return { svg, filter, feImage, dispRed, dispGreen, dispBlue };
}

export function createGrowingLens(
  element: HTMLElement,
  options: GrowingLensOptions = {},
): GrowingLensInstance {
  const opts = { ...DEFAULTS, ...options };
  const fallback = options.fallbackFilter ?? "blur(14px)";

  if (!isChromiumBrowser) {
    element.style.backdropFilter = fallback;
    element.style.setProperty("-webkit-backdrop-filter", fallback);
    return {
      isActive: false,
      setDiameter(diameterPx: number) {
        element.style.width = `${diameterPx}px`;
        element.style.height = `${diameterPx}px`;
      },
      jitterAberration() {
        // No per-channel displacement exists on this fallback (plain
        // blur() only) — nothing to jitter.
      },
      destroy() {
        element.style.backdropFilter = "";
        element.style.setProperty("-webkit-backdrop-filter", "");
      },
    };
  }

  const id = `pitch-liquid-lens-${++instanceCount}`;
  const refs = createFilterSVG(id);
  document.body.appendChild(refs.svg);
  element.style.backdropFilter = `url(#${id})`;
  element.style.setProperty("-webkit-backdrop-filter", `url(#${id})`);

  let lastRegenSize = -Infinity;

  const regen = (size: number) => {
    lastRegenSize = size;
    const config: ResolvedConfig = {
      size,
      scale: opts.scale,
      border: opts.border,
      lightness: opts.lightness,
      alpha: opts.alpha,
      blur: opts.blur,
      r: opts.aberration[0],
      g: opts.aberration[1],
      b: opts.aberration[2],
    };
    const uri = buildDisplacementMap(config);
    refs.feImage.setAttributeNS("http://www.w3.org/1999/xlink", "href", uri);
    refs.feImage.setAttribute("href", uri);
    refs.dispRed.setAttribute("scale", String(config.scale + config.r));
    refs.dispGreen.setAttribute("scale", String(config.scale + config.g));
    refs.dispBlue.setAttribute("scale", String(config.scale + config.b));
  };

  return {
    isActive: true,
    setDiameter(diameterPx: number) {
      const size = Math.max(1, Math.round(diameterPx));
      element.style.width = `${size}px`;
      element.style.height = `${size}px`;
      const threshold = Math.max(opts.regenStepPx, size * opts.regenStepFraction);
      if (Math.abs(size - lastRegenSize) >= threshold) {
        regen(size);
      }
    },
    jitterAberration(offsetPx: number) {
      // Red and green pushed in opposite directions (a real relative
      // shift in fringe width, not just all three sliding together —
      // equal shifts wouldn't change how misaligned the channels look
      // at all), blue at a fraction so the three don't all bottom out
      // in lockstep.
      refs.dispRed.setAttribute("scale", String(opts.scale + opts.aberration[0] + offsetPx));
      refs.dispGreen.setAttribute("scale", String(opts.scale + opts.aberration[1] - offsetPx));
      refs.dispBlue.setAttribute("scale", String(opts.scale + opts.aberration[2] + offsetPx * 0.6));
    },
    destroy() {
      refs.svg.remove();
      element.style.backdropFilter = "";
      element.style.setProperty("-webkit-backdrop-filter", "");
    },
  };
}

