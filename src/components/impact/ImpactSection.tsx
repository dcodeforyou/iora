"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { gsap, ScrollTrigger } from "@/lib/scroll/gsapSetup";
import { playInterference, playImpactHit } from "@/lib/sound/sfx";
import { HERO_VIDEO_BREAKPOINT } from "@/lib/scroll/heroEntry";

const subscribeNoop = () => () => {};

// Portals need `document`, which doesn't exist during SSR — this stays
// false on the server and the FIRST client render (matching, so no
// hydration mismatch), then flips true once React confirms we're
// actually on the client. Preferred over a `useState` + `useEffect`
// mounted-flag, which trips the "no setState directly in an effect" lint
// rule for what's really just a client/server snapshot read.
function useIsClient() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

const LEAD_TEXT = "Then we hit";
const LEAD_CHARS = LEAD_TEXT.split("");

/**
 * The "zoom into the O" reveal that makes this content first appear is
 * entirely owned by AttentionSection's fixed overlay (see there), which
 * grows a circle matching this exact content and hands off seamlessly once
 * it covers the viewport — this section just needs to already be here, at
 * the same visual position, for that handoff to be invisible.
 *
 * On TOP of that handoff, once this section is genuinely in view (an
 * IntersectionObserver, not scroll-scrubbed — this ISN'T tied to scroll
 * position/direction the way the zoom itself is): "Then we hit" arrives already
 * unstable — a continuous per-letter jitter (both axes, abrupt easing,
 * fresh random target every cycle — see the jitter setup below for why
 * that reads as signal trouble rather than a decorative wave) plus a
 * chromatic-aberration fringe. It holds like that for a beat. Then "the
 * mark" lands — the impact, hit hard: a punchy two-step scale pop, a brief
 * screen-shake on the whole line, and a shockwave ring — and in that SAME
 * instant the wavy letters glitch-snap into clean, stable text. The
 * resolution of the static IS the impact; they're not separate effects,
 * one moment does both. (Earlier versions: the glow itself flickered
 * before a plain fade-in, a light-sweep-over-text pass, and a smooth sine
 * wave on the letters — all read as decorative rather than "poor signal,"
 * or unrelated to the copy. Dropped for this.)
 *
 * Still `position: sticky` (not GSAP pin — see AGENTS.md) purely so the
 * message gets a dwell beat in view before Proof scrolls in underneath.
 *
 * The first full-ENVIRONMENT color moment — the accent floods the frame
 * here (see AGENTS.md). "the mark" carries the same glow treatment as
 * Attention's "Until now.", underlining that they're one throughline, not
 * two unrelated beats.
 *
 * The handoff into Proof: this used to be a growing-circle clip-path mask
 * on ProofSection itself. Replaced with a physical one, and split into
 * two genuinely separate beats across two sections rather than one
 * continuous animation:
 *
 *   1. HERE, once this section's own scroll crosses 20% in: the glow
 *      blob condenses into a small marble at the same screen spot and
 *      just sits there — energy concentrating into a point, no fall yet.
 *      Marks `marble.dataset.formed = "true"` once done.
 *   2. In ProofSection's own trigger, only once the user has actually
 *      scrolled INTO Proof: the marble drops and bounces to rest using
 *      GSAP's real `bounce.out` ease, on its own clock, not tied to
 *      scroll speed. That bounce.out ease is a deliberate, documented
 *      exception to AGENTS.md's "no elastic/bouncy easing" rule — it's
 *      physically what a dropped object does, not a UI flourish.
 *
 * Both beats are independently replayable, like the entrance above —
 * scrolling back out resets them, scrolling back in plays them again.
 * The marble's resting place IS the card's own top edge (measured
 * directly from the DOM in ProofSection, not a hand-kept constant) — it
 * lands and settles ON that line, with every bounce (idle and
 * card-transition hop alike) swinging UP away from it, never below. It
 * doesn't fade out once landed — Proof's own ScrollTrigger picks the
 * SAME marble DOM node back up (found via #impact-marble) and keeps it
 * as a resident element, idly bouncing at rest and hopping from card to
 * card as the carousel advances.
 */
