"use client";

import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "@/lib/scroll/gsapSetup";
import { createGrowingLens, type GrowingLensInstance } from "./liquidGlassLens";
import { getLenisInstance } from "@/lib/scroll/lenisInstance";
import { playSoftBounce, playLiquidSpread } from "@/lib/sound/sfx";
import { HERO_VIDEO_BREAKPOINT } from "@/lib/scroll/heroEntry";

const MARBLE_RADIUS = 16; // h-8 w-8 = 32px marble, matches Proof/Impact
const IDLE_BOUNCE_HEIGHT = 20;

/**
 * The climax beat: the marble drops in from Proof and bounces on the
 * real "Book a call" button (unchanged from the earlier build), then —
 * once Pitch is fully in view — rolls (real rotation, distance/radius)
 * to the section's dead center. There it becomes a growing liquid-glass
 * lens: genuine optical displacement of whatever's actually behind it
 * (`backdrop-filter: url(#svg-filter)` + three chromatic
 * `feDisplacementMap` passes, see liquidGlassLens.ts — adapted from a
 * real, proven implementation, not a WebGL approximation, since only a
 * true backdrop filter can bend real page pixels the way the reference
 * footage does), with a chromatic-aberration ring at its growing edge
 * and a clear center. As it grows, a full inverted-color clone of this
 * section's own content (same copy, same size, same placement — orange
 * background, ink text, an inverted CTA) is revealed underneath via a
 * clip-path circle driven by the exact same growth value AND the exact
 * same target radius (the viewport's own half-diagonal) as the lens's
 * own diameter — an earlier version capped the lens's size for
 * performance and let the plain reveal keep growing past it uncapped,
 * which read as "the liquid one stops partway, never reaches the
 * edges" once the two visibly diverged. Both now grow to full coverage
 * together, matched, real perf handled by liquidGlassLens.ts's own
 * regen throttling instead. Scrolling away from wherever it finished
 * forming — in EITHER direction — reverses it smoothly and
 * symmetrically (see startHoldReverse below), not a one-way timer.
 *
 * Chromium-only for the real distortion (a genuine platform limit, not
 * an oversight — see liquidGlassLens.ts's own header) — Safari/Firefox
 * get a plain blur instead of the chromatic melt, but the color-flip
 * reveal itself is independent of that and still works everywhere.
 */
