/**
 * SUPERSEDED — not rendered anywhere.
 *
 * the code-drawn SVG atmosphere was replaced by real looping footage
 * (see FilmsVideoBackground). Kept in the tree rather than deleted because
 * the current loops are explicitly a first/proof version: if better footage
 * does not materialise, this is the fallback that already matched the
 * canonical geometry, and rebuilding it from scratch would be expensive.
 * Delete once the video path is settled.
 */

import { Fragment } from "react";
import FilmParticles from "./FilmParticles";

/**
 * The films-world background.
 *
 * ── WHY AN SVG ARTBOARD AND NOT CSS BOXES ─────────────────────────────
 * The first version drew the arc as a CSS div with `border-radius: 50%`
 * sized in `vw`. It scaled with the viewport, so the same proportion of
 * the ring stayed visible at every width — which is exactly why it read as
 * a centred graphic circle rather than an orbital horizon.
 *
 * This is one fixed 1672x941 artboard with `preserveAspectRatio="…slice"`,
 * and that is the whole fix. The circle is authored once at its canonical
 * coordinates and the viewport CROPS it: on a wide screen you get the upper
 * sweep and the right continuation, on a taller one a different segment,
 * and the geometry never changes. The circle is larger than the frame by
 * design and most of it is meant to sit outside.
 *
 * ── WHY FIVE STROKES ──────────────────────────────────────────────────
 * A single 1px border reads as a line drawing. The perceived arc is one
 * crisp rim carried by four progressively wider, blurrier, dimmer strokes
 * of the SAME circle — deep halo, corona, body, rim, inner highlight.
 * Depth comes from the stack, not from thickness.
 *
 * Everything here is decorative: aria-hidden on the wrapper,
 * pointer-events:none in CSS, and no layer may intercept a click.
 */

const CX = 745;
const CY = 690;
const R = 651;

/**
 * Fume clusters along the arc.
 *
 * One evenly-blurred band around the whole circle is what made the arc read
 * as a polished graphic stroke: identical diffusion everywhere is the
 * signature of a filter, not of atmosphere. Real orbital haze is local —
 * dense in places, absent in others, moving at different rates.
 *
 * So the band is broken into six independently masked clusters positioned
 * at real points ON the circle (angles below), each with its own density,
 * spread, turbulence and drift duration. `density` follows the brief's
 * activity map: quiet at the far upper-left, peaking at the flare, tailing
 * off on the lower-right.
 */
const FUME_CLUSTERS = [
  // deg along the circle, cluster radius, density (0-1), turbulence freq,
  // displacement scale, blur, seconds per drift cycle
  { deg: 195, r: 210, density: 0.2, freq: "0.006 0.014", scale: 10, blur: 18, dur: 26 },
  { deg: 230, r: 230, density: 0.35, freq: "0.008 0.02", scale: 14, blur: 15, dur: 21 },
  { deg: 260, r: 250, density: 0.48, freq: "0.007 0.017", scale: 16, blur: 13, dur: 17 },
  { deg: 299, r: 270, density: 0.8, freq: "0.009 0.022", scale: 20, blur: 11, dur: 13 },
  { deg: 340, r: 240, density: 0.58, freq: "0.006 0.016", scale: 15, blur: 16, dur: 16 },
  { deg: 20, r: 200, density: 0.22, freq: "0.005 0.013", scale: 9, blur: 20, dur: 27 },
] as const;

const onArc = (deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
};

