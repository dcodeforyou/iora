"use client";

import { useEffect } from "react";
import { setNavBg, type NavBg } from "./navBackground";

// Watches SCROLL POSITION (not pointer position — this is Nav's own
// question, "what section is currently behind me at the top of the
// viewport," different from CustomCursor's pointer-driven light/dark
// detection) and keeps the shared navBg store in sync.
//
// Two zones checked, in priority order:
//   1. Pitch's own section (`data-nav-bg-zone="pitch"`) — while its
//      bounding box spans the viewport top, Nav is sitting over it;
//      whether that reads as "amber" or plain "dark" depends on
//      `data-committed`, a flag PitchSection sets/clears itself in
//      commitOrangeState/releaseOrangeState.
//   2. Any light-background section (`data-cursor-bg="light"` —
//      Resolution/Footer already carry this for CustomCursor's own
//      purposes, reused here rather than adding a second attribute for
//      the same thing).
// Anything else: plain dark.
export function useNavBackground() {
  useEffect(() => {
    let raf = 0;

    // A single point at Nav's own visual center, not a generous
    // top<=X tolerance band — tried that first (NAV_BAND=100) and it
    // broke contrast for real: it switched to "light" colors (ink text)
    // BEFORE the actual background pixels behind Nav had turned light,
    // since Resolution+Footer's combined height can be shorter than
    // the viewport (confirmed directly: at max scroll on a 900px-tall
    // viewport, the light zone's top sat at y=85 with zero scroll room
    // left to close that gap — meaning Nav's own ~60-90px band was
    // STILL rendering dark pixels underneath). Ink-on-still-dark is
    // literally invisible, worse than the original "slightly wrong
    // color" bug it was meant to fix. Checking one point at roughly
    // Nav's true vertical center means the color only ever changes once
    // a zone is ACTUALLY behind that point — on viewports where the
    // light content is shorter than the viewport, "light" may simply
    // never trigger, and that's the correct, safe behavior: dark/amber
    // stay legible against whatever's really there, rather than forcing
    // a state that isn't true yet.
    const NAV_CHECK_Y = 40;

    const check = () => {
      let next: NavBg = "dark";

      const pitchZone = document.querySelector<HTMLElement>('[data-nav-bg-zone="pitch"]');
      if (pitchZone) {
        const r = pitchZone.getBoundingClientRect();
        if (r.top <= NAV_CHECK_Y && r.bottom >= NAV_CHECK_Y) {
          next = pitchZone.dataset.committed === "true" ? "amber" : "dark";
        }
      }

      if (next === "dark") {
        const lightZones = document.querySelectorAll<HTMLElement>('[data-cursor-bg="light"]');
        for (const el of lightZones) {
          const r = el.getBoundingClientRect();
          if (r.top <= NAV_CHECK_Y && r.bottom >= NAV_CHECK_Y) {
            next = "light";
            break;
          }
        }
      }

      setNavBg(next);
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(check);
    };

    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
}