export default function PitchSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const lensElRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scrollHintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const cta = ctaRef.current;
    const ghost = ghostRef.current;
    const lensEl = lensElRef.current;
    const wrapper = wrapperRef.current;
    const scrollHint = scrollHintRef.current;
    if (!section || !cta || !ghost || !lensEl || !wrapper || !scrollHint) return;

    // Resolved once — same convention as heroVideo.ts's getActiveVideoKey.
    // Mobile skips the whole "land on the CTA button, bounce twice" beat
    // entirely (see getRestPoint and descentTrigger's onLeave below) —
    // the marble drops straight to screen-center and the liquid-glass
    // spread starts the instant it arrives, no bounce, no separate roll
    // tween (it's already where runReveal would roll it to).
    const isMobile = window.innerWidth < HERO_VIDEO_BREAKPOINT;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let idleBounce: gsap.core.Timeline | null = null;
    let revealSequence: gsap.core.Timeline | null = null;
    let captured: { x: number; y: number; progress: number } | null = null;
    let formed = false;
    // True once the 0.5s post-spread settle has committed the orange
    // palette onto the real content and hidden the ghost/lens (see the
    // delayedCall in runReveal below). holdTrigger keeps running even
    // after this flips true — it stops touching ghost/lens (pointless,
    // they're inert now) but keeps watching for a genuine scroll back UP
    // to un-commit, see its onUpdate below.
    let committed = false;
    let lens: GrowingLensInstance | null = null;
    // Anchors the reversible "hold" phase once formed — created fresh
    // at the exact scroll position where the entrance timeline finishes
    // (see startHoldReverse below), not a fixed trigger tied to Pitch's
    // own DOM geometry. An earlier version anchored the exit to Pitch's
    // own "bottom bottom" and only worked in the forward (scroll-down)
    // direction; this one is symmetric — scrolling AWAY from the hold
    // point in EITHER direction dissolves it, scrolling back toward it
    // re-forms it, matching how the rest of this site stays reversible.
    let holdTrigger: ScrollTrigger | null = null;
    // The one value driving everything once formed — lens diameter,
    // ghost reveal radius, and lens opacity are all pure functions of
    // this, so the exit can reverse the exact same shapes it grew.
    const drive = { progress: 0 };

    // `lenis.stop()` alone doesn't reliably block scroll input on its
    // own — confirmed empirically (wheel input kept moving window
    // .scrollY while "stopped"), likely because it pauses Lenis's own
    // smoothing without necessarily continuing to intercept/prevent
    // every raw wheel event. `overflow: hidden` on the root element is
    // the actual browser-level guarantee (the standard modal/lightbox
    // scroll-lock technique) — kept together with lenis.stop()/start()
    // so Lenis's own internal scroll-position tracking doesn't drift
    // out of sync with the frozen page underneath it.
    //
    // Scrolling during the lock isn't just discarded, either — the
    // attempted wheel/touch input is captured while locked and replayed
    // the instant it releases, so it reads as "the page held for the
    // beat, then picked up your scroll right where you left off," not as
    // input getting silently eaten.
    //
    // Touch handling matches lenisInstance.ts's own lockLenisScroll —
    // `overflow: hidden` alone is a known-leaky block for TOUCH/momentum
    // scroll on iOS Safari specifically (confirmed there the hard way:
    // direct wheel-input instrumentation showed real scroll still moving
    // while "locked"), which is exactly why that function uses
    // capture-phase listeners + `stopImmediatePropagation`, not just
    // `preventDefault`. This lock used to only capture `wheel` at all —
    // real mobile touch-scroll during this beat wasn't just unblocked,
    // it was also never captured for replay, silently discarding
    // whatever scroll gesture happened to land during the lock and
    // leaving Lenis's tracked position out of sync with anything that
    // DID leak through — reported as scroll later capping short of the
    // true bottom of the page.
    let pendingScrollDelta = 0;
    const captureWheel = (e: WheelEvent) => {
      pendingScrollDelta += e.deltaY;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    let lastTouchY = 0;
    const captureTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) lastTouchY = touch.clientY;
    };
    const captureTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      // Swiping up (finger moves toward smaller clientY) is a scroll-DOWN
      // gesture — matches wheel's own deltaY sign convention (positive =
      // scroll down) so both feed the same pendingScrollDelta correctly.
      pendingScrollDelta += lastTouchY - touch.clientY;
      lastTouchY = touch.clientY;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const lockScroll = () => {
      getLenisInstance()?.stop();
      document.documentElement.style.overflow = "hidden";
      pendingScrollDelta = 0;
      window.addEventListener("wheel", captureWheel, { passive: false, capture: true });
      window.addEventListener("touchstart", captureTouchStart, { passive: true, capture: true });
      window.addEventListener("touchmove", captureTouchMove, { passive: false, capture: true });
    };
    const unlockScroll = () => {
      window.removeEventListener("wheel", captureWheel, { capture: true });
      window.removeEventListener("touchstart", captureTouchStart, { capture: true });
      window.removeEventListener("touchmove", captureTouchMove, { capture: true });
      document.documentElement.style.overflow = "";
      getLenisInstance()?.start();
      if (pendingScrollDelta !== 0) {
        const target = window.scrollY + pendingScrollDelta;
        pendingScrollDelta = 0;
        const lenis = getLenisInstance();
        // Default (smoothed) scrollTo, not `immediate: true` — a hard
        // teleport would read as a jump-cut; this instead reads as the
        // page simply resuming the motion the user already started.
        if (lenis) lenis.scrollTo(target);
        else window.scrollTo({ top: target, behavior: "smooth" });
      }
    };

    const getRestPoint = () => {
      // Mobile: screen-center, matching runReveal's own roll target
      // exactly (x:0, y:0 relative to the marble's fixed, centered
      // portal anchor) — landing here means there's nothing left to
      // visually "roll" to, so runReveal's roll tween is naturally a
      // no-op distance, not a separate step to skip around.
      if (isMobile) return { x: 0, y: 0 };
      const rect = cta.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2 - window.innerWidth / 2,
        y: rect.top - MARBLE_RADIUS - window.innerHeight / 2,
      };
    };

    // The marble's own landing (onLeave snapping it to rest, right as
    // the drop's deceleration finishes) already reads as the first
    // bounce — so this plays exactly ONE more cycle on top of that
    // (repeat:0 = single cycle), for two visible bounces total, THEN
    // triggers the reveal itself (rather than the reveal firing the
    // instant "top top" is crossed, racing the bounce that only just
    // started).
    const startIdleBounce = (marble: HTMLElement, restY: number) => {
      if (idleBounce) return;
      // The bounce->roll->spread sequence that follows is entirely
      // time-based from here on, not scroll-scrubbed — nothing stops
      // the user from continuing to scroll straight past Pitch while
      // it's still playing. Since the ghost/lens are `position: fixed`
      // (viewport-relative, not tied to document scroll position), that
      // used to mean the reveal could end up visibly covering the
      // FOOTER instead of Pitch if the user outscrolled it. Locking
      // real scroll input for the duration of this one committed beat
      // (unlocked again once runReveal's own settle check resolves) is
      // the same pattern Impact's jitter->snap already uses implicitly
      // (a beat that isn't scroll-skippable mid-flight) — just made
      // explicit here since this beat, unlike Impact's, visibly covers
      // the whole viewport and so genuinely needs the page to hold
      // still under it.
      lockScroll();
      gsap.set(marble, { y: restY });
      const tl = gsap.timeline({
        repeat: 0,
        repeatDelay: 0.04,
        onComplete: () => {
          idleBounce = null;
          const m = document.getElementById("impact-marble");
          // `lockScroll()` above is unconditional, but this was the ONLY
          // place `unlockScroll()` ever got called from — buried inside
          // `runReveal`'s own delayed call, which only fires if THIS exact
          // condition is true. If the marble's `exited` flag isn't (or
          // isn't still) "true" right here — e.g. a quick scroll up then
          // back down around the Proof/Pitch boundary re-triggers this
          // bounce while Proof's own logic has since reset that flag —
          // `runReveal` is simply never called, and nothing was left to
          // ever release the lock: scroll stays permanently stuck
          // (confirmed reported: "after fill scroll doesn't work up or
          // down"). Every path out of this bounce must own unlocking
          // whatever it locked, not just the one that happens to hand off
          // to runReveal.
          if (m && m.dataset.exited === "true" && !formed) {
            runReveal(m);
          } else {
            unlockScroll();
          }
        },
      });
      idleBounce = tl;
      tl.to(marble, { y: restY - IDLE_BOUNCE_HEIGHT, duration: 0.34, ease: "power2.out" })
        .to(marble, {
          y: restY,
          duration: 0.34,
          ease: "power2.in",
        })
        // Second (and last) contact of this beat — damped/soft, matching
        // the CTA's own soft-platform character rather than Proof's
        // brighter glass ping.
        .call(() => playSoftBounce(0.6));
    };
    const stopIdleBounce = () => {
      // `.kill()` on a GSAP tween skips its `onComplete` entirely — the
      // OTHER half of the same lock leak fixed above. `startIdleBounce`
      // unconditionally locks scroll for the bounce's duration; if this
      // fires while a bounce is actively mid-flight (e.g. `descentTrigger`
      // .onEnterBack — the user scrolling back up into Pitch's entrance
      // zone while the marble is still bouncing), the timeline is killed
      // outright and its onComplete (the only other place that used to
      // unlock) never runs. Aborting the bounce this way always means
      // we're NOT proceeding to runReveal from it, so it must own
      // releasing whatever lock it took, same as the completion path does.
      const wasBouncing = !!idleBounce;
      idleBounce?.kill();
      idleBounce = null;
      if (wasBouncing) unlockScroll();
    };

    // Ghost radius reaches past the viewport's own half-diagonal by
    // progress=1 — guarantees full coverage regardless of aspect ratio,
    // computed fresh each call since viewport size can't be assumed.
    const ghostMaxRadius = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      return Math.sqrt(w * w + h * h) / 2 + 40;
    };

    const applyDrive = () => {
      const p = Math.max(0, Math.min(1, drive.progress));
      // Same ease, same 0-1 range, same TARGET SIZE — the lens and the
      // ghost reveal are driven by the exact same number now. An
      // earlier version capped the lens's own diameter at a fixed 620px
      // (a real perf concern — canvas.toDataURL() cost scales with
      // area — but it meant the lens visibly stopped growing while the
      // ghost kept expanding past it, reading as "the liquid one stops
      // partway, never reaches the edges of the screen," which is
      // exactly the bug this was). Both now grow to the SAME radius
      // (the viewport's own half-diagonal, guaranteeing full coverage),
      // so there's nothing left to visually desync — perf is handled by
      // `liquidGlassLens.ts`'s own regen throttling instead of by
      // capping the size.
      const eased = gsap.parseEase("power2.out")(p);
      const targetRadius = ghostMaxRadius() * eased;

      // The lens/chromatic refraction is a TRANSIT EFFECT, not a resting
      // state — it should sweep through during the active spread and be
      // completely gone once the ghost has fully covered the screen
      // (reads as duplicate/ghosted RGB outlines sitting permanently on
      // real text otherwise — a real legibility/comfort problem, not
      // just a look). A bump curve (0 at both ends of `p`, peaking at
      // the midpoint) makes it visible only while the circle is
      // genuinely still growing/shrinking, symmetric for both the
      // forward reveal and the reverse dissolve. Hard cutoff at both
      // tails (not just "opacity near 0") for the same reason as
      // before: a displacement filter has no small/subtle version of
      // itself — the neutral center is a FRACTION of current diameter,
      // so a tiny residual size reads as a small but full-strength
      // glitch, not a faded nothing.
      const bump = 4 * p * (1 - p);
      const isVisible = bump > 0.06;

      if (lens) lens.setDiameter(isVisible ? targetRadius * 2 : 0);
      lensEl.style.opacity = isVisible ? String(Math.min(1, bump)) : "0";
      ghost.style.clipPath = `circle(${Math.max(0, targetRadius)}px at 50% 50%)`;
    };

    // Once fully committed (see the 0.5s settle below), the real content
    // itself takes on the ghost's inverted palette permanently — orange
    // background, ink text, ink CTA — rather than just hiding the ghost
    // and letting the real (ink-background) content show back through.
    // The real content is genuinely `position: sticky` (not `fixed`), so
    // once it carries these colors itself, it already behaves like
    // normal document flow: it scrolls away naturally once its pin
    // releases, revealing the footer, with nothing switching back to
    // black along the way.
    const commitOrangeState = () => {
      // Both the wrapper AND the section itself — the section is taller
      // than the sticky wrapper (240vh vs the wrapper's own 100vh), so
      // once the wrapper starts releasing near the end of its sticky
      // range, the section's OWN remaining background peeks through at
      // the edge. Left as `bg-ink` (its className), that read as a
      // thin black strip cutting into the otherwise-orange screen right
      // as the section scrolled away — recoloring only the wrapper
      // wasn't enough.
      section.style.backgroundColor = "var(--color-accent)";
      wrapper.style.backgroundColor = "var(--color-accent)";
      const kicker = wrapper.querySelector<HTMLElement>("p");
      const h2 = wrapper.querySelector<HTMLElement>("h2");
      const accentSpan = wrapper.querySelector<HTMLElement>("span");
      const ctaEl = wrapper.querySelector<HTMLElement>("a");
      if (kicker) kicker.style.color = "color-mix(in srgb, var(--color-ink) 60%, transparent)";
      if (h2) h2.style.color = "var(--color-ink)";
      if (accentSpan) accentSpan.style.color = "var(--color-chalk)";
      if (ctaEl) {
        ctaEl.style.backgroundColor = "var(--color-ink)";
        ctaEl.style.color = "var(--color-chalk)";
      }
      // Same "Scroll" hint Hero uses — only relevant here once committed:
      // this is the one stretch of the page where the section visually
      // looks "done" (fully orange, copy settled) but there's still a
      // real, held pin distance left before it actually releases to the
      // footer, with nothing otherwise telling the user to keep going.
      scrollHint.style.opacity = "1";
      scrollHint.style.color = "var(--color-chalk)";
      // Plain DOM dataset flag, not a shared ref/store — same
      // cross-boundary-signal pattern this file already uses elsewhere
      // (marble.dataset.formed/landed/exited). Nav's own scroll-position
      // watcher (useNavBackground) reads this directly off the DOM to
      // decide whether it's currently sitting over the amber wash.
      section.dataset.committed = "true";
    };
    const releaseOrangeState = () => {
      section.style.backgroundColor = "";
      wrapper.style.backgroundColor = "";
      const kicker = wrapper.querySelector<HTMLElement>("p");
      const h2 = wrapper.querySelector<HTMLElement>("h2");
      const accentSpan = wrapper.querySelector<HTMLElement>("span");
      const ctaEl = wrapper.querySelector<HTMLElement>("a");
      if (kicker) kicker.style.color = "";
      if (h2) h2.style.color = "";
      if (accentSpan) accentSpan.style.color = "";
      if (ctaEl) {
        ctaEl.style.backgroundColor = "";
        ctaEl.style.color = "";
      }
      scrollHint.style.opacity = "";
      scrollHint.style.color = "";
      delete section.dataset.committed;
    };

    const resetForm = () => {
      formed = false;
      committed = false;
      revealSequence?.kill();
      revealSequence = null;
      holdTrigger?.kill();
      holdTrigger = null;
      drive.progress = 0;
      applyDrive();
      ghost.style.display = "";
      lensEl.style.display = "";
      releaseOrangeState();
    };

    // Called once the entrance timeline genuinely finishes — anchors a
    // hold point at WHATEVER scroll position the user happens to be at
    // that exact moment (not a fixed point in Pitch's own layout).
    // Scrolling back UP toward Proof smoothly dissolves the reveal
    // (and re-forms it if you scroll back down toward the hold point) —
    // but scrolling further DOWN, past the hold point into whatever
    // comes after Pitch, does NOT dissolve it. The marble's story ends
    // at the spread: once you've moved on forward, it stays committed,
    // it doesn't reappear and bounce back into view just because you
    // kept scrolling. Only "undo" (scroll back up) is reversible here,
    // deliberately asymmetric — immune to the earlier bug where a fixed
    // DOM-anchored trigger could require more scroll room than the page
    // actually had after Pitch.
    const REVERSE_DISTANCE = 700;
    const startHoldReverse = () => {
      holdTrigger?.kill();
      const holdScrollY = window.scrollY;
      // No `trigger` element — an untied ScrollTrigger with numeric
      // start/end is the documented pattern for "listen to the whole
      // page's scroll position, always active," rather than trying to
      // express that as an offset from a specific element (mixing a
      // `trigger` with plain-number start/end doesn't mean what it
      // looks like it means, and produced a trigger whose onUpdate
      // never actually fired for real scroll input).
      holdTrigger = ScrollTrigger.create({
        start: 0,
        end: "max",
        onUpdate: (self) => {
          if (!formed) return;
          const delta = self.scroll() - holdScrollY;

          // Once committed (the 0.5s post-spread settle — see runReveal),
          // continuing to scroll DOWN is deliberately inert — that's the
          // whole point: it stays orange all the way to the footer and
          // beyond, no matter how far. This has to be checked BEFORE the
          // huge-delta safety net below: that net's job is to clean up a
          // genuinely ORPHANED state (some leftover mid-transition
          // drive.progress with nothing left to finish it), but a large
          // positive delta while already cleanly committed isn't
          // orphaned at all — it's just normal continued scrolling.
          // Checking `committed && delta>=0` first and returning
          // immediately means that case never reaches the safety net,
          // which used to `resetForm()` (reverting straight back to
          // black) the moment accumulated forward scroll past the hold
          // point exceeded REVERSE_DISTANCE*3 — reported directly as
          // "scrolling down from Pitch to the footer, Pitch goes back to
          // black instead of staying orange."
          if (committed && delta >= 0) return;

          // Hard safety net for genuinely orphaned state — see above for
          // why this only applies once we're past the "still cleanly
          // committed" case. Everything below assumes continuous,
          // monotonic scroll tracking from the hold anchor — but a
          // nav-link jump, scroll restoration, or just stopping mid-
          // dissolve can leave `drive.progress` parked at some small,
          // nonzero value with nothing left to ever finish driving it to
          // exactly 0. Since `ghost` is `position: fixed` (viewport-
          // relative, not document-relative), ANY leftover nonzero radius
          // renders as a stray solid-accent shape over WHATEVER section
          // the user is currently looking at — however far from Pitch
          // that is (this is the "orange stripe stuck over Attention"
          // report: Pitch had been visited earlier in the same session,
          // leaving exactly this kind of orphaned state). Once scroll has
          // moved several REVERSE_DISTANCEs away, there's no legitimate
          // "still dissolving" case left to protect — hard-reset instead
          // of trusting the smooth formula to land on exactly 0.
          if (Math.abs(delta) > REVERSE_DISTANCE * 3) {
            resetForm();
            return;
          }

          // Scrolling back UP should still undo a committed state, same
          // as before commit — un-commit right here the instant that
          // happens, handing back off to the normal progress formula
          // below so the ghost/lens reappear and shrink exactly like the
          // pre-commit reverse always has, rather than staying
          // permanently stuck because the commit step used to kill this
          // trigger outright. (The `delta >= 0` half of this case is
          // already handled by the early return above.)
          if (committed) {
            committed = false;
            ghost.style.display = "";
            lensEl.style.display = "";
            releaseOrangeState();
          }

          drive.progress = delta >= 0 ? 1 : Math.max(0, 1 - Math.abs(delta) / REVERSE_DISTANCE);
          applyDrive();

          // Re-commit once scroll genuinely comes back to (or past) the
          // hold point — the un-commit branch above had no matching
          // opposite. Without this, ANY small scroll-up wobble (routine
          // on mobile: touch-scroll momentum/rubber-banding naturally
          // overshoots and settles back by a few px, unlike a discrete
          // desktop wheel tick) permanently released the orange state
          // and never restored it even scrolling back down past the same
          // point — reported directly as "orange changes to black" and,
          // since `drive.progress` was then left oscillating around
          // whatever partial value those micro-wobbles produced instead
          // of settling at a clean 0 or 1, the marble crossfade above
          // rendering it small and partially visible instead of cleanly
          // hidden.
          if (!committed && drive.progress >= 1) {
            committed = true;
            commitOrangeState();
            ghost.style.display = "none";
            lensEl.style.display = "none";
          }

          // The marble faded out (opacity 1->0, scale 1->0.4) as the
          // entrance crossfaded into the lens — reversing that exact fade
          // here, symmetric with the same eased value driving the
          // ghost/lens back down, means the marble genuinely reforms in
          // place as the reveal dissolves. Without this it stayed
          // invisible the whole time the ghost/lens were visibly
          // shrinking back on scroll-up, then popped back into view with
          // no transition once Proof's own (unrelated) idle-bounce
          // restore logic kicked in far up the page — this only runs
          // during the hold-reverse phase (never during forward entrance,
          // where the explicit crossfade tween already owns these same
          // properties), so there's no fight between the two.
          const marble = document.getElementById("impact-marble");
          if (marble && marble.dataset.exited === "true") {
            const eased = gsap.parseEase("power2.out")(Math.max(0, Math.min(1, drive.progress)));
            gsap.set(marble, { opacity: 1 - eased, scale: 1 - eased * 0.6 });
          }
        },
      });
    };

    // ---- drop + bounce on the CTA (unchanged) ----
    const descentTrigger = ScrollTrigger.create({
      trigger: section,
      start: "top bottom",
      end: "top top",
      scrub: true,
      onUpdate: (self) => {
        const marble = document.getElementById("impact-marble");
        if (!marble || marble.dataset.exited !== "true" || formed) return;
        if (!captured) {
          captured = {
            x: Number(gsap.getProperty(marble, "x")),
            y: Number(gsap.getProperty(marble, "y")),
            progress: self.progress,
          };
        }
        const target = getRestPoint();
        const span = 1 - captured.progress;
        const localT =
          span > 0 ? Math.min(1, Math.max(0, (self.progress - captured.progress) / span)) : 1;
        const eased = gsap.parseEase("power2.in")(localT);
        gsap.set(marble, {
          x: gsap.utils.interpolate(captured.x, target.x, eased),
          y: gsap.utils.interpolate(captured.y, target.y, eased),
        });
      },
      onLeave: (self) => {
        const marble = document.getElementById("impact-marble");
        if (!marble || marble.dataset.exited !== "true") return;
        // Fast mobile flicks carry real native scroll momentum well past
        // this trigger's own boundary before this callback even runs —
        // ScrollTrigger's position checks are tied to requestAnimationFrame,
        // not synchronous with touch/inertial scroll, so a hard enough
        // flick can land scroll already partway into Resolution by the
        // time "top top" is detected as crossed. Snapping straight back
        // to the trigger's own end position — synchronously, before
        // anything else in this callback runs — means the bounce->roll
        // ->spread sequence (and the scroll lock it takes, see
        // startIdleBounce's lockScroll) always engages at the correct
        // spot instead of starting the sequence already scrolled past
        // Pitch. Reported directly: fast mobile scroll skipping into the
        // next section mid-animation, distorting the reveal.
        getLenisInstance()?.scrollTo(self.end, { immediate: true, force: true });
        const target = getRestPoint();
        gsap.set(marble, { x: target.x, y: target.y });
        // First contact — "the marble's own landing... already reads as
        // the first bounce" (see startIdleBounce's own comment above).
        playSoftBounce(1);
        // Mobile: straight into the reveal, no bounce beat at all — it's
        // already sitting at screen-center (see getRestPoint above),
        // exactly where runReveal would otherwise roll it to.
        if (isMobile) {
          runReveal(marble);
        } else {
          startIdleBounce(marble, target.y);
        }
      },
      onEnterBack: () => stopIdleBounce(),
      onLeaveBack: () => {
        stopIdleBounce();
        captured = null;
        resetForm();
        // No longer forces the marble visible here (used to gsap.set
        // opacity:1 unconditionally alongside the scale/rotation reset
        // below). That was meant as a catch-all for "handing back off to
        // Proof," but it doesn't reposition the marble — fine for a
        // gradual scroll-up (where Proof's own onEnterBack/onUpdate
        // repositions it on the very next tick anyway, making the forced
        // opacity redundant), but for an instant jump (e.g. the footer's
        // `href="#"` Work link, which snaps straight to scrollY 0,
        // bypassing Lenis entirely) it could leave the marble sitting
        // visible at a stale leftover position before Impact's own reset
        // ran, reading as the marble "randomly appearing." Proof and
        // Impact already own a complete, mutually consistent state
        // machine for the marble's visibility and position (checked
        // against dataset.landed/formed and the actual current scroll
        // position) — Pitch reaching in to force it visible was fighting
        // that ownership, which is what actually caused the bug. Still
        // resets scale/rotation (not opacity) so that IF Proof/Impact's
        // own logic does make it visible again later, it isn't stuck at
        // the shrunk scale/spin left over from Pitch's own crossfade.
        const marble = document.getElementById("impact-marble");
        if (marble && marble.dataset.exited === "true") {
          gsap.set(marble, { scaleX: 1, scaleY: 1, rotation: 0 });
        }
      },
    });

    // Same class of gap as `onLeave` above and ImpactSection/ProofSection's
    // own matching fixes: this only fires on an actual scroll crossing of
    // "top top", never synchronously just because the page mounted
    // already past it — which is exactly what a back-nav scroll restore
    // landing deep in Pitch does. `marble.dataset.exited` is set by
    // ProofSection's own equivalent self-heal, which — like this one —
    // keeps RE-ASSERTING for the whole ~1.5s retry window rather than
    // stopping at the first success (measured directly: SmoothScroll's
    // own settle-driven `ScrollTrigger.refresh()` calls can flip Proof's
    // computed exit-zone state back and forth as the page keeps
    // resizing, so `exited` can briefly flicker false again after
    // already being set true). Reacting only once, the first time
    // `exited` happens to read true, could land on a moment right
    // before it flickers back off — retrying the whole window the same
    // way ensures the LAST check (once layout has genuinely finished
    // moving) is the one that sticks here too.
    let selfHealCall: gsap.core.Tween | null = null;
    const trySelfHeal = (triesLeft: number) => {
      const marble = document.getElementById("impact-marble");
      // `!idleBounce` guards the actual (re-)positioning specifically —
      // once the idle bounce is running, it owns the marble's `y` every
      // frame on its own clock; re-running `gsap.set` on every retry
      // tick here would yank it back to a fixed resting position mid-arc
      // and fight that tween, reading as a stutter repeating every
      // 150ms. `startIdleBounce` itself already no-ops if already
      // running, so this is purely to skip the position reset once
      // established, not a correctness guard for the bounce itself.
      if (
        marble?.dataset.exited === "true" &&
        window.scrollY > descentTrigger.end &&
        !formed &&
        (isMobile || !idleBounce)
      ) {
        const target = getRestPoint();
        gsap.set(marble, { x: target.x, y: target.y, scaleX: 1, scaleY: 1, rotation: 0 });
        if (isMobile) {
          runReveal(marble);
        } else {
          startIdleBounce(marble, target.y);
        }
        // Forces the NEXT real scroll-up crossing back into this
        // trigger's range to capture fresh from this correct resting
        // position, instead of from `captured` staying null and then
        // being set from some other, possibly still-transitional marble
        // position mid-settle.
        captured = null;
      }
      if (triesLeft > 0) {
        selfHealCall = gsap.delayedCall(0.15, () => trySelfHeal(triesLeft - 1));
      }
    };
    trySelfHeal(10);

    // ---- hard-triggered: roll to center, become the lens ----
    const runReveal = (marble: HTMLElement) => {
      if (formed) return;
      formed = true;
      stopIdleBounce();

      if (!lens) {
        lens = createGrowingLens(lensEl, {
          scale: -130,
          // Wider RGB scale spread = more visible color fringing at the
          // rim (the actual source of the chromatic look — each channel
          // displaces a different amount). `border` widens the ring
          // itself: it's the inset fraction for the neutral/clear center
          // circle, so a bigger value shrinks that clear zone and leaves
          // more of the lens as active (visibly distorted+fringed) band.
          // A lighter blur keeps the ring crisp/saturated instead of
          // smearing the color separation into a soft, washed-out edge.
          // Dialed back from an earlier, much stronger pass — that
          // version was tuned assuming the ring would be a resting
          // state, so it read as a permanent headache-inducing
          // duplicate-outline effect on real text. Now that it's a
          // transient sweep (see the bump curve in applyDrive) rather
          // than a resting state, it doesn't need to carry the whole
          // "is this visible at all" burden alone.
          aberration: [0, 34, 68],
          border: 0.3,
          blur: 7,
        });
      }

      const startX = Number(gsap.getProperty(marble, "x"));
      const startY = Number(gsap.getProperty(marble, "y"));
      const rollDistance = Math.hypot(startX, startY); // target is (0,0), screen-center
      const rollDegrees = (rollDistance / MARBLE_RADIUS) * (180 / Math.PI);

      drive.progress = 0;
      applyDrive();

      const tl = gsap.timeline();
      revealSequence = tl;
      // Real roll to center — rotation synced to distance traveled, an
      // actual roll, matching the same physics used for the marble's
      // earlier CTA-roll beat.
      tl.to(marble, {
        x: 0,
        y: 0,
        rotation: `+=${rollDegrees}`,
        duration: 0.5,
        ease: "power2.inOut",
      })
        // Motion-masked fade-out into the lens, right as the roll
        // finishes — no separate waiting beat. (lensEl's own opacity is
        // NOT tweened here — applyDrive's bump curve, below, owns it for
        // the whole transition, fading it in and back out on its own;
        // an explicit opacity-in tween here would fight that curve the
        // instant the drive tween's onUpdate starts firing.)
        .to(marble, { scale: 0.4, opacity: 0, duration: 0.2, ease: "power1.out" }, "-=0.15")
        // One continuous drive value grows the lens, fades it out once
        // it's done its work, and keeps growing the plain reveal past
        // that — all smoothly, no hard cuts between phases.
        .to(drive, {
          progress: 1,
          // Landed on 1.1s after several rounds of "still feels slow" —
          // matches AGENTS.md's "punchy but eased" motion character:
          // fast enough to read as an immediate, confident reveal rather
          // than a sluggish wipe, slow enough (at 60fps that's still ~66
          // frames) that the chromatic ring and refraction are legible,
          // not a single-frame flash. Trimmed modestly to 0.9s per a
          // later request ("bounce and spread time is quite a lot") —
          // still comfortably above single-frame-flash territory, just a
          // bit tighter than the original tuning.
          duration: 0.9,
          ease: "none",
          onStart: () => playLiquidSpread(),
          onUpdate: applyDrive,
          onComplete: () => {
            startHoldReverse();
            // A brief hold once the spread has genuinely finished, then
            // (if the user hasn't already started scrolling back up to
            // undo it — drive.progress would already be dropping if so)
            // the real content commits to the orange palette permanently
            // (see commitOrangeState) and the fixed ghost/lens overlay
            // releases — display:none is safe now since the real,
            // genuinely-sticky content already carries the same colors,
            // so nothing flashes back to black. holdTrigger deliberately
            // KEEPS running past this point (not killed) — continuing to
            // scroll down stays inert while committed (normal scroll to
            // the footer), but scrolling back UP still needs to un-commit
            // and reverse it, which only holdTrigger's onUpdate can do.
            gsap.delayedCall(0.35, () => {
              if (formed && drive.progress > 0.9) {
                committed = true;
                commitOrangeState();
                ghost.style.display = "none";
                lensEl.style.display = "none";
              }
              // Releases the scroll lock taken at the start of the bounce
              // (see startIdleBounce) — the beat has fully resolved by
              // here (committed either way, since nothing but this timeline
              // itself could have moved drive.progress while scroll was
              // locked), so it's safe to hand real scroll input back.
              unlockScroll();
            });
          },
        })
        // A quick channel-misalignment wobble right as the chromatic
        // ring is fading out (last 0.1s of the drive tween, overlapping
        // its own fade tail) — reads as the RGB channels "settling" back
        // into alignment right before the effect disappears, rather than
        // the fringe just cutting off flatly. Deliberately a smooth,
        // decaying sine (not a per-frame random jump, which read as a
        // jarring position glitch rather than a wave) — 3 quick cycles
        // that decay to exactly 0 by the end, so it settles cleanly
        // rather than cutting off mid-wobble.
        .to(
          {},
          {
            duration: 0.1,
            onUpdate: function () {
              const t = this.progress();
              const decay = 1 - t;
              const wave = Math.sin(t * Math.PI * 6) * decay;
              lens?.jitterAberration(wave * 8);
            },
          },
          "-=0.1",
        );
    };

    return () => {
      selfHealCall?.kill();
      descentTrigger.kill();
      holdTrigger?.kill();
      stopIdleBounce();
      revealSequence?.kill();
      lens?.destroy();
      // Safety net for unmounting mid-sequence (route change, HMR) while
      // the entrance lock (see startIdleBounce) is still held — without
      // this, scroll could stay permanently stopped.
      unlockScroll();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="pitch-section"
      data-nav-bg-zone="pitch"
      className="relative min-h-[240vh] w-full bg-ink"
    >
      <div
        ref={wrapperRef}
        className="sticky top-0 flex h-svh w-full flex-col items-center justify-center gap-10 px-6 py-32 text-center"
      >
        <p className="font-mono-kicker text-xs uppercase tracking-[0.3em] text-chalk-muted">[ the pitch ]</p>
        <h2 className="max-w-4xl font-display text-4xl font-semibold leading-tight text-chalk sm:text-6xl md:text-7xl">
          We&apos;re not here to talk about us.
          <br />
          <span className="text-accent">We&apos;re here to talk about you.</span>
        </h2>
        <a
          ref={ctaRef}
          href="https://calendly.com/dcodeforyou"
          target="_blank"
          rel="noopener noreferrer"
          className="relative mt-4 rounded-full bg-accent px-10 py-5 font-mono-kicker text-sm uppercase tracking-[0.2em] text-ink transition-transform hover:scale-105"
        >
          Book a call
        </a>
        {/* Hero's own "Scroll" hint, reused here — only shown once
            committed (see commitOrangeState/releaseOrangeState above).
            Opacity-0 by default via the style attribute matches every
            other element in this commit sequence, which are all driven
            imperatively rather than via a CSS class toggle. */}
        <div
          ref={scrollHintRef}
          id="pitch-scroll-hint"
          className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 font-mono-kicker text-[10px] uppercase tracking-[0.3em] text-chalk-muted opacity-0 transition-opacity duration-500"
        >
          Scroll
        </div>
      </div>
      {/* Exact clone of the content above, colors fully inverted (orange
          bg, ink text, ink CTA instead of accent) — same copy, same
          size, same placement, per spec. Revealed only within the
          lens's own growing circle (see applyDrive above), which is why
          this needs to be a real second copy rather than a color
          transition on the original: the two need independent clip
          regions. */}
      <div
        ref={ghostRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-30 bg-accent"
        style={{ clipPath: "circle(0px at 50% 50%)" }}
      >
        <div className="flex h-svh w-full flex-col items-center justify-center gap-10 px-6 py-32 text-center">
          <p className="font-mono-kicker text-xs uppercase tracking-[0.3em] text-ink/60">[ the pitch ]</p>
          <h2 className="max-w-4xl font-display text-4xl font-semibold leading-tight text-ink sm:text-6xl md:text-7xl">
            We&apos;re not here to talk about us.
            <br />
            <span className="text-chalk">We&apos;re here to talk about you.</span>
          </h2>
          <a
            href="https://calendly.com/dcodeforyou"
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={-1}
            className="relative mt-4 rounded-full bg-ink px-10 py-5 font-mono-kicker text-sm uppercase tracking-[0.2em] text-chalk"
          >
            Book a call
          </a>
        </div>
      </div>
      {/* The real liquid-glass lens — a plain DOM circle with a real
          backdrop-filter SVG displacement applied imperatively (see
          liquidGlassLens.ts), not a WebGL mesh. Sits above the ghost
          layer (z-40 > z-30) so its distortion genuinely applies to
          whatever's compositing beneath it at each moment (ink page
          early on, the revealed orange ghost later). */}
      <div
        ref={lensElRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0"
        style={{ width: 0, height: 0 }}
      />
    </section>
  );
}
