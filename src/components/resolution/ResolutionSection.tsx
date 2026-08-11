"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/lib/scroll/gsapSetup";
import { playPristine } from "@/lib/sound/sfx";

/**
 * Chaos (static, shatter, splat) resolves into one calm, spinning object —
 * the visual payoff of "we turn noise into clarity." White background is a
 * deliberate, hard tonal pivot from the rest of the near-black site; it only
 * reads as intentional because everything before it earned the contrast.
 */
// Slower than native playback — a real-time loop read as too busy/
// frantic sitting quietly behind a wordmark, which is meant to be the
// calm resolution beat after everything before it. Set via JS
// (`video.playbackRate`).
const VIDEO_PLAYBACK_RATE = 0.3;

// /model-loop.mp4 is a pre-rendered boomerang (forward + reverse,
// built with ffmpeg's `reverse` filter, one shared frame dropped at
// the seam) — the source clip doesn't loop cleanly on its own, and a
// hard cut back to frame 0 read as a jump. Reverse playback isn't
// something a plain <video> can do smoothly (no negative
// playbackRate support, and manually stepping currentTime backwards
// is janky), so the boomerang is baked into the file itself rather
// than driven in JS.

export default function ResolutionSection() {
  const markRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Some browsers reset playbackRate back to 1 once metadata actually
    // loads (or right as playback starts) if it was set too early — so
    // this re-applies on both `loadedmetadata` and `play`, not just once
    // at mount, to make sure the slowdown actually sticks regardless of
    // load timing.
    const apply = () => {
      video.playbackRate = VIDEO_PLAYBACK_RATE;
    };
    apply();
    video.addEventListener("loadedmetadata", apply);
    video.addEventListener("play", apply);
    return () => {
      video.removeEventListener("loadedmetadata", apply);
      video.removeEventListener("play", apply);
    };
  }, []);

  useEffect(() => {
    const mark = markRef.current;
    if (!mark) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(mark, { opacity: 1, scale: 1 });
      return;
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(
        mark,
        { opacity: 0, scale: 0.85 },
        {
          opacity: 1,
          scale: 1,
          duration: 1,
          ease: "power2.out",
          onStart: () => playPristine(),
          scrollTrigger: { trigger: mark, start: "top 80%" },
        },
      );
    });

    return () => ctx.revert();
  }, []);

  return (
    <section
      data-cursor-bg="light"
      // Mobile keeps its original fixed min-h-[70vh] untouched — the
      // full-bleed mobile video below was already right, this section's
      // sizing on mobile isn't part of the desktop-only peek/height
      // changes. Desktop (sm+) instead grows via flex-1 against the
      // page's own Resolution+Footer flex wrapper (see page.tsx), which
      // caps that combined pair at 100dvh - 5px — Resolution takes
      // whatever's left after Footer's natural height, so a 5px sliver of
      // Pitch's orange beat stays visible above both at max scroll,
      // rather than Resolution+Footer together fully covering the
      // viewport the instant Pitch's sticky pin releases.
      className="relative min-h-[70vh] w-full overflow-hidden bg-chalk px-6 py-16 text-center sm:min-h-0 sm:flex-1"
    >
      {/* Mobile-only full-bleed video — fills the entire section (the
          space between the pitch/orange beat above and Footer below).
          Plain, unaltered: no tint/overlay, no content on top of it —
          just the video. Desktop keeps the small circular spinning
          model + wordmark instead (see below, hidden on mobile). */}
      <div className="absolute inset-0 z-0 block sm:hidden">
        <video
          src="/iora-footer.mp4"
          autoPlay
          loop
          muted
          playsInline
          aria-hidden="true"
          className="h-full w-full object-cover"
        />
      </div>
      {/* The model video — absolutely centered on the section's own box
          (not sharing flex-flow space with the wordmark below it), so it
          reads as sitting at the true visual center of the screen rather
          than being pushed up by the copy stacked underneath it. The
          wordmark now anchors to the bottom of the section independently
          (see markRef below) instead of directly following this in
          normal flow. Contained + circular rather than full-section,
          matching the "one memorable object" per-beat discipline the
          rest of the site follows.

          The clip's own background (~#e8e6e0) is a slightly warmer/
          darker off-white than --color-chalk, so a hard circular crop
          showed as a faint disc against the section. A radial-gradient
          mask feathers the video's edges to transparent instead of
          color-matching the two exactly — that way it still blends
          cleanly even as either tone drifts.

          There's no source mesh for this (only the rendered clip), so
          real orbit/camera control isn't possible — this is a flat CSS
          spin of the whole frame instead. */}
      <div className="pointer-events-none absolute inset-0 z-10 hidden items-center justify-center sm:flex">
        <video
          ref={videoRef}
          src="/model-loop.mp4"
          autoPlay
          loop
          muted
          playsInline
          aria-hidden="true"
          style={{
            maskImage: "radial-gradient(circle, black 45%, transparent 72%)",
            WebkitMaskImage: "radial-gradient(circle, black 45%, transparent 72%)",
          }}
          className="h-[55vh] w-[55vh] max-w-[75vw] animate-[resolution-model-spin_32s_linear_infinite] object-cover opacity-60 motion-reduce:animate-none"
        />
      </div>
      <div
        ref={markRef}
        className="absolute bottom-10 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-4 opacity-0 sm:flex"
      >
        {/* The real ïora mark — trying variant A here instead of D
            (same shape Nav shows on hover), same treatment otherwise:
            static, no hover-swap/spin/home-link, colored to match the
            "AI ads & websites" label directly below it (ink/50), part
            of the same fade-in as the rest of this beat. viewBox
            cropped to true content bounds, same reasoning as LogoMark. */}
        <svg
          viewBox="6 52 1374 516"
          fill="currentColor"
          aria-hidden="true"
          className="h-[26px] w-auto text-ink/50 sm:h-[30px]"
        >
          <g fillRule="evenodd">
            <path d="M64 184 H152 Q156 184 156 188 V564 Q156 568 152 568 H64 Q60 568 60 564 V188 Q60 184 64 184 Z" />
            <path d="M324 184 H564 A80 80 0 0 1 644 264 V488 A80 80 0 0 1 564 568 H324 A80 80 0 0 1 244 488 V264 A80 80 0 0 1 324 184 Z M368 272 H520 A36 36 0 0 1 556 308 V440 A36 36 0 0 1 520 476 H368 A36 36 0 0 1 332 440 V308 A36 36 0 0 1 368 272 Z" />
            <path d="M980 184 H812 A92 92 0 0 0 720 276 V568 H800 V312 A48 48 0 0 1 848 264 H984 V184 Z" />
            <path d="M1040 184 H1316 A64 64 0 0 1 1380 248 V568 H1056 A60 60 0 0 1 996 508 V384 A60 60 0 0 1 1056 324 H1288 V264 A16 16 0 0 0 1272 248 H1036 V188 Q1036 184 1040 184 Z M1104 400 H1288 V480 H1092 A8 8 0 0 1 1084 472 V428 A28 28 0 0 1 1104 400 Z" />
          </g>
          <path d="M12 52 H88 Q94 52 94 58 V130 Q94 136 88 136 H12 Q6 136 6 130 V58 Q6 52 12 52 Z" />
          <path d="M132 52 H208 Q214 52 214 58 V130 Q214 136 208 136 H132 Q126 136 126 130 V58 Q126 52 132 52 Z" />
        </svg>
        <span className="h-px w-16 bg-accent" />
        <p className="font-mono-kicker text-xs uppercase tracking-[0.3em] text-ink/50">AI ads &amp; websites</p>
      </div>
    </section>
  );
}