export default function FilmAtmosphere({
  variant = "index",
}: {
  variant?: "index" | "banner" | "detail";
}) {
  // Ids must be unique per instance: /work renders the banner variant, and
  // duplicate filter ids in one document make the second consumer silently
  // adopt the first's filters.
  const uid = `fa-${variant}`;

  return (
    <div className={`film-atmosphere film-atmosphere--${variant}`} aria-hidden="true">
      {/* The banner frames a DIFFERENT part of the same artboard rather
          than squeezing the whole hero into a 350px strip. Cropping to the
          upper-right quadrant gives it one elegant arc segment through the
          flare zone — continuity with the films page, without a full roof
          or a squashed hero. Same geometry, different window. */}
      <svg
        className="film-atmosphere__svg"
        viewBox={variant === "banner" ? "620 0 1052 420" : "0 0 1672 941"}
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        <defs>
          {/* Blur radii are in artboard units, so they crop and scale with
              the composition instead of needing per-breakpoint tuning. */}
          <filter id={`${uid}-blurDeep`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="52" />
          </filter>
          <filter id={`${uid}-blurMid`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="25" />
          </filter>
          <filter id={`${uid}-blurBody`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
          <filter id={`${uid}-blurField`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="60" />
          </filter>

          {/* One filter and one mask PER CLUSTER. Sharing them would put
              identical noise everywhere, which is the uniformity being
              fixed — different seeds and frequencies are what make one
              stretch of the arc hazier than the next. */}
          {FUME_CLUSTERS.map((c, i) => {
            const p = onArc(c.deg);
            return (
              <Fragment key={i}>
                <filter id={`${uid}-fume${i}`} x="-50%" y="-50%" width="200%" height="200%">
                  <feTurbulence
                    type="fractalNoise"
                    baseFrequency={c.freq}
                    numOctaves={2}
                    seed={7 + i * 13}
                    result="noise"
                  />
                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="noise"
                    scale={c.scale}
                    xChannelSelector="R"
                    yChannelSelector="G"
                    result="d"
                  />
                  <feGaussianBlur in="d" stdDeviation={c.blur} />
                </filter>
                {/* Band ∩ cluster: the annulus keeps haze on the rim, the
                    soft-edged cluster circle keeps it local and lets it
                    fade out rather than stopping at a hard boundary. */}
                <radialGradient id={`${uid}-cg${i}`}>
                  <stop offset="0%" stopColor="#fff" stopOpacity="1" />
                  <stop offset="55%" stopColor="#fff" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#fff" stopOpacity="0" />
                </radialGradient>
                <mask id={`${uid}-fumeMask${i}`}>
                  <g mask={`url(#${uid}-arcBand)`}>
                    <circle cx={p.x} cy={p.y} r={c.r} fill={`url(#${uid}-cg${i})`} />
                  </g>
                </mask>
              </Fragment>
            );
          })}

          {/* r-18 → r+34: a slightly wider annulus than before, so the haze
              can spill outward from the rim instead of sitting on it. */}
          <mask id={`${uid}-arcBand`}>
            <circle cx={CX} cy={CY} r={R + 34} fill="#fff" />
            <circle cx={CX} cy={CY} r={R - 18} fill="#000" />
          </mask>

          {/* Flare, rebuilt. The previous version put a solid 11px
              #FFDCC6 disc on the rim, which is exactly why it read as a
              white pearl stuck to the line: a hard circular edge plus a
              near-neutral fill. The nucleus is now ~4.5px (a ~40% cut) and
              nothing in the stack has an opaque boundary — every layer
              ends at zero alpha, so it is light rather than an object. The
              ramp also stays warm the whole way: ivory core into coral
              bloom, never neutral white. */}
          <radialGradient id={`${uid}-flareCore`}>
            <stop offset="0%" stopColor="#FFE0C9" stopOpacity="1" />
            <stop offset="55%" stopColor="#FFCFAE" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#FF9B74" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${uid}-flareInner`}>
            <stop offset="0%" stopColor="#FF9B74" stopOpacity="0.44" />
            <stop offset="100%" stopColor="#FF9B74" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${uid}-flareMid`}>
            <stop offset="0%" stopColor="#FF744F" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#FF744F" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${uid}-flareSpread`}>
            <stop offset="0%" stopColor="#FF5A3C" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#FF5A3C" stopOpacity="0" />
          </radialGradient>

          {/* Directional reveal. Without this the circle is equally legible
              from edge to edge and reads as a crown/roofline. Centred on
              the flare so strength falls off with distance from it: the
              upper-right is near full, the far upper-left dissolves to
              ~20%, which is what turns a traced geometric line into one hot
              edge of a much larger structure. */}
          <radialGradient id={`${uid}-reveal`} cx="1065" cy="121" r="1150" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="28%" stopColor="#fff" stopOpacity="0.86" />
            <stop offset="52%" stopColor="#fff" stopOpacity="0.6" />
            <stop offset="78%" stopColor="#fff" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0.2" />
          </radialGradient>
          <mask id={`${uid}-reveal-mask`}>
            <rect width="1672" height="941" fill={`url(#${uid}-reveal)`} />
          </mask>

          <radialGradient id={`${uid}-field`}>
            <stop offset="0%" stopColor="#FF5A3C" stopOpacity="0.15" />
            <stop offset="42%" stopColor="#FF5A3C" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#FF5A3C" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="1672" height="941" fill="#07080B" />

        {/* Three deliberate regions, not a wash: upper-right supports the
            flare, left adds depth, lower-centre grounds the cards. */}
        <g filter={`url(#${uid}-blurField)`} className="film-atmosphere__fields">
          <ellipse cx="1220" cy="180" rx="260" ry="180" fill={`url(#${uid}-field)`} />
          <ellipse cx="165" cy="385" rx="160" ry="210" fill={`url(#${uid}-field)`} opacity="0.78" />
          <ellipse cx="820" cy="845" rx="215" ry="85" fill={`url(#${uid}-field)`} opacity="0.8" />
        </g>

        <g mask={`url(#${uid}-reveal-mask)`}>
        {/* A — deep atmospheric halo */}
        <circle
          className="film-arc-halo"
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke="rgba(255,82,52,0.14)"
          strokeWidth={37}
          filter={`url(#${uid}-blurDeep)`}
        />
        {/* B — middle corona */}
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke="rgba(255,90,60,0.20)"
          strokeWidth={24}
          filter={`url(#${uid}-blurMid)`}
        />
        {/* Six independent plumes rather than one band. Each drifts on its
            own clock, so nothing about the atmosphere reads as periodic. */}
        {FUME_CLUSTERS.map((c, i) => (
          <g
            key={i}
            mask={`url(#${uid}-fumeMask${i})`}
            className="film-arc-fume"
            style={{ animationDuration: `${c.dur}s`, animationDelay: `${-i * 3.1}s`, opacity: c.density }}
          >
            <g filter={`url(#${uid}-fume${i})`}>
              <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,120,80,0.3)" strokeWidth={34} />
              <circle cx={CX} cy={CY} r={R + 14} fill="none" stroke="rgba(255,90,60,0.16)" strokeWidth={20} />
            </g>
          </g>
        ))}
        {/* C — arc body */}
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke="rgba(214,70,43,0.28)"
          strokeWidth={10}
          filter={`url(#${uid}-blurBody)`}
        />
        {/* D — luminous hot rim: the one crisp line in the whole stack */}
        <circle
          className="film-arc-rim"
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke="#FF6A45"
          strokeWidth={2}
          opacity="0.84"
        />
        {/* Rim sharpness varies rather than being equally crisp all the
            way round: a short brighter segment through the flare zone, so
            the arc reads as physical light that is hotter where the flare
            is and swallowed by haze elsewhere. */}
        <path
          className="film-arc-rim-hot"
          d={`M ${onArc(276).x.toFixed(1)} ${onArc(276).y.toFixed(1)} A ${R} ${R} 0 0 1 ${onArc(322).x.toFixed(1)} ${onArc(322).y.toFixed(1)}`}
          fill="none"
          stroke="#FF8A63"
          strokeWidth={2.1}
          strokeLinecap="round"
          opacity="0.55"
        />
        {/* E — delicate inner highlight, barely perceptible */}
        <circle cx={CX} cy={CY} r={R - 3} fill="none" stroke="rgba(255,216,190,0.26)" strokeWidth={0.9} />
        </g>

        {/* Flare, sitting on the rim at its canonical point. */}
        <g className="film-arc-flare">
          <circle cx="1065" cy="121" r="52" fill={`url(#${uid}-flareSpread)`} />
          <circle cx="1065" cy="121" r="25" fill={`url(#${uid}-flareMid)`} />
          <circle cx="1065" cy="121" r="12" fill={`url(#${uid}-flareInner)`} />
          <circle cx="1065" cy="121" r="4.5" fill={`url(#${uid}-flareCore)`} />
        </g>
      </svg>

      <FilmParticles variant={variant} />
      <div className="film-atmosphere__vignette" />
      <div className="film-atmosphere__grain" />
    </div>
  );
}
