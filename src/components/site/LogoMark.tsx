"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { gsap } from "@/lib/scroll/gsapSetup";
import { getNavBg, subscribeNavBg, type NavBg } from "@/lib/nav/navBackground";

// Resting/hover color per background the Nav is currently sitting
// over — see the confirmed table: dark bg reads chalk at rest and
// amber on hover; amber bg reads chalk at rest and ink on hover; light
// bg reads amber at rest and ink on hover.
const COLORS: Record<NavBg, { rest: string; hover: string }> = {
  dark: { rest: "#f4f4f2", hover: "#ff4e32" },
  amber: { rest: "#f4f4f2", hover: "#0b0c10" },
  light: { rest: "#ff4e32", hover: "#0b0c10" },
};

/**
 * The "studio" text's replacement — links home, the ïora wordmark,
 * variant D at rest, crossfading to variant A on hover, with variant
 * A's two diaeresis dots each spinning 360° independently (around
 * their own center, not orbiting as a pair) each time a hover begins.
 * Color follows whatever section is currently behind the fixed Nav
 * (see useNavBackground / navBackground store) — both shapes render
 * with fill="currentColor" so a single `color` on the wrapping link
 * drives both.
 */
export default function LogoMark() {
  const navBg = useSyncExternalStore(subscribeNavBg, getNavBg, () => "dark" as NavBg);
  const [hovered, setHovered] = useState(false);
  const dot1Ref = useRef<SVGGElement>(null);
  const dot2Ref = useRef<SVGGElement>(null);

  const color = hovered ? COLORS[navBg].hover : COLORS[navBg].rest;

  const handleEnter = () => {
    setHovered(true);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Each dot is its own <g>, spun independently around ITS OWN
    // center (transformOrigin 50% 50% resolves per-element, against
    // that <g>'s own bounding box) — an earlier version grouped both
    // dots into one <g> and rotated that, which orbited them around
    // their SHARED midpoint instead of each spinning in place.
    [dot1Ref.current, dot2Ref.current].forEach((dot) => {
      if (!dot) return;
      // `+=360`, not a hard-set 360 — accumulates across repeated
      // hovers (720, 1080, ...), which looks identical at rest each
      // time (a multiple of 360 is visually 0) but means a fast
      // re-hover mid-spin continues smoothly forward instead of
      // snapping backward to redo the same 0->360 sweep.
      gsap.to(dot, {
        rotation: "+=360",
        transformOrigin: "50% 50%",
        duration: 0.6,
        ease: "power2.inOut",
      });
    });
  };

  return (
    <Link
      href="/"
      aria-label="Home"
      className="pointer-events-auto relative inline-block h-[17px] w-[48px] shrink-0 sm:h-[19px] sm:w-[52px]"
      style={{ color }}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Variant D — resting. Two earlier passes both compensated for
          an aspect-ratio mismatch that turned out not to be real:
          matching only width (first pass) let height float, which
          read as a hover zoom; force-filling an identical box on both
          axes via preserveAspectRatio="none" (second pass) fixed the
          zoom but visibly stretched/distorted the shapes instead ("non
          hover looks more heightened"). The actual root cause: D's and
          A's viewBox attributes each carried a different, arbitrary
          amount of unused padding around their real ink (D: 69px of
          dead space on its LEFT edge; A: 52px of dead space above its
          dots) — once cropped to true content bounds below, D's real
          aspect ratio (1173/442 = 2.654) and A's (1374/516 = 2.663)
          turn out to match to within 0.3%. Plain proportional scaling
          (no preserveAspectRatio override, matched by height) now
          produces matching widths on its own, with zero distortion —
          the actual fix, not another compensating hack. */}
      <svg
        viewBox="69 0 1173 442"
        fill="currentColor"
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 h-full w-auto transition-opacity duration-300 ease-out ${
          hovered ? "opacity-0" : "opacity-100"
        }`}
      >
        <rect x="69" y="0" width="73" height="70" rx="4" />
        <rect x="169.5" y="0" width="74" height="70" rx="4" />
        <rect x="115" y="113" width="82" height="329" />
        <path d="M344 113 C305 113 273 145 273 184 V369 C273 408 305 440 344 440 H543 C582 440 614 408 614 369 V184 C614 145 582 113 543 113 Z" />
        <path d="M760 113 H905 V183 H786 C765 183 748 200 748 221 V441 H677 V196 C677 150 714 113 760 113 Z" />
        <path d="M948 113 H1184 C1216 113 1242 139 1242 171 V441 H969 C938 441 914 417 914 386 V284 C914 253 940 229 971 229 H1163 V183 H948 Z" />
      </svg>

      {/* Variant A — hover. Each dot is its own <g> now (dot1Ref /
          dot2Ref), not one shared group. viewBox cropped to true
          content bounds, same reasoning as D above. */}
      <svg
        viewBox="6 52 1374 516"
        fill="currentColor"
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 h-full w-auto transition-opacity duration-300 ease-out ${
          hovered ? "opacity-100" : "opacity-0"
        }`}
      >
        <g fillRule="evenodd">
          <path d="M64 184 H152 Q156 184 156 188 V564 Q156 568 152 568 H64 Q60 568 60 564 V188 Q60 184 64 184 Z" />
          <path d="M324 184 H564 A80 80 0 0 1 644 264 V488 A80 80 0 0 1 564 568 H324 A80 80 0 0 1 244 488 V264 A80 80 0 0 1 324 184 Z M368 272 H520 A36 36 0 0 1 556 308 V440 A36 36 0 0 1 520 476 H368 A36 36 0 0 1 332 440 V308 A36 36 0 0 1 368 272 Z" />
          <path d="M980 184 H812 A92 92 0 0 0 720 276 V568 H800 V312 A48 48 0 0 1 848 264 H984 V184 Z" />
          <path d="M1040 184 H1316 A64 64 0 0 1 1380 248 V568 H1056 A60 60 0 0 1 996 508 V384 A60 60 0 0 1 1056 324 H1288 V264 A16 16 0 0 0 1272 248 H1036 V188 Q1036 184 1040 184 Z M1104 400 H1288 V480 H1092 A8 8 0 0 1 1084 472 V428 A28 28 0 0 1 1104 400 Z" />
        </g>
        <g ref={dot1Ref}>
          <path d="M12 52 H88 Q94 52 94 58 V130 Q94 136 88 136 H12 Q6 136 6 130 V58 Q6 52 12 52 Z" />
        </g>
        <g ref={dot2Ref}>
          <path d="M132 52 H208 Q214 52 214 58 V130 Q214 136 208 136 H132 Q126 136 126 130 V58 Q126 52 132 52 Z" />
        </g>
      </svg>
    </Link>
  );
}
