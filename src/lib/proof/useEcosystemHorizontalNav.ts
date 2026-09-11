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
/** Vertical travel at which a drag is treated as a scroll and left alone. */
const VERTICAL_BAILOUT_PX = 10;

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

    /**
     * The card a move is already heading to, while that move is running.
     *
     * Without this, a second swipe made mid-move is measured from wherever
     * the scroll happens to be halfway through the animation — which sits
     * almost exactly between two cards, so "nearest card + 1" frequently
     * resolved to the SAME destination and the second swipe did nothing.
     * Two quick swipes should mean two cards.
     */
    let inFlight: { index: number; until: number } | null = null;

    const nextCard = (direction: 1 | -1): number | null => {
      if (inFlight && performance.now() < inFlight.until) {
        const to = inFlight.index + direction;
        return to >= 0 && to < cardCenters.length ? to : null;
      }
      return step(direction)?.to ?? null;
    };

    const goTo = (index: number, via: "touch" | "desktop") => {
      const { startY, endY } = range();
      const target = startY + cardCenters[index] * (endY - startY);
      inFlight = { index, until: performance.now() + MOVE_SECONDS * 1000 + 150 };
      const lenis = getLenisInstance();
      if (via === "desktop" && lenis) {
        lenis.scrollTo(target, { duration: MOVE_SECONDS, easing: EASE });
      } else {
        // Touch always uses the browser's own smooth scroll, never Lenis.
        // Lenis does not drive touch scrolling on this site (syncTouch is
        // off), so a Lenis animation running under a finger is two
        // scroll engines writing the same position — the next vertical
        // drag fights the tail of the swipe and the page stutters. The
        // native one is interrupted by the browser the instant a new
        // touch lands, and it runs off the main thread.
        window.scrollTo({ top: target, behavior: "smooth" });
      }
    };

    // ── Touch ──────────────────────────────────────────────────────
    //
    // Two things made this section feel wrong on a phone.
    //
    // 1. Vertical scrolling was waiting on JavaScript. A non-passive
    //    touchmove listener on a 500vh section tells the browser it may
    //    NOT scroll until that listener has run and confirmed it did not
    //    call preventDefault — for every single touchmove, on a main
    //    thread already carrying GSAP, the glass and three looping
    //    videos. That is the stutter in plain vertical scrolling.
    //
    // 2. Horizontal swipes arrived too late to claim. The old code only
    //    decided at 48px of sideways travel, but a browser commits a
    //    gesture to a vertical pan within the first few pixels of any
    //    drift, and after that iOS marks touchmove uncancellable. So a
    //    slightly-diagonal swipe scrolled the page a little, THEN jumped
    //    to the next card.
    //
    // `touch-action: pan-y` fixes both at the root. It tells the browser
    // that vertical panning is its job and horizontal panning is not a
    // scroll at all — so vertical scrolling is pure native, compositor-
    // driven, with no listener in its way, and a horizontal swipe never
    // starts a native pan in the first place. Nothing here needs to call
    // preventDefault any more, which is what lets every listener be
    // passive. Pinch-zoom is kept where the browser supports saying so.
    const previousTouchAction = section.style.touchAction;
    section.style.touchAction = CSS.supports("touch-action", "pan-y pinch-zoom")
      ? "pan-y pinch-zoom"
      : "pan-y";

    let startX = 0;
    let startY = 0;
    /** null = undecided; set once the gesture's axis is known. */
    let axis: "x" | "y" | null = null;
    let swipeDx = 0;

    const onTouchStart = (e: TouchEvent) => {
      // Two fingers is a pinch, never a swipe.
      axis = e.touches.length === 1 ? null : "y";
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      swipeDx = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (axis === "y" || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (axis === null) {
        // Mirror the browser's own decision: under pan-y it begins a
        // vertical scroll as soon as the drag is clearly vertical, so
        // that gesture is the page's from then on and must never also
        // be read as a sideways swipe when it drifts.
        if (Math.abs(dy) >= VERTICAL_BAILOUT_PX && Math.abs(dy) >= Math.abs(dx)) {
          axis = "y";
          inFlight = null; // a manual scroll supersedes any queued card
          return;
        }
        if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * SWIPE_AXIS_RATIO) {
          axis = "x";
        }
      }
      if (axis === "x") swipeDx = dx;
    };

    const onTouchEnd = () => {
      // Committed on release rather than mid-drag. iOS will not reliably
      // start a programmatic smooth scroll while a finger is still down,
      // and "swipe, let go, it moves" is the carousel contract people
      // already have in their hands.
      if (axis === "x") {
        const to = nextCard(swipeDx < 0 ? 1 : -1);
        if (to !== null) goTo(to, "touch");
      }
      axis = null;
    };

    // ── Trackpad ───────────────────────────────────────────────────
    let wheelLockedUntil = 0;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical — leave it alone
      if (Math.abs(e.deltaX) < WHEEL_MIN_PX) return;
      const to = nextCard(e.deltaX > 0 ? 1 : -1);
      if (to === null) return; // outside the section, or edge release
      // preventDefault here does double duty: it stops the browser
      // treating a two-finger horizontal flick as a history back/forward
      // gesture, which would otherwise navigate away mid-section.
      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      if (now < wheelLockedUntil) return;
      wheelLockedUntil = now + WHEEL_COOLDOWN_MS;
      goTo(to, "desktop");
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
      const to = nextCard(e.key === "ArrowRight" ? 1 : -1);
      if (to === null) return; // outside the section, or edge release
      e.preventDefault();
      goTo(to, "desktop");
    };

    // Every touch listener is passive now — see the touch notes above.
    // Wheel stays non-passive because it is the one input that still has
    // a native behaviour (history swipe) worth cancelling.
    section.addEventListener("touchstart", onTouchStart, { passive: true });
    section.addEventListener("touchmove", onTouchMove, { passive: true });
    section.addEventListener("touchend", onTouchEnd, { passive: true });
    section.addEventListener("touchcancel", onTouchEnd, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);

    return () => {
      section.style.touchAction = previousTouchAction;
      section.removeEventListener("touchstart", onTouchStart);
      section.removeEventListener("touchmove", onTouchMove);
      section.removeEventListener("touchend", onTouchEnd);
      section.removeEventListener("touchcancel", onTouchEnd);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [sectionRef, cardCenters]);
}
