"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { createGrowingLens, type GrowingLensInstance } from "@/components/pitch/liquidGlassLens";

// Cards get their own, more specific selector — checked FIRST, so a card
// (which is also an `<a>`, matching GENERAL_SELECTOR too) gets the card
// lens treatment, not the plain invert.
const CARD_LENS_SELECTOR = '[data-cursor="lens"]';
const GENERAL_SELECTOR = 'a, button, [data-cursor="invert"]';
// Any section with a light (chalk) background — the default frosted
// cursor's border/fill are chalk-toned to read against the ink
// background everywhere else, so on a light section they blend straight
// into it. `.is-on-light` (see globals.css) swaps to ink-toned
// border/fill only while the pointer is actually over one. Marked via a
// shared `data-cursor-bg="light"` attribute (Footer.tsx,
// ResolutionSection.tsx) rather than a tag/class selector, so any future
// light-background section opts in the same way instead of needing a
// matching update here.
const LIGHT_BG_SELECTOR = '[data-cursor-bg="light"]';

const CARD_LENS_DIAMETER = 48;

const CARD_LENS_OPTIONS = {
  scale: -90,
  aberration: [0, 26, 52] as [number, number, number],
  border: 0.15,
  blur: 6,
  fallbackFilter: "blur(10px)",
};

/**
 * Site-wide custom cursor, three states:
 *
 *   - Default (nothing hovered) — a plain translucent frosted circle
 *     (CSS `backdrop-filter: blur() saturate()` + a faint fill), matching
 *     noomo's own resting-cursor register: simple, cheap, no SVG
 *     involved. An earlier version put the real chromatic-aberration
 *     lens here instead — even after fixing its "doesn't scale down
 *     cleanly" bug (see git history / CARD_LENS_OPTIONS below), it still
 *     read as too subtle/invisible at cursor size against most
 *     backgrounds. This reads clearly at rest and costs less doing it.
 *   - Hovering a link/button (`a, button, [data-cursor="invert"]`) —
 *     grows to 48px, plain `mix-blend-mode: difference`, no
 *     backdrop-filter.
 *   - Hovering a glass card (`[data-cursor="lens"]` — /work and Proof
 *     cards) — the real chromatic-aberration backdrop-filter lens (same
 *     technique as Pitch's own growing lens), bounded to the duration of
 *     that one hover over that one element — measured safe (a full
 *     enter→hover→exit cycle stays ~60fps) precisely because it's
 *     bounded, unlike an always-on version at the same size.
 *
 * Skipped entirely on touch devices (no real cursor to replace) and under
 * prefers-reduced-motion.
 */
