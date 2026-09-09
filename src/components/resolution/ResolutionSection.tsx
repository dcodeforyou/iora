"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/lib/scroll/gsapSetup";
import { playPristine } from "@/lib/sound/sfx";
import { HERO_VIDEO_BREAKPOINT } from "@/lib/scroll/heroEntry";

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
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const mobileVideoRef = useRef<HTMLVideoElement>(null);
  const mobileVideoContainerRef = useRef<HTMLDivElement>(null);

  // Mobile only, effectively for free — the container this observes is
  // `sm:hidden` (display:none on desktop), which has no layout box at
  // all, so IntersectionObserver simply never reports it intersecting
  // there; no explicit breakpoint check needed. Pitch's own "Scroll" hint
  // (see PitchSection's commitOrangeState) stays visible/opacity:1 for
  // the entire rest of the page once Pitch commits to its orange state —
  // by design, since Pitch's real content keeps that hint up as a cue
  // that there's still pin distance left before it releases. But once
  // this video is even partially in view, Pitch has visibly moved on —
  // the hint sitting there any longer just overlaps the video, reported
  // directly. Reaching into Pitch's DOM by id (not a shared ref/store)
  // matches this codebase's own established cross-section signal pattern
  // (see marble.dataset.formed/landed/exited elsewhere).
  // Also owns this video's own play/pause (see the block below the hint
  // logic in the callback) rather than a second observer on the same
  // element — reused for the same reason HeroScene reuses one `isVisible`
  // signal for both video volume and music focus. Before this, a separate
  // mount-only effect called .play() here exactly once and never touched
  // it again, which meant it kept decoding for the ENTIRE rest of the
  // session the instant anyone scrolled past it — the exact same
  // always-on-video oversight fixed in ProofSection's own glimpse clips
  // (see that file's own doc comment), just not yet applied here.
  // Explicit .load() on mount, same as heroVideo.ts's own initHeroVideo()
  // — belt-and-suspenders on top of preload="auto": a `src` set directly
  // in JSX SHOULD start the browser loading on its own per the preload
  // hint, but real testing showed these stuck at readyState 0 indefinitely
  // with no explicit .load() call forcing the issue.
  //
  // Only the video this viewport will ACTUALLY show — an earlier version
  // called .load() on both unconditionally, which meant a phone eagerly
  // downloaded the desktop-only model-loop.mp4 (1.6MB) it can never
  // display, and vice versa. Both elements stay in the DOM either way
  // (they're CSS-hidden, not unmounted), so this is purely about which
  // one is told to fetch.
  //
  // Also force `muted` as a real DOM PROPERTY, not just the JSX attribute.
  // Both source files now carry a silent audio track (see the WebKit note
  // below), so `muted` stopped being cosmetic and became load-bearing
  // twice over: without it these would be audible, and iOS refuses to
  // autoplay anything unmuted. React's `muted` prop is known not to
  // reliably reflect onto the property in every path, and the failure
  // would be both noisy and silent-breaking, so it's asserted directly
  // rather than trusted.
  useEffect(() => {
    const isMobile = window.innerWidth < HERO_VIDEO_BREAKPOINT;
    const target = isMobile ? mobileVideoRef.current : videoRef.current;
    if (!target) return;
    target.muted = true;
    target.defaultMuted = true;
    target.load();
  }, []);

  // WebKit auto-pauses "video-only background media ... to save power"
  // (its own wording, seen verbatim in a real AbortError during testing),
  // and newer iOS is markedly more aggressive about it: reported as this
  // section's video not playing on an iPhone 16 Pro Max while the same
  // build played fine on an iPhone 12 Pro and an Android device, and
  // later confirmed to be falling through to the poster there — i.e. the
  // file loads fine and playback is being refused, not failing.
  //
  // Both clips originally had NO audio track whatsoever (confirmed with
  // ffprobe), which is precisely the "video-only" category that heuristic
  // targets. They have each since been given a silent AAC track via
  // ffmpeg (video stream copied, so no re-encode and no quality loss;
  // file sizes unchanged), which should take them out of that category
  // altogether. The listener below stays regardless as defence in depth —
  // it costs nothing and still covers any other source of an unrequested
  // pause.
  //
  // The failure mode is specifically a ONE-SHOT play() with no recovery:
  // the observers below call play() once on entry, WebKit then pauses the
  // element on its own power-saving judgement, and nothing ever asks
  // again — so it stays paused forever. This listener closes that hole by
  // re-asserting playback whenever something OTHER than our own code
  // pauses the element while it's still meant to be playing.
  // `intentionalPause` distinguishes our own deliberate pause-on-scroll-
  // away (see the observers) from an external one, so leaving the section
  // doesn't fight itself. The attempt cap stops a genuinely un-playable
  // element (autoplay blocked outright, Low Power Mode, decode failure)
  // from spinning in a play/pause loop forever.
  const shouldPlayRef = useRef({ mobile: false, desktop: false });
  useEffect(() => {
    const targets: Array<{ video: HTMLVideoElement | null; key: "mobile" | "desktop" }> = [
      { video: mobileVideoRef.current, key: "mobile" },
      { video: videoRef.current, key: "desktop" },
    ];
    const cleanups = targets.map(({ video, key }) => {
      if (!video) return () => {};
      let retries = 0;
      let timer: number | null = null;
      // SPACED retries, not immediate ones. The first version re-played
      // synchronously inside the `pause` handler, which meant that if the
      // platform pauses the element right back (exactly the case this
      // exists for) all twelve attempts were consumed within a few
      // microseconds and the recovery was permanently dead before the
      // user had even reached the section. Spacing them over ~8s covers a
      // transient refusal — e.g. the element only becoming eligible once
      // more of it is genuinely on screen — while still giving up on a
      // hard block (Low Power Mode, decode failure) instead of looping.
      const onPause = () => {
        if (!shouldPlayRef.current[key] || retries >= 12 || timer !== null) return;
        timer = window.setTimeout(() => {
          timer = null;
          if (!shouldPlayRef.current[key]) return;
          retries += 1;
          void video.play().catch(() => {});
        }, 700);
      };
      const onPlaying = () => {
        retries = 0;
      };
      video.addEventListener("pause", onPause);
      video.addEventListener("playing", onPlaying);
      return () => {
        if (timer !== null) clearTimeout(timer);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("playing", onPlaying);
      };
    });
    return () => cleanups.forEach((fn) => fn());
  }, []);

  useEffect(() => {
    const el = mobileVideoContainerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const video = mobileVideoRef.current;
        if (video) {
          // Explicit JS play()/pause(), not just the bare `autoplay`
          // attribute — the bare attribute has been unreliable on this
          // site's mobile testing (mobile-only report: this video not
          // playing at all). `.catch(() => {})` since a muted+playsInline
          // play() call shouldn't ever actually reject, but isn't worth
          // surfacing if it somehow does. shouldPlayRef is what lets the
          // pause-recovery listener above tell OUR pause (here, on scroll
          // away) apart from WebKit's own power-saving one.
          // Deliberately gated on intersectionRatio, NOT isIntersecting:
          // WebKit's power-saving pause for video-only media keys off how
          // much of the element it considers visible, so kicking playback
          // off at literally 1px (isIntersecting/threshold 0) invites it
          // to immediately pause again. Waiting for a real quarter of the
          // element avoids provoking it in the first place; the pause
          // listener above is the safety net if it fires anyway. The
          // scroll-hint logic below still uses isIntersecting, so its own
          // threshold-0 behaviour is unchanged (hence the two thresholds
          // registered on this observer).
          if (entry.intersectionRatio >= 0.25) {
            shouldPlayRef.current.mobile = true;
            void video.play().catch(() => {});
          } else if (!entry.isIntersecting) {
            shouldPlayRef.current.mobile = false;
            video.pause();
          }
        }

        const hint = document.getElementById("pitch-scroll-hint");
        if (!hint) return;
        if (entry.isIntersecting) {
          hint.style.opacity = "0";
          return;
        }
        // NOT just "" here — that clears the inline override entirely
        // and falls back to the Tailwind `opacity-0` CLASS, which is
        // unconditionally present on this element regardless of Pitch's
        // own state (Pitch shows/hides it purely via inline style, never
        // toggling that class). IntersectionObservers can genuinely
        // refire with isIntersecting:false even without a real
        // visibility change (unrelated layout shifts elsewhere on the
        // page) — a bare "" reset here would silently re-hide an
        // already-committed hint the next time that happened, which is
        // exactly what was reported ("scroll word not appearing" even
        // once Pitch had genuinely finished). Explicitly checking
        // Pitch's own committed flag (see commitOrangeState) and
        // restoring "1" when it's true means this only ever HIDES the
        // hint (for the video-in-view case) or leaves Pitch's own
        // already-correct state alone — it can no longer clobber it.
        const pitchCommitted = document.getElementById("pitch-section")?.dataset.committed === "true";
        hint.style.opacity = pitchCommitted ? "1" : "";
      },
      { threshold: [0, 0.25] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Desktop model-loop video — same IntersectionObserver-gated play/pause
  // as the mobile video above, previously missing entirely here (this one
  // relied solely on the `autoPlay` HTML attribute, which decodes
  // regardless of scroll position the instant the element mounts). Also
  // the same 0.25-ratio gate and shouldPlayRef handshake — this clip is
  // equally audio-track-less, so it's equally eligible for WebKit's
  // video-only power-saving pause on an iPad or a desktop Safari that
  // happens to apply it.
  useEffect(() => {
    const el = videoContainerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const video = videoRef.current;
        if (!video) return;
        if (entry.intersectionRatio >= 0.25) {
          shouldPlayRef.current.desktop = true;
          void video.play().catch(() => {});
        } else if (!entry.isIntersecting) {
          shouldPlayRef.current.desktop = false;
          video.pause();
        }
      },
      { threshold: [0, 0.25] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
      // Mobile: a real aspect-[3/4] box, not an arbitrary min-h — the
      // mobile video's own source is 720x960 (exactly 3:4), and sizing
      // this section by height alone left it mismatched against that
      // ratio, so `object-cover` below was cropping the video down
      // rather than showing its true framing edge-to-edge (reported
      // directly). aspect-ratio derives the box's height from its own
      // width at exactly 3:4, matching the source exactly, so no crop is
      // needed at all. Desktop (sm+) resets to auto and instead grows via
      // flex-1 against the page's own Resolution+Footer flex wrapper (see
      // page.tsx), which caps that combined pair at 100dvh - 5px —
      // Resolution takes whatever's left after Footer's natural height,
      // so a 5px sliver of Pitch's orange beat stays visible above both
      // at max scroll, rather than Resolution+Footer together fully
      // covering the viewport the instant Pitch's sticky pin releases.
      className="relative aspect-[3/4] w-full overflow-hidden bg-chalk px-6 py-16 text-center sm:aspect-auto sm:min-h-0 sm:flex-1"
    >
      {/* Mobile-only full-bleed video — fills the entire section (the
          space between the pitch/orange beat above and Footer below).
          Plain, unaltered: no tint/overlay, no content on top of it —
          just the video. Desktop keeps the small circular spinning
          model + wordmark instead (see below, hidden on mobile). */}
      <div ref={mobileVideoContainerRef} className="absolute inset-0 z-0 block sm:hidden">
        {/* No `autoPlay` attribute — that fetches+plays the instant this
            mounts regardless of scroll position or which breakpoint is
            actually showing it, found while investigating reports of the
            whole mobile site loading very slowly. Playback is entirely
            JS-driven now (see the IntersectionObserver effect above),
            gated on this actually being in view.
            preload="auto", not "metadata" — "metadata" combined with this
            file's own JS-driven .play() call (fired the instant this
            scrolls into view) left the element stuck at readyState 0
            indefinitely on real testing, never progressing past "loading"
            — a real, reproducible conflict between the metadata-only hint
            and an early explicit play() call, not just a slow network.
            "auto" removes that ambiguity. Both this and the desktop clip
            below are small (1.6-2.5MB) and sit well down the page (past
            Hero/Attention/Impact/Proof/Pitch), so there's real scroll time
            for either to buffer before this section is ever reached —
            nowhere near the eager-hero-video cost this exact preload
            question was originally about. */}
        {/* `poster` is the part that makes this section correct no matter
            what the platform decides. iOS can refuse to autoplay muted
            video-only media for reasons the page cannot see or override —
            Low Power Mode blocks it outright, and WebKit's own
            power-saving heuristics can pause it with no error surfaced.
            Without a poster, that refusal renders as a blank section,
            which is exactly what was reported on iPhone 16 Pro Max while
            the same build played fine on an iPhone 12 Pro and an Android
            device. With one, the worst case degrades to a still frame of
            the very same footage — the intended composition, just not
            moving — instead of an empty hole. 24KB, and the browser only
            fetches it when it actually needs something to show. */}
        <video
          ref={mobileVideoRef}
          src="/iora-footer.mp4"
          poster="/iora-footer-poster.jpg"
          preload="auto"
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
      <div
        ref={videoContainerRef}
        className="pointer-events-none absolute inset-0 z-10 hidden items-center justify-center sm:flex"
      >
        {/* No `autoPlay` — same fix and reasoning as the mobile video
            above. Playback now driven by the IntersectionObserver effect
            added above (previously this element had no observer at all,
            relying entirely on the native attribute). preload="auto" for
            the same reason as the mobile video's own comment — "metadata"
            left this element stuck at readyState 0 permanently once
            play() was called on it. */}
        {/* Poster for the same reason as the mobile clip above — this one
            is equally audio-track-less and so equally eligible for the
            same refusal on an iPad or a Safari applying the heuristic. */}
        <video
          ref={videoRef}
          src="/model-loop.mp4"
          poster="/model-loop-poster.jpg"
          preload="auto"
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
            "Creative growth ecosystems" label directly below it (ink/50),
            part of the same fade-in as the rest of this beat. viewBox
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
        <p className="font-mono-kicker text-xs uppercase tracking-[0.3em] text-ink/50">Creative growth ecosystems</p>
      </div>
    </section>
  );
}
