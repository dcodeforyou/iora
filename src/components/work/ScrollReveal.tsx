"use client";

import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "@/lib/scroll/gsapSetup";

/**
 * Per-block scroll reveal for project detail pages. Deliberately plain:
 * fade + rise + blur-out as the block enters view, nothing else — no
 * sticky hold, no pin, no reserved extra scroll room.
 *
 * An earlier version tried to add a genuine scroll-speed-independent
 * "hold" (first via GSAP `pin: true`, then via CSS `position: sticky`
 * with a 145vh wrapper per block). Both made the page noticeably
 * longer than its actual content and made normal scrolling feel like
 * it was catching/stuck on every block, and the sticky version left a
 * large dead gap between the last block and the footer. This page is
 * meant to read as minimal — a plain in-place reveal, in normal
 * document flow, fixes all three at once.
 *
 * No `filter: blur()` here on purpose — it was in an earlier version
 * and measurably cost real scroll smoothness on desktop specifically
 * (blur repaint cost scales with the element's own pixel area, and
 * these gallery photos render up to ~1152×765px on desktop vs. a much
 * smaller area on mobile, which is exactly why the desktop scroll felt
 * stuck while mobile didn't). Opacity + a small rise reads the same
 * without that cost.
 */
export default function ScrollReveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    gsap.set(el, { opacity: 0, y: 56 });

    const trigger = ScrollTrigger.create({
      trigger: el,
      start: "top 88%",
      end: "top 55%",
      scrub: 0.6,
      onUpdate: (self) => {
        const t = self.progress;
        gsap.set(el, { opacity: t, y: 56 * (1 - t) });
      },
    });

    return () => trigger.kill();
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