export default function CustomCursor() {
  const defaultRef = useRef<HTMLDivElement>(null);
  const invertRef = useRef<HTMLDivElement>(null);
  const cardLensRef = useRef<HTMLDivElement>(null);
  // Lifted out of the setup effect's own closure so the route-change
  // reset effect below can read/write it too — see that effect's own
  // comment for why this specific piece of state is the one that gets
  // stuck.
  const cardLensActiveRef = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const defaultEl = defaultRef.current;
    const invertEl = invertRef.current;
    const cardLensEl = cardLensRef.current;
    if (!defaultEl || !invertEl || !cardLensEl) return;

    // Only suppresses the native cursor once this effect has genuinely
    // mounted and is about to start tracking — never via a static CSS
    // rule alone, which would leave the user with no cursor at all if
    // this script ever failed to run.
    document.documentElement.classList.add("custom-cursor-active");

    // Set via JS, not a CSS class rule — see the long comment on
    // .custom-cursor-frosted in globals.css: Lightning CSS silently
    // drops the unprefixed `backdrop-filter` from a static rule here,
    // the same way every other backdrop-filter in this codebase already
    // works around it.
    const frostedFilter = "blur(6px) saturate(1.4)";
    defaultEl.style.backdropFilter = frostedFilter;
    defaultEl.style.setProperty("-webkit-backdrop-filter", frostedFilter);

    let cardLens: GrowingLensInstance | null = null;

    const activateCardLens = () => {
      if (cardLensActiveRef.current) return;
      cardLensActiveRef.current = true;
      defaultEl.style.opacity = "0";
      cardLensEl.style.display = "block";
      if (!cardLens) {
        cardLens = createGrowingLens(cardLensEl, CARD_LENS_OPTIONS);
      }
      cardLens.setDiameter(CARD_LENS_DIAMETER);
    };
    const deactivateCardLens = () => {
      if (!cardLensActiveRef.current) return;
      cardLensActiveRef.current = false;
      defaultEl.style.opacity = "1";
      cardLensEl.style.display = "none";
    };

    const onMove = (e: PointerEvent) => {
      const t = `translate(${e.clientX}px, ${e.clientY}px)`;
      defaultEl.style.transform = t;
      invertEl.style.transform = t;
      cardLensEl.style.transform = t;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const onOver = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(LIGHT_BG_SELECTOR)) {
        defaultEl.classList.add("is-on-light");
      }
      if (target.closest(CARD_LENS_SELECTOR)) {
        activateCardLens();
      } else if (target.closest(GENERAL_SELECTOR)) {
        defaultEl.style.opacity = "0";
        invertEl.style.opacity = "1";
      }
    };
    const onOut = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      const related = e.relatedTarget as HTMLElement | null;
      const lightEl = target.closest(LIGHT_BG_SELECTOR);
      if (lightEl && !related?.closest(LIGHT_BG_SELECTOR)) {
        defaultEl.classList.remove("is-on-light");
      }
      const cardEl = target.closest(CARD_LENS_SELECTOR);
      if (cardEl && !related?.closest(CARD_LENS_SELECTOR)) {
        deactivateCardLens();
      }
      const generalEl = target.closest(GENERAL_SELECTOR);
      if (generalEl && !related?.closest(GENERAL_SELECTOR)) {
        defaultEl.style.opacity = "1";
        invertEl.style.opacity = "0";
      }
    };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.documentElement.classList.remove("custom-cursor-active");
      cardLens?.destroy();
    };
  }, []);

  // Reported directly: clicking a project card leaves the card-lens
  // circle permanently frozen on screen afterward, blocking the invert
  // effect on every link hovered from then on (it paints last, so it
  // sits on top). Root cause, confirmed from the report's own repro
  // (breaks after clicking into a card or going back from one, never
  // breaks navigating via a plain nav link): ProjectCard's click-through
  // intercepts the click and only calls `router.push()` after its own
  // spread animation finishes — the card's DOM gets removed by the page
  // change while the pointer is still conceptually "over" it, so the
  // `pointerout` that would normally call `deactivateCardLens()` never
  // fires. `cardLensActiveRef` stays stuck true, and the lens element
  // stays visible at whatever position it last tracked to, forever.
  //
  // Rather than trying to special-case every possible way a hover
  // target can disappear out from under the pointer, this just treats
  // any genuine route change as a hard reset — whatever was hovered on
  // the PREVIOUS page is definitionally no longer valid on the new one.
  useEffect(() => {
    const defaultEl = defaultRef.current;
    const invertEl = invertRef.current;
    const cardLensEl = cardLensRef.current;
    if (!defaultEl || !invertEl || !cardLensEl) return;
    cardLensActiveRef.current = false;
    defaultEl.style.opacity = "1";
    defaultEl.classList.remove("is-on-light");
    invertEl.style.opacity = "0";
    cardLensEl.style.display = "none";
  }, [pathname]);

  return (
    <>
      <div ref={defaultRef} className="custom-cursor-frosted" aria-hidden="true" />
      <div ref={invertRef} className="custom-cursor-invert" aria-hidden="true" />
      <div ref={cardLensRef} className="custom-cursor-card-lens" aria-hidden="true" />
    </>
  );
}
