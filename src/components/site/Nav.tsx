"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import LogoMark from "./LogoMark";
import WorkProofMorph, { type WorkProofMorphHandle } from "./WorkProofMorph";
import { useNavBackground } from "@/lib/nav/useNavBackground";

/**
 * Fixed top nav, shared across every route. At rest it's transparent,
 * full-bleed text sitting directly on whatever's at the top of the page.
 *
 * The scroll-triggered pill background is deliberately scoped to /work
 * and its case-study pages only — those are plain content pages where
 * transparent nav text can lose contrast against photos/cards. The main
 * site (/) is its own choreographed scroll story (Attention, Impact,
 * Pitch, Proof...) where every beat was designed around this exact
 * transparent nav; a background box appearing over it isn't a contrast
 * fix there, it's an unrequested change to a page that already works.
 */
export default function Nav() {
  const pathname = usePathname();
  const pillEnabled = pathname.startsWith("/work");
  const [scrolled, setScrolled] = useState(false);
  const morphRef = useRef<WorkProofMorphHandle>(null);
  useNavBackground();

  useEffect(() => {
    if (!pillEnabled) {
      setScrolled(false);
      return;
    }
    const threshold = window.innerHeight * 0.6;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setScrolled(window.scrollY > threshold));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [pillEnabled]);

  return (
    <header
      className={`pointer-events-none fixed top-0 z-50 flex items-center justify-between transition-[inset,border-radius,background-color,backdrop-filter] duration-500 ${
        scrolled
          ? "inset-x-4 top-4 rounded-full border border-chalk/10 bg-ink/85 px-5 py-3 backdrop-blur-md sm:inset-x-8 sm:top-5 sm:px-7"
          : "inset-x-0 px-6 py-5 sm:px-10"
      }`}
    >
      <LogoMark />
      {/* Tighter gap on mobile: with Work now visible at every width, the
          logo, the link and the Book a call pill have to coexist inside a
          320px viewport. 16px here and 24px from sm: keeps that from
          crowding without changing the desktop rhythm. */}
      <div className="pointer-events-auto flex items-center gap-4 sm:gap-6">
        <Link
          href="/work"
          // Opens in a new tab, but only from the main site — leaving "/"
          // for /work in the same tab loses the whole CRT/Hero sequence
          // state behind you. Already ON /work (pillEnabled), this same
          // Nav also renders there (it's a shared component, not
          // homepage-only) — clicking "Work" while already in that
          // section should behave like normal same-tab navigation, not
          // spawn a redundant new tab pointed at where you already are.
          target={pillEnabled ? undefined : "_blank"}
          rel={pillEnabled ? undefined : "noopener noreferrer"}
          // The letters animate, so assistive technology gets a stable
          // label instead of a stream of changing characters. This is
          // also where the word's MEANING lives — the morph says "the
          // work is the proof" visually and this says it in text.
          aria-label="Work — proof of our work"
          // Hover and focus replay the morph. That replaces the old
          // letter-spacing expansion: the word now sits in a fixed
          // five-cell grid (see WorkProofMorph) where tracking would
          // offset glyphs inside their cells rather than space them,
          // and two hover behaviours on one four-letter word is one
          // too many. Colour-on-hover is unchanged.
          onMouseEnter={() => morphRef.current?.play()}
          onFocus={() => morphRef.current?.play()}
          className="inline-block shrink-0 font-mono-kicker text-[11px] uppercase tracking-[0.2em] text-chalk transition-colors duration-300 ease-out sm:hover:text-accent"
        >
          <WorkProofMorph handleRef={morphRef} />
        </Link>
        {/* Goes to the site's own /book flow, not straight to Calendly.
            The context step is the whole point: a call that starts with
            "so tell me about your business" is a call spent on
            introductions. Same tab, unlike Work above — booking is where
            the visit ends, not somewhere you come back from. */}
        <Link
          href="/book"
          className="rounded-full border border-chalk/20 px-4 py-2 font-mono-kicker text-[11px] uppercase tracking-[0.2em] text-chalk transition-colors hover:border-accent hover:text-accent"
        >
          Book a call
        </Link>
      </div>
    </header>
  );
}
