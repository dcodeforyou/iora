"use client";

import { useEffect, useMemo, useRef } from "react";
import { gsap, ScrollTrigger } from "@/lib/scroll/gsapSetup";
import HeroScene from "@/components/scene/HeroScene";
import { getLenisInstance, onLenisUnlock } from "@/lib/scroll/lenisInstance";
import { HERO_PIN_VH_MULTIPLIER, HERO_SCREEN_BREAK_END, HERO_VIDEO_BREAKPOINT } from "@/lib/scroll/heroEntry";
import { HERO_MUSIC_ARTIST, HERO_MUSIC_TITLE, onHeroMusicStart } from "@/lib/scroll/heroMusic";

export default function Hero() {
  // Trigger and pin target are the SAME element — the standard GSAP idiom.
  // GSAP inserts its own pin-spacer automatically to create scroll-through
  // room; there is no separate tall wrapper to size by hand. (An earlier
  // version built a manual 250svh wrapper around a 100svh pinned child AND
  // let GSAP add its own spacer on top of that — double-booked scroll
  // distance, so the pin never released even at the end of the document.)
  const pinRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const creditRef = useRef<HTMLDivElement>(null);
  const scrollHintRef = useRef<HTMLDivElement>(null);

  // Plain mutable object, not a ref — ScrollTrigger's onUpdate writes
  // `.value` outside of render every scroll tick; HeroScene's Orchestrator
  // reads it every WebGL frame. Passing it to <HeroScene> during render is
  // fine precisely because it's not a ref (see AGENTS.md's lint-scoping note).
  const progress = useMemo(() => ({ value: 0 }), []);

  // Separate, independent effect — this credit has nothing to do with
  // scroll/pin lifecycle, it just needs to fade in the instant the
  // background track actually starts (see heroMusic.ts's onHeroMusicStart)
  // rather than sitting there from page load crediting a track that isn't
  // audible yet.
  useEffect(() => {
    const credit = creditRef.current;
    if (!credit) return;
    return onHeroMusicStart(() => {
      gsap.to(credit, { opacity: 1, duration: 0.8, ease: "power1.out" });
    });
  }, []);

  // Same idea for the "Scroll" hint — hidden by default (see the JSX
  // below), revealed only once scroll is genuinely unlocked. It used to be
  // visible unconditionally from mount, which meant it sat there telling a
  // visitor to scroll during the ENTIRE CRT boot/no-signal/entry sequence,
  // while scroll was actually still locked — CrtPowerOn's own centered
  // boot content doesn't cover Hero's bottom-of-viewport hint, so it read
  // through the whole time. Reduced-motion users never have scroll locked
  // at all (see the early-return branch below), so they get it immediately.
  useEffect(() => {
    const hint = scrollHintRef.current;
    if (!hint) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      hint.style.opacity = "1";
      return;
    }
    return onLenisUnlock(() => {
      gsap.to(hint, { opacity: 1, duration: 0.6, ease: "power1.out" });
    });
  }, []);

  useEffect(() => {
    const pin = pinRef.current;
    const headline = headlineRef.current;
    if (!pin || !headline) return;

    // Once the headline has fully faded in, it gets ~1.4s on screen and
    // then flickers out on its own (a CRT losing-signal snap, not a soft
    // fade) — a one-shot GSAP timeline, not tied to scroll at all. `reveal`
    // below hands off to it permanently once built: this headline appears
    // once per session and is gone for good, same "no way back" rule as
    // the CRT screen itself (see hasBrokenRef below).
    let flickerTl: gsap.core.Timeline | null = null;
    const startFlickerOut = () => {
      if (flickerTl) return;
      flickerTl = gsap.timeline({ delay: 1.4 });
      flickerTl
        .to(headline, { opacity: 0.15, duration: 0.04, ease: "none" })
        .to(headline, { opacity: 1, duration: 0.03, ease: "none" })
        .to(headline, { opacity: 0.1, duration: 0.05, ease: "none" })
        .to(headline, { opacity: 0.85, duration: 0.04, ease: "none" })
        .to(headline, { opacity: 0, filter: "blur(6px)", duration: 0.35, ease: "power1.in" });
    };

    // Resolved once — same convention as heroVideo.ts's getActiveVideoKey.
    const isMobile = window.innerWidth < HERO_VIDEO_BREAKPOINT;

    const reveal = (p: number) => {
      // Once the flicker-out sequence exists, scroll no longer drives this
      // element at all — otherwise the very next scroll tick would
      // immediately stomp the timeline's own opacity back to 1.
      if (flickerTl) return;
      // Pushed later than the offset this used to have (0.12) — the
      // CRT power-on's own telegram message (see CrtPowerOn.tsx) fades
      // out over the first ~400px of scroll, tied directly to scroll
      // position; at the old 0.12 offset this headline started fading
      // in around ~160px (12% of the ~1350px pin range at a typical
      // 900px viewport), well before that message had finished
      // dissolving, so the two visibly overlapped/raced. 0.32 lands
      // this headline's own start just after the telegram message is
      // gone at any reasonable viewport height, not simultaneously
      // with it.
      const t = Math.min(1, Math.max(0, (p - 0.32) / 0.22));
      headline.style.opacity = String(t);
      if (isMobile) {
        // Bottom-to-top reveal, mobile only — a clip-path inset from the
        // TOP shrinks as t grows, so the visible sliver starts at the
        // element's own bottom edge and grows upward, reading as the
        // line rising into view with scroll rather than just fading in
        // place. `inset(topInset% 0 0 0)`: at t=0, 100% is clipped from
        // the top (nothing visible); at t=1, 0% is clipped (fully
        // visible). Layered with a real translateY (a genuine rise from
        // below its resting position, not just the clip-mask uncovering
        // it in place — "come from bottom of screen to mid," per direct
        // feedback) and opacity/blur, all driven by the same `t`.
        // Desktop keeps its original, smaller translateY+blur treatment
        // untouched below.
        headline.style.clipPath = `inset(${(1 - t) * 100}% 0 0 0)`;
        headline.style.filter = `blur(${(1 - t) * 4}px)`;
        headline.style.transform = `translateY(${(1 - t) * 56}px)`;
      } else {
        headline.style.filter = `blur(${(1 - t) * 10}px)`;
        headline.style.transform = `translateY(${(1 - t) * 16}px)`;
      }
      if (t >= 1) startFlickerOut();
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Reduced motion: skip the pin/scrub AND the flicker-out — a
      // headline that appears and then vanishes on a timer is exactly the
      // kind of motion this mode exists to remove, and permanently hiding
      // the page's one stated thesis line is worse for a reduced-motion
      // visitor, not better. Show it, fully resolved, and leave it there.
      progress.value = 1;
      headline.style.opacity = "1";
      headline.style.filter = "none";
      headline.style.transform = "none";
      headline.style.clipPath = "none";
      return;
    }

    // Real glass doesn't un-shatter — once scroll has ever driven progress
    // past the screen-crack point, this floor stops it from ever being
    // scrubbed back below that point again for the rest of the session.
    // The shard cluster stays fully scroll-reversible above the floor
    // (explode/settle/zoom all still scrub normally both directions) —
    // only the flat whole-screen state becomes permanently unreachable,
    // matching CrtScreenShard's own visibility rule (HeroScene's
    // Orchestrator: screen is purely a function of progress with no
    // memory of its own, so without this floor scrolling back up would
    // visibly restore the intact screen over the already-broken shards).
    const hasBrokenRef = { current: false };

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: pin,
        start: "top top",
        // A function, re-evaluated on refresh/resize — the robust pattern
        // for a responsive pin duration. (The real bug that produced a
        // too-short pin here wasn't the end value's syntax at all — it was
        // this section's ancestor chain being flexbox; see layout.tsx.)
        // Widened progressively (1.5x -> 1.8x -> 2.0x) — HeroScene's own
        // shard choreography (see its ZOOM_START/EXPLODE_SETTLE gap) needs
        // real absolute scroll distance for both the settled-shard "rest"
        // beat AND the exit beat to each read as deliberate, not a blink.
        end: () => "+=" + window.innerHeight * HERO_PIN_VH_MULTIPLIER,
        pin: true,
        scrub: 1,
        onUpdate: (self) => {
          let p = self.progress;
          if (p >= HERO_SCREEN_BREAK_END) hasBrokenRef.current = true;
          if (hasBrokenRef.current && p < HERO_SCREEN_BREAK_END) {
            // Force real scroll position back up to the floor — routes
            // through Lenis (not a native scrollTo) so ScrollTrigger's own
            // next update reads a consistent position instead of the two
            // scroll systems fighting each other.
            const lenis = getLenisInstance();
            const floorPx = window.innerHeight * HERO_PIN_VH_MULTIPLIER * HERO_SCREEN_BREAK_END;
            lenis?.scrollTo(floorPx, { immediate: true, force: true });
            p = HERO_SCREEN_BREAK_END;
          }
          progress.value = p;
          reveal(p);
        },
      });
    }, pin);

    return () => ctx.revert();
  }, [progress]);

  return (
    <section
      ref={pinRef}
      className="relative flex h-svh w-full items-center justify-center overflow-hidden bg-ink"
    >
      <div className="absolute inset-0">
        <HeroScene progress={progress} />
      </div>

      <div
        ref={headlineRef}
        className="pointer-events-none relative z-10 flex flex-col items-center gap-4 px-6 text-center"
        style={{ opacity: 0, filter: "blur(10px)" }}
      >
        <h1 className="max-w-4xl font-display text-4xl font-bold leading-[1.05] text-chalk [text-shadow:0_1px_0_rgba(11,12,16,0.7),0_4px_14px_rgba(11,12,16,0.45),0_16px_40px_rgba(11,12,16,0.4)] sm:text-6xl md:text-7xl">
          {/* Mobile-only: forced onto its own line, italic + accent —
              desktop keeps the original single-color, naturally-wrapping
              treatment (sm:not-italic sm:text-chalk reverts both, and the
              <br> is display:none at sm+ so desktop's own wrap behavior
              is untouched). */}
          We break through{" "}
          <br className="sm:hidden" />
          <span className="italic text-accent sm:not-italic sm:text-chalk">the noise.</span>
        </h1>
      </div>

      {/* Hidden until scroll genuinely unlocks (see the onLenisUnlock
          effect above) — telling a visitor to scroll while scroll is
          still locked behind the CRT boot/entry sequence was actively
          misleading. */}
      {/* Mobile only: bottom-left instead of centered — the music credit
          (below) sits bottom-right at a small size but a long string
          ("Future Club — Perturbator"), which on narrow mobile widths
          reached far enough in from the right edge to visibly overlap a
          centered "Scroll" hint. Mirroring the credit's placement on the
          opposite corner guarantees no overlap. Desktop (sm+) reverts to
          the original centered position — reported as mobile-only, and
          the extra width there already gives plenty of clearance. */}
      <div
        ref={scrollHintRef}
        className="pointer-events-none absolute bottom-8 left-6 font-mono-kicker text-[10px] uppercase tracking-[0.3em] text-chalk-muted sm:left-1/2 sm:-translate-x-1/2"
        style={{ opacity: 0 }}
      >
        Scroll
      </div>

      {/* Music credit — fades in the instant the background track actually
          starts playing (see the onHeroMusicStart effect above), not from
          page load. Small, grey, corner-of-frame — attribution, not a UI
          element competing for attention. */}
      <div
        ref={creditRef}
        className="pointer-events-none absolute bottom-8 right-6 z-10 text-right font-mono-kicker text-[9px] uppercase tracking-[0.15em] text-chalk-muted/70 sm:right-8"
        style={{ opacity: 0 }}
      >
        {HERO_MUSIC_TITLE} — {HERO_MUSIC_ARTIST}
      </div>
    </section>
  );
}
