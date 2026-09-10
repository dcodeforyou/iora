"use client";

import { useEffect, type RefObject } from "react";
import { getLenisInstance } from "@/lib/scroll/lenisInstance";

/**
 * Swipe, trackpad and arrow-key control for the Ecosystem section.
 *
 * The brief for this asked for a `setActiveStep()` that every input
 * calls. This section has no such state: its card track is a translateX
 * driven straight off scroll progress (see ProofSection's own doc
 * comment — "not a snap-per-tick carousel widget"), and the marble, the
 * WebGL glass and the hop timing are all derived from that same
 * progress.
 *
 * So the step state stays exactly where it already is — in the scroll
 * position — and these inputs move the scroll position to the middle of
 * the requested card's dwell. That satisfies the actual requirement the
 * brief was protecting ("never create two independent systems") more
 * completely than adding a second source of truth would: the marble
 * follows a swipe for free, because a swipe IS a scroll now.
 *
 * The section's scroll range is read from the DOM rather than from the
 * ScrollTrigger, because it is exactly the trigger's own
 * "top top" -> "bottom bottom" span and duplicating two numbers is
 * cheaper than threading an instance out of a 1000-line component.
 */

/** §2.1 — horizontal intent has to be clear before a gesture is taken. */
const SWIPE_MIN_PX = 48;
const SWIPE_AXIS_RATIO = 1.2;

/** §2.3 — one trackpad flick must not skip two cards. */
const WHEEL_MIN_PX = 30;
const WHEEL_COOLDOWN_MS = 650;

/** §2.5 — the move itself. No bounce, no overshoot. */
const MOVE_SECONDS = 0.72;

/**
 * cubic-bezier(.22,.61,.36,1), solved rather than approximated.
 *
 * Lenis wants an easing function, and this exact curve is the one the
 * rest of this pass uses in CSS. Reaching for a named GSAP ease instead
 * would leave the swipe subtly out of step with every transition around
 * it for no saving.
 */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const a = (t: number, p1: number, p2: number) =>
    3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton-Raphson on the x polynomial. Eight passes is well past
    // convergence for a curve this tame.
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = a(t, x1, x2) - x;
      if (Math.abs(err) < 1e-5) break;
      const d =
        3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    return a(t, y1, y2);
  };
}

const EASE = cubicBezier(0.22, 0.61, 0.36, 1);

/**
 * Which card an input should move to, or null when it should be RELEASED
 * back to the page (§2.2): outside the section entirely, or already at
 * the edge in the requested direction.
 *
 * Pure and exported so it can be tested directly. The three input paths
 * below all route through it, which is also what stops the bounds rules
 * from being written out three times and drifting apart.
 */
export function resolveStep(opts: {
  scrollY: number;
  /** Section top reaching viewport top. */
  startY: number;
  /** Section bottom reaching viewport bottom. */
  endY: number;
  cardCenters: number[];
  direction: 1 | -1;
}): { from: number; to: number } | null {
  const { scrollY, startY, endY, cardCenters, direction } = opts;
  if (endY <= startY || cardCenters.length < 2) return null;
  const p = (scrollY - startY) / (endY - startY);
  if (p < 0 || p > 1) return null;
  let from = 0;
  for (let i = 1; i < cardCenters.length; i++) {
    if (Math.abs(cardCenters[i] - p) < Math.abs(cardCenters[from] - p)) from = i;
  }
  const to = from + direction;
  if (to < 0 || to >= cardCenters.length) return null;
  return { from, to };
}

type Options = {
  sectionRef: RefObject<HTMLElement | null>;
  /**
   * Scroll progress (0-1) at the middle of each card's dwell. Passed in
   * from ProofSection so it stays derived from the same DWELL constants
   * the track itself uses, instead of being a second copy that can
   * silently drift out of agreement with the animation.
   */
  cardCenters: number[];
};