export default function ImpactSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const charRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const markRef = useRef<HTMLSpanElement>(null);
  const shockwaveRef = useRef<HTMLDivElement>(null);
  const marbleRef = useRef<HTMLDivElement>(null);
  // The marble is portaled straight to document.body (see the render
  // below) so its fixed positioning escapes the sticky wrapper's own
  // stacking context entirely — without this, `position: sticky` always
  // creates a stacking context, so the marble's z-index was only ever
  // being compared against its OWN siblings, and the whole sticky
  // wrapper (Impact, earlier in the DOM) painted underneath ProofSection
  // regardless. Portals need a mount check since document.body isn't
  // available during SSR.
  const isClient = useIsClient();

  useEffect(() => {
    const section = sectionRef.current;
    const glow = glowRef.current;
    const content = contentRef.current;
    const mark = markRef.current;
    const shockwave = shockwaveRef.current;
    const chars = charRefs.current.filter(
      (c): c is HTMLSpanElement => c !== null,
    );
    if (
      !section ||
      !glow ||
      !content ||
      !mark ||
      !shockwave ||
      chars.length === 0
    )
      return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    // Resolved once — same convention as heroVideo.ts's getActiveVideoKey.
    const isMobile = window.innerWidth < HERO_VIDEO_BREAKPOINT;

    let waveTweens: gsap.core.Tween[] = [];
    let settleCall: gsap.core.Tween | null = null;
    let impactTimeline: gsap.core.Timeline | null = null;
    let isPlaying = false;
    let isIntersecting = false;

    // Snaps every animated piece back to its pre-entrance rest state and
    // kills anything mid-flight — used both for the initial setup and any
    // time the section leaves view, so the WHOLE sequence (jitter, hold,
    // snap, impact) is ready to fire again on the next entry rather than
    // only ever playing once per page load.
    const resetToInitial = () => {
      waveTweens.forEach((t) => t.kill());
      waveTweens = [];
      settleCall?.kill();
      settleCall = null;
      impactTimeline?.kill();
      impactTimeline = null;
      isPlaying = false;
      gsap.set(glow, { opacity: 0 });
      gsap.set(chars, { opacity: 0, x: 0, y: 0, textShadow: "none" });
      gsap.set(mark, { opacity: 0, scale: 0.92 });
      gsap.set(shockwave, { opacity: 0, scale: 0 });
      gsap.set(content, { x: 0, y: 0 });
      // `textSettled` is deliberately NOT cleared here — see the
      // deferred-reset comment on the IntersectionObserver below for why
      // clearing it here specifically creates a race with the
      // marble-condense effect's own poll.
    };

    resetToInitial();

    const playSequence = () => {
      isPlaying = true;
      // Cleared here instead of in resetToInitial() — this is the START
      // of a fresh cycle, so any previous "true" value has already had a
      // full, unbounded real-time window to be observed by the
      // marble-condense effect's own poll (a separate effect, watching
      // this same flag). Deleting it as part of a general-purpose reset
      // instead (the original design) meant a reset that ran moments
      // after completion — see below — could delete it before that
      // poll's next 0.1s tick ever saw it as true, silently losing the
      // signal. Clearing it fresh at the top of each real replay avoids
      // that entirely while still correctly forcing "wait for the text
      // to visually resolve again" on every subsequent entry.
      delete section.dataset.textSettled;

      // Letters appear quickly, already unstable — the jitter starts as
      // soon as each letter is visible, not after a clean entrance.
      // Desktop: a faint, still-building glow sits underneath — the full
      // wash is earned at the snap, not before (see AGENTS.md). Mobile:
      // the glow already read as "correct" at this exact moment on real
      // devices, and the later build-then-snap made it look like it was
      // flickering/changing along with the unstable text — reported
      // directly. Mobile instead goes straight to its full/resolved
      // opacity right here and stays completely untouched (no jitter-
      // tied changes at all) until it condenses into the marble later —
      // ONLY the words themselves flicker, never the glow.
      playInterference();
      gsap.to(chars, { opacity: 1, duration: 0.25, stagger: 0.015 });
      gsap.to(glow, {
        opacity: isMobile ? 1 : 0.18,
        duration: 0.35,
        ease: "power1.out",
      });
      // Chromatic aberration (red/cyan fringe) only while unstable —
      // cleared instantly at the snap below.
      gsap.set(chars, {
        textShadow:
          "-1.5px 0 rgba(255,50,60,0.55), 1.5px 0 rgba(60,220,255,0.55)",
      });

      // A smooth sine yoyo reads as a gentle decorative wave, not signal
      // trouble — the actual tell for "bad signal" is UNPREDICTABLE,
      // ABRUPT motion: short, jagged, both axes, no easing curve to
      // smooth it out, and it doesn't repeat between two fixed points —
      // a fresh random target every cycle (GSAP re-invokes function-based
      // values on each repeat of a tween).
      chars.forEach((char, i) => {
        if (char.textContent === " ") return;
        const jitterX = gsap.to(char, {
          x: () => gsap.utils.random(-2.5, 2.5),
          duration: () => gsap.utils.random(0.04, 0.1),
          repeat: -1,
          ease: "none",
          delay: gsap.utils.random(0, 0.4),
        });
        const jitterY = gsap.to(char, {
          y: () => gsap.utils.random(-5, 5),
          duration: () => gsap.utils.random(0.05, 0.12),
          repeat: -1,
          ease: "none",
          delay: gsap.utils.random(0, 0.4) + i * 0.015,
        });
        const flicker = gsap.to(char, {
          opacity: () => gsap.utils.random(0.35, 0.9),
          duration: () => gsap.utils.random(0.04, 0.13),
          repeat: -1,
          ease: "none",
          delay: gsap.utils.random(0, 0.4),
        });
        waveTweens.push(jitterX, jitterY, flicker);
      });

      // Hold the unstable state for a beat before the impact resolves it —
      // kept short (0.6 -> 0.35) so fast scrollers actually see the
      // resolution land before they've scrolled past it. These are real-
      // time durations, not scroll-tied, so a fast scroll can outrun a
      // long one entirely — reported directly as the marble/glow "lagging"
      // behind fast scrolling. Purely a duration change, no added work.
      settleCall = gsap.delayedCall(0.35, () => {
        waveTweens.forEach((t) => t.kill());
        waveTweens = [];

        // Signals the marble-condense effect below (a totally separate
        // ScrollTrigger, in its own effect) that the text has genuinely
        // finished resolving — a plain DOM dataset flag rather than a
        // shared ref, matching this file's own existing pattern for
        // cross-boundary signals (marble.dataset.formed/landed/exited).
        // Without this, the condense used to fire purely off crossing a
        // scroll-position boundary, completely independent of whether
        // this text sequence had actually finished — a fast scroll could
        // start the glow condensing while the letters were still
        // jittering/unresolved, and a slow scroll could leave a dead gap
        // where the text had settled but nothing happened for a while.
        const tl = gsap.timeline({
          onComplete: () => {
            section.dataset.textSettled = "true";
            // If the section already scrolled out of view WHILE this was
            // playing (the observer below deliberately let it keep
            // running instead of aborting it — see there), it's safe to
            // do the full visual reset now, immediately: textSettled was
            // just set and resetToInitial() no longer touches that flag
            // (see its own comment), so there's no race to lose it to
            // this time.
            if (!isIntersecting) resetToInitial();
          },
        });
        impactTimeline = tl;
        // One quick glitch burst, then snap to rest — not a repeating
        // flicker (AGENTS.md flash-rate note), a single decisive
        // correction, like the signal just locked. Chromatic aberration
        // clears instantly with it (gsap.set, not tweened — the color
        // fringe is a symptom of the instability, it should vanish the
        // same instant the instability does, not fade out separately).
        tl.to(chars, { x: () => gsap.utils.random(-2, 2), duration: 0.025 })
          .set(chars, { textShadow: "none" })
          .to(chars, {
            x: 0,
            y: 0,
            opacity: 1,
            duration: 0.1,
            ease: "power2.out",
          });
        // Mobile: glow was already brought to its full/resolved opacity
        // at the very start of playSequence (see below) and never
        // touched again until it condenses into the marble — no jump
        // here, since there's nothing left to jump. Desktop keeps the
        // original faint-build -> full-snap-at-impact behavior.
        if (!isMobile) {
          tl.to(glow, { opacity: 1, duration: 0.25, ease: "power2.out" }, "<");
        }
        tl
          // `.call()`, not a synchronous playImpactHit() alongside this
          // tween's own JS — this whole timeline is built once (inside
          // the 0.6s delayedCall) then plays back; a plain function call
          // here would fire at BUILD time, not when playback actually
          // reaches this point. `.call()` schedules it as a real
          // timeline event at the same "<" position as the pop.
          .call(() => playImpactHit(), [], "<")
          // "the mark" hits hard: a two-step pop (bigger, then settle) —
          // NOT an elastic/bounce ease (AGENTS.md: none anywhere), just
          // two plain decelerating tweens sequenced to read as weight,
          // the same technique a single overshoot ease would give
          // without actually using one.
          .to(
            mark,
            { opacity: 1, scale: 1.14, duration: 0.16, ease: "power2.out" },
            "<",
          )
          .to(mark, { scale: 1, duration: 0.22, ease: "power3.out" })
          // A brief screen-shake on the whole line, same instant as the
          // pop — a handful of tiny, fast, decaying random offsets, not
          // a smooth oscillation.
          .to(
            content,
            {
              x: () => gsap.utils.random(-5, 5),
              y: () => gsap.utils.random(-3, 3),
              duration: 0.03,
              repeat: 5,
              ease: "none",
            },
            "<",
          )
          .to(content, { x: 0, y: 0, duration: 0.12, ease: "power2.out" })
          // A shockwave ring expanding from the impact and fading out.
          .fromTo(
            shockwave,
            { opacity: 0.6, scale: 0 },
            { opacity: 0, scale: 1, duration: 0.55, ease: "power2.out" },
            "<",
          );
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        isIntersecting = !!entries[0]?.isIntersecting;
        if (isIntersecting) {
          if (!isPlaying) playSequence();
        } else if (!isPlaying || section.dataset.textSettled === "true") {
          // Safe to reset right now — either the sequence never started
          // at all, or it already fully resolved (textSettled/onComplete
          // already fired). Otherwise it's genuinely still mid-flight:
          // don't abort it. The ORIGINAL behavior reset unconditionally
          // the instant this section dropped below 50% visible, which
          // meant scrolling even modestly faster than this ~1.1-1.5s
          // sequence's own real-time duration permanently prevented
          // `textSettled` from ever being set — confirmed by direct
          // testing (fast scroll through Impact: textSettled stayed
          // null indefinitely, which cascades into the marble never
          // forming downstream, in Proof or Pitch, for that entire
          // session, regardless of how long the user later dwells
          // elsewhere). Letting an already-started sequence finish
          // unconditionally — it's short and bounded, there's no
          // runaway cost — means `textSettled` (and everything chained
          // off it) reaches a consistent end state regardless of scroll
          // speed, matching "works the same slow or fast." The visual
          // reset for a genuinely mid-flight sequence still happens, via
          // impactTimeline's own onComplete above, once it's safe to.
          resetToInitial();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(section);

    return () => {
      observer.disconnect();
      waveTweens.forEach((t) => t.kill());
      settleCall?.kill();
      impactTimeline?.kill();
    };
  }, []);

  // The marble CONDENSE into Proof — separate from the entrance effect
  // above, and (as of this version) also separate from the marble's
  // actual FALL, which now lives in ProofSection's own trigger instead.
  // This section's job ends once the glow has condensed into a marble
  // sitting still at that same screen point — it does NOT fall here
  // anymore. The fall only plays once the user has actually scrolled
  // INTO Proof (see ProofSection's fall trigger), so the sequence reads
  // as two distinct physical beats: energy condenses into a marble HERE,
  // then gravity takes over only once you've moved on to the next
  // section — not one continuous animation that happens to finish before
  // Proof arrives. `marble.dataset.formed` is the handoff signal
  // ProofSection watches for before it's allowed to start the fall.
  useEffect(() => {
    const section = sectionRef.current;
    const glow = glowRef.current;
    const marble = marbleRef.current;
    if (!section || !glow || !marble) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    gsap.set(marble, { opacity: 0, scale: 1, y: 0 });

    let played = false;
    let sequence: gsap.core.Timeline | null = null;
    let handoffWait: gsap.core.Tween | null = null;

    const resetHandoff = () => {
      sequence?.kill();
      sequence = null;
      handoffWait?.kill();
      handoffWait = null;
      played = false;
      // Clears both handoff signals — ProofSection's fall trigger checks
      // `formed` before it's allowed to fire, and its scroll-scrubbed
      // hop/idle logic checks `landed` before touching the marble's y.
      delete marble.dataset.formed;
      delete marble.dataset.landed;
      // Animated, not gsap.set — scrolling back up should visibly play
      // the widen-out (the condense in reverse), not snap instantly to
      // full size. A hard set here was the bug: it read as "the glow
      // doesn't follow the motion of widening, it just becomes big."
      gsap.to(glow, {
        opacity: 1,
        scale: 1.25,
        duration: 0.4,
        ease: "power2.out",
      });
      gsap.set(marble, { opacity: 0, y: 0 });
    };

    const playHandoff = () => {
      if (played) return;
      played = true;
      delete marble.dataset.formed;
      delete marble.dataset.landed;

      const tl = gsap.timeline();
      sequence = tl;
      // The glow visibly shrinks toward its own center and gets less
      // blurred as it goes — reads as energy concentrating into a
      // smaller, denser, hotter point, not fading away.
      tl.to(glow, {
        scale: 0.1,
        duration: 0.25,
        ease: "power2.in",
      })
        // Hard cut, not a cross-fade — glow disappears the exact same
        // instant the marble appears, same spot, so it reads as one
        // thing changing state, not two separate shapes overlapping.
        // The marble stays at y:0 (its spawn point) here — no fall.
        .set(glow, { opacity: 0 })
        .set(marble, { opacity: 1, y: 0 })
        // Signals ProofSection: the marble exists and is sitting still
        // at its condensed point, ready to fall once Proof is entered.
        .call(() => {
          marble.dataset.formed = "true";
        });
    };

    // Doesn't call playHandoff directly — waits for the OTHER effect's
    // text sequence to have genuinely finished (section.dataset
    // .textSettled, set in that effect's impact timeline onComplete),
    // then adds a further deliberate hold on top, rather than firing the
    // instant this scroll boundary is crossed. That boundary alone used
    // to race the text animation (see the comment on the dataset flag
    // above); a plain poll (not a shared ref) matches this file's own
    // established cross-effect-boundary pattern.
    const attemptHandoff = () => {
      if (played) return;
      handoffWait?.kill();
      if (section.dataset.textSettled === "true") {
        // The hold itself — text has resolved, but the glow shouldn't
        // start visibly condensing until a genuine beat after that, not
        // the same instant, or it reads as one animation continuing
        // rather than two distinct beats. Shortened (0.4 -> 0.2) along
        // with the other real-time holds in this file — same "fast scroll
        // outruns a fixed-duration beat" reasoning as settleCall above.
        handoffWait = gsap.delayedCall(0.2, playHandoff);
      } else {
        handoffWait = gsap.delayedCall(0.1, attemptHandoff);
      }
    };

    const trigger = ScrollTrigger.create({
      trigger: section,
      // Starts well BEFORE this section's sticky pin releases (release
      // happens at the 50% mark of a min-h-200vh section with an h-svh
      // sticky child — pin duration = sectionHeight - viewportHeight).
      // The glow is positioned by being centered inside that sticky div,
      // so if the handoff fired any later, the glow's on-screen point
      // would already be drifting away from the viewport-fixed marble
      // as the pin let go — the "collapsing somewhere else" bug from
      // earlier. Starting at 20% leaves a comfortable margin before that
      // 50% release point. (This boundary alone no longer directly fires
      // the condense — see attemptHandoff above.)
      start: "20% top",
      onEnter: attemptHandoff,
      onEnterBack: attemptHandoff,
      onLeaveBack: resetHandoff,
    });

    // onEnter/onEnterBack only fire on an actual scroll CROSSING of
    // `trigger.start` — never synchronously just because the page
    // happened to mount already past it. A client-side navigation away
    // from "/" and back remounts this whole section fresh (Next.js swaps
    // the entire route tree), and the back-nav scroll restore (see
    // SmoothScroll) can land scroll deep past this boundary in one jump,
    // with no real crossing event ever firing — reported directly as the
    // marble being "lost" until the next scroll happens to cross this
    // boundary for real. Since we're already past the point where the
    // condense would have completed, skip straight to that end state
    // instead of waiting on `attemptHandoff`'s textSettled poll (which
    // depends on the text's IntersectionObserver having actually fired —
    // it won't have, if we teleported in already scrolled past it).
    //
    // Not just deferred one frame — measured directly that a single rAF
    // wasn't reliable either: `trigger.start` itself (a cached PIXEL
    // value, computed from DOM layout at the moment this ScrollTrigger
    // was created) can still be wrong that soon after a fresh remount,
    // if layout above this section (other sections' own content,
    // images, fonts) hasn't fully settled yet — the same underlying
    // class of problem as the stuck-scroll Lenis fix in SmoothScroll,
    // just affecting ScrollTrigger's OWN cached bounds instead of
    // Lenis's.
    //
    // Also measured: stopping at the first success isn't enough either
    // — SmoothScroll's own settle-driven `ScrollTrigger.refresh()` calls
    // keep recomputing these bounds as the rest of the page continues
    // settling, and a bounds correction can make what looked like "past
    // the boundary" now look like "before it," spuriously firing this
    // trigger's own `onLeaveBack` (which calls `resetHandoff`, clearing
    // `played` and `marble.dataset.formed`) even though the user never
    // actually scrolled. Keep re-asserting for the whole retry window
    // (matching ProofSection's identical fix) rather than returning
    // after one success — the last check, once layout has genuinely
    // finished moving, is the one that sticks.
    let selfHealCall: gsap.core.Tween | null = null;
    const trySelfHeal = (triesLeft: number) => {
      ScrollTrigger.refresh();
      if (window.scrollY > trigger.start) {
        played = true;
        gsap.set(glow, { opacity: 0 });
        gsap.set(marble, { opacity: 1, y: 0 });
        marble.dataset.formed = "true";
      }
      if (triesLeft > 0) {
        selfHealCall = gsap.delayedCall(0.15, () => trySelfHeal(triesLeft - 1));
      }
    };
    trySelfHeal(10);

    return () => {
      selfHealCall?.kill();
      trigger.kill();
      sequence?.kill();
      handoffWait?.kill();
    };
    // marbleRef.current is only populated once the portal itself has
    // rendered, which happens on the render AFTER `isClient` flips true —
    // this effect needs to re-run at that point, or it bails out forever
    // on a still-null ref from the initial (server-matching) render.
  }, [isClient]);

  return (
    <section ref={sectionRef} className="relative min-h-[200vh] w-full bg-ink">
      <div className="sticky top-0 flex h-svh w-full items-center justify-center overflow-hidden">
        {/* Radial-gradient glow, not a solid-color div + `blur()` filter —
            the soft falloff is baked into the gradient's own color stops,
            so there's no filter rasterization cost at all (a real GPU tax
            on mobile, especially animated via scale/opacity every frame),
            and it sidesteps the exact GPU-compositor clipping bug
            AttentionSection's own comments already document for large
            animated blur+transform combos (confirmed there as a real
            rendering bug, not just a perf cost — this glow reportedly hit
            the same "blur clips to a hard square edge" failure). Scaling
            this box down uniformly (see the condense tween above) shrinks
            the gradient's whole falloff proportionally, which already
            reads as "concentrating into a smaller, denser point" with no
            separate blur-radius animation needed. */}
        {/* Stops softened (0%->65% opacity instead of 0%->100%, extra
            mid-stops) — the first version had a near-opaque core for
            roughly the first 30% of its radius, which read as a hard,
            distinct "ball" with a halo around it rather than the soft,
            edgeless cloud the original blur(100px) filter produced (a
            true gaussian blur has no core at all — everything blends).
            Reported directly as "color and glow seems very very off."
            More stops = a gentler, more gradual taper across the whole
            radius instead of two visually distinct zones. */}
        <div
          ref={glowRef}
          className="pointer-events-none absolute h-[60vmin] w-[60vmin] scale-125 rounded-full"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--color-accent) 65%, transparent) 0%, color-mix(in srgb, var(--color-accent) 48%, transparent) 18%, color-mix(in srgb, var(--color-accent) 30%, transparent) 38%, color-mix(in srgb, var(--color-accent) 12%, transparent) 58%, transparent 78%)",
          }}
        />
        <div
          ref={shockwaveRef}
          className="pointer-events-none absolute h-[40vmin] w-[40vmin] rounded-full border-2 border-accent"
        />
        {isClient &&
          createPortal(
            <div
              ref={marbleRef}
              id="impact-marble"
              className="pointer-events-none fixed left-1/2 top-1/2 z-[45] h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_24px_8px_rgba(255,78,50,0.55),inset_-3px_-3px_6px_rgba(0,0,0,0.35),inset_3px_3px_6px_rgba(255,255,255,0.25)]"
            />,
            document.body,
          )}
        <div
          ref={contentRef}
          className="relative z-10 flex flex-col items-center gap-4 px-6 text-center"
        >
          <p className="font-mono-kicker text-xs uppercase tracking-[0.3em] text-chalk-muted">
            [ impact ]
          </p>
          <h2 className="max-w-3xl font-display text-4xl font-semibold leading-tight text-chalk sm:text-5xl md:text-6xl">
            {LEAD_CHARS.map((char, i) => (
              <span
                key={i}
                ref={(el) => {
                  charRefs.current[i] = el;
                }}
                className="inline-block"
                style={{ whiteSpace: "pre" }}
              >
                {char}
              </span>
            ))}{" "}
            {/* Went through a dark stroke (comic lettering), then a
                chalk-with-underline treatment, then a soft rounded plate
                that read as too pale to actually carry contrast. This is
                a real highlighter stroke: a near-opaque chalk plate with
                sharp, skewed edges (matching the italic lean, not a boxy
                rectangle) sitting behind — not around — the letters via
                an absolutely-positioned ::before, so opacity there is
                free to go high for genuinely crisp contrast without
                touching the letters' own accent color. */}
            <span
              ref={markRef}
              className="relative inline-block px-1 italic text-accent before:absolute before:-inset-x-1 before:-inset-y-0.5 before:-z-10 before:skew-x-[-10deg] before:bg-chalk/95 before:content-['']"
            >
              the mark
            </span>
          </h2>
        </div>
      </div>
    </section>
  );
}
