"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import LogoMark from "./LogoMark";
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
      <div className="pointer-events-auto flex items-center gap-6">
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
          className="hidden font-mono-kicker text-[11px] uppercase tracking-[0.2em] text-chalk transition-[color,letter-spacing] duration-300 ease-out hover:tracking-[0.35em] hover:text-accent sm:inline-block"
        >
          Work
        </Link>
        <a
          href="https://calendly.com/dcodeforyou"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-chalk/20 px-4 py-2 font-mono-kicker text-[11px] uppercase tracking-[0.2em] text-chalk transition-colors hover:border-accent hover:text-accent"
        >
          Book a call
        </a>
      </div>
    </header>
  );
}