export function useEcosystemHorizontalNav({ sectionRef, cardCenters }: Options) {
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || cardCenters.length < 2) return;

    /** The section's own "top top" -> "bottom bottom" scroll span. */
    const range = () => {
      const startY = section.getBoundingClientRect().top + window.scrollY;
      const endY = startY + section.offsetHeight - window.innerHeight;
      return { startY, endY };
    };

    /** null whenever the input should be left to the page — see
     *  resolveStep. This is what makes every listener below inert for
     *  the rest of the site: the brief's "do not globally hijack". */
    const step = (direction: 1 | -1) => {
      const { startY, endY } = range();
      return resolveStep({ scrollY: window.scrollY, startY, endY, cardCenters, direction });
    };

    const goTo = (index: number) => {
      const { startY, endY } = range();
      const target = startY + cardCenters[index] * (endY - startY);
      const lenis = getLenisInstance();
      if (lenis) {
        lenis.scrollTo(target, { duration: MOVE_SECONDS, easing: EASE });
      } else {
        // Lenis is not running (reduced motion, or before it mounts).
        // Native smooth scrolling is the honest fallback; it also
        // respects the OS reduce-motion setting on its own.
        window.scrollTo({ top: target, behavior: "smooth" });
      }
    };

    // ── Touch ──────────────────────────────────────────────────────
    let touchX = 0;
    let touchY = 0;
    /** Resolved at the moment of capture, not at touchend. */
    let captured: number | null = null;
    let decided = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      touchX = e.touches[0].clientX;
      touchY = e.touches[0].clientY;
      captured = null;
      decided = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (decided || e.touches.length !== 1) {
        if (captured !== null && e.cancelable) e.preventDefault();
        return;
      }
      const dx = e.touches[0].clientX - touchX;
      const dy = e.touches[0].clientY - touchY;
      if (Math.abs(dx) < SWIPE_MIN_PX) return;
      decided = true;
      // Vertical intent wins outright — not preventing here is what
      // stops the section becoming a scroll trap.
      if (Math.abs(dx) <= Math.abs(dy) * SWIPE_AXIS_RATIO) return;
      // The destination is checked at capture time. Deciding late would
      // mean having already swallowed a gesture we cannot then honour.
      const resolved = step(dx < 0 ? 1 : -1);
      if (!resolved) return;
      captured = resolved.to;
      if (e.cancelable) e.preventDefault();
    };

    const onTouchEnd = () => {
      if (captured !== null) goTo(captured);
      captured = null;
      decided = false;
    };

    // ── Trackpad ───────────────────────────────────────────────────
    let wheelLockedUntil = 0;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical — leave it alone
      if (Math.abs(e.deltaX) < WHEEL_MIN_PX) return;
      const resolved = step(e.deltaX > 0 ? 1 : -1);
      if (!resolved) return; // outside the section, or edge release
      // preventDefault here does double duty: it stops the browser
      // treating a two-finger horizontal flick as a history back/forward
      // gesture, which would otherwise navigate away mid-section.
      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      if (now < wheelLockedUntil) return;
      wheelLockedUntil = now + WHEEL_COOLDOWN_MS;
      goTo(resolved.to);
    };

    // ── Keyboard ───────────────────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Never take an arrow key away from something that wants it. The
      // section itself is not focusable — adding a tab stop to a purely
      // decorative scroll region would be a worse trade than gating on
      // "nothing else is focused", which is what this is.
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(active.tagName))
      ) {
        return;
      }
      const resolved = step(e.key === "ArrowRight" ? 1 : -1);
      if (!resolved) return; // outside the section, or edge release
      e.preventDefault();
      goTo(resolved.to);
    };

    // `passive: false` on the two that call preventDefault; the browser
    // defaults touchmove and wheel to passive and would otherwise ignore
    // the call with a console warning.
    section.addEventListener("touchstart", onTouchStart, { passive: true });
    section.addEventListener("touchmove", onTouchMove, { passive: false });
    section.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);

    return () => {
      section.removeEventListener("touchstart", onTouchStart);
      section.removeEventListener("touchmove", onTouchMove);
      section.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [sectionRef, cardCenters]);
}
