"use client";

import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "@/lib/scroll/gsapSetup";
import { playFlicker } from "@/lib/sound/sfx";

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = gsap.utils.clamp(0, 1, (x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

const WORDS = ["Attention", "is", "impossible", "to", "hold."];
// "Attention" gets the accent treatment — one emphasized keyword, the
// NotionLabs move of coloring a single word inside an otherwise-monochrome
// headline rather than flooding the whole thing.
const ACCENT_WORD_INDEX = 0;

// How far a word dashes on each flee, and how close the cursor has to get
// to trigger one — large/near enough that catching a word reads as
// genuinely impossible, not a small nudge.
const FLEE_DISTANCE = 300;
const FLEE_RADIUS = 190;
// power4.out (steeper than the power3 used before) gives the dash a sharp,
// quick burst of speed right as it escapes the cursor, then visibly glides
// down to a stop rather than arriving at a constant clip — the "fast then
// playful slow-down" read the flee is going for. Not spring/elastic easing
// (see AGENTS.md — no bouncy motion), just a steeper deceleration curve.
// Duration bumped slightly so that glide has room to actually be seen.
const FLEE_DURATION = 0.45;
const FLEE_EASE = "power4.out";
const RETURN_DURATION = 1.4;
// Keep clear of the fixed nav and the viewport edges — words roam freely
// but never render under the nav or off-screen.
const EDGE_PADDING = 56;
const TOP_PADDING = 120;

// Settle (words locked, "Until now." fading in) completes at progress 0.32
// — but the zoom doesn't start right there. ZOOM_START sits later, past
// settle, so there's a deliberate hold: "Until now." sits at full
// brightness, still, for a beat before the wall starts scaling and the hole
// starts growing — both of those are tied to the SAME `t` derived from this
// threshold, so they can only ever start together, exactly when the words
// begin visibly zooming in, never before.
const ZOOM_START = 0.45;
// Reaching the dot's own scale factor for full-viewport coverage
// (requiredScale, computed at capture time) means scaling the wall ~60-80x
// — CSS `transform: scale()` at that extreme has shown real rendering
// problems in testing: severe blur (expected — browsers scale the already-
// rasterized pixels rather than re-rendering text at the new size, like
// zooming into a screenshot) and, worse, an intermittent hard rectangular
// clip artifact confirmed to be a GPU compositor/repaint bug, not a CSS or
// logic issue (the SAME scale value rendered clean in one test and broken
// in another — computed styles were correct both times, only the painted
// pixels differed). WALL_SCALE_CAP stops the wall itself from ever
// scaling past a value browsers render reliably; the hole keeps growing to
// full coverage past that point on its own curve instead of staying
// strictly tied to the wall's (now frozen) scale. Breaks the "hole exactly
// equals the dot's rendered size" rule for the tail end of the zoom, but
// by then the hole is already large and dominating the frame, so the
// wall's own scale isn't really what's being looked at anymore anyway.
const WALL_SCALE_CAP = 18;
// CSS `transform: scale()` scales already-rasterized pixels rather than
// re-rendering text at the new size — like zooming into a screenshot, it
// gets visibly blurry at the extreme scale factors this reveal reaches
// (60-80x, since the wall has to scale enough for the tiny dot to cover the
// whole viewport). A subtle, coarse grain overlay ramps in over the wall
// early in the zoom instead of fading it away — reads as the picture
// losing signal, on-theme with the CRT motif elsewhere on the site. Static
// (no per-frame animation on the texture itself) — an earlier version
// jittered its position/opacity via a fast CSS keyframe for "life," but
// that read as flickering rather than grain. It's a tent, not a ramp that
// holds — peaks early then fades back to 0 by GRAIN_END_T, well before the
// hole has grown large enough to dominate the screen, so grain never shows
// up peeking around the edges once Impact's content is what you're
// actually looking at — it's strictly an Attention-wall-only texture.
const GRAIN_START_T = 0.06;
const GRAIN_PEAK_T = 0.2;
const GRAIN_END_T = 0.4;
const GRAIN_MAX_OPACITY = 0.4;
// The dot of the "i" in "Attention" is the hole's starting point and size —
// not an arbitrary constant. It starts as that literal tiny dot and both
// grows AND drifts to viewport-center as the scroll continues, so the dot
// becomes the center of the viewport rather than staying pinned at its
// small on-page position while a circle just grows around it.
// How far down the "i" glyph's own box the dot sits — 0.22 put the hole's
// center too close to the stem (swallowed the gap almost immediately as it
// grew); 0.13 overcorrected the other way (real dot peeked out the bottom
// of the hole, hole sitting above it instead of on it). 0.17 splits the
// difference.
const I_DOT_Y_RATIO = 0.17;
const I_DOT_RADIUS_RATIO = 0.65; // hole's starting radius, relative to the glyph's width

/**
 * The mechanic argues the point instead of just decorating the page: words
 * that scatter from the cursor/finger literally enact "you can't hold
 * attention." Settles into a resolution line as the user scrolls through —
 * the moment it becomes catchable is the pitch.
 *
 * Words are switched to `position: absolute` (frozen at their natural flow
 * position first, so the opening read is still a normal sentence and the
 * page works before JS/without it) so each one can roam the whole stage
 * independently — no longer nudged a few px within its own flex slot,
 * constrained by neighboring words. Hitting a wall reflects the flee
 * direction and dashes again (DVD-logo-screensaver style) instead of just
 * stopping at the edge.
 *
 * Deliberately NOT a GSAP-pinned section (see AGENTS.md: flex ancestors
 * corrupt pin-spacer height, and pinning has been the single biggest source
 * of bugs in this build). Native CSS `position: sticky` gets the same
 * "stays in view while scrolling past it" effect with none of that risk;
 * ScrollTrigger here only tracks progress (scrub, no pin) to drive the
 * settle factor.
 */
export default function AttentionSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const resolutionRef = useRef<HTMLParagraphElement>(null);
  const iDotRef = useRef<HTMLSpanElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const grainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    const heading = headingRef.current;
    const resolution = resolutionRef.current;
    const overlay = overlayRef.current;
    const grain = grainRef.current;
    if (!section || !stage || !heading || !resolution || !overlay || !grain) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      resolution.style.opacity = "1";
      stage.style.visibility = "visible";
      return;
    }

    // Gradient masks don't tile the way clip-path shapes conceptually do,
    // but Chromium still needs telling not to repeat one at the edges —
    // set once, not per-frame, since it never changes.
    overlay.style.setProperty("mask-repeat", "no-repeat");
    overlay.style.setProperty("-webkit-mask-repeat", "no-repeat");

    // Every word's home position gets measured (via getBoundingClientRect)
    // and frozen further down — but if the custom display font hasn't
    // actually finished swapping in yet at that exact instant, what gets
    // measured/frozen is the FALLBACK font's (narrower) metrics, not the
    // real ones. Once the real font loads moments later and text
    // re-renders wider, a long word like "impossible" no longer fits where
    // its position was frozen to assume it would — it (and anything after
    // it) ends up positioned past where it should be, which read as a hard
    // clip with the tail of the word and the next word entirely missing.
    // Gating the whole setup on fonts genuinely being ready is the only way
    // to guarantee the measurement matches what's actually rendered. A
    // `const` arrow function here (not a hoisted `function` declaration) so
    // TypeScript's null-narrowing from the checks above actually carries
    // through into it — a hoisted declaration would be treated as
    // reachable before those checks, forcing every ref to be re-asserted.
    const setupAttention = () => {
    // Radius needed to fully cover the viewport from a given point —
    // NOT the same as hypot(vw,vh)/2 (that only covers from dead-center).
    // The dot sits above viewport center, so the true worst case is
    // whichever corner ends up farthest from it; using the centered formula
    // here left a ~60px sliver uncovered near the far corner at "full" radius.
    const radiusToCoverFrom = (x: number, y: number) =>
      Math.max(
        Math.hypot(x, y),
        Math.hypot(window.innerWidth - x, y),
        Math.hypot(x, window.innerHeight - y),
        Math.hypot(window.innerWidth - x, window.innerHeight - y),
      ) + 40;

    const words = wordRefs.current.filter((w): w is HTMLSpanElement => w !== null);

    // Freeze the natural flex-flow layout into absolute positions (relative
    // to `heading`) — this is what frees each word to roam independently.
    // Also freeze heading's own box size first, since once its children go
    // absolute it has nothing left in-flow to size itself by.
    //
    // `homes[i]` (each word's offset relative to heading) is captured once
    // and stays valid forever — it's a relative offset within heading's own
    // box, unaffected by heading's own viewport position. But heading's
    // OWN getBoundingClientRect() is NOT safe to cache: at mount time the
    // page is at scrollY 0, before this sticky section has scrolled into
    // its stuck position, so a cached value here is a snapshot from a
    // completely different scroll position than any actual interaction —
    // confirmed the hard way (flee/clamp math was silently computing
    // against a phantom position ~2250px off). Re-measure it live wherever
    // it's used for physics (getHeadingRect() below), not once at setup.
    const initialHeadingRect = heading.getBoundingClientRect();
    heading.style.width = `${initialHeadingRect.width}px`;
    heading.style.height = `${initialHeadingRect.height}px`;
    heading.style.position = "relative";
    const getHeadingRect = () => heading.getBoundingClientRect();

    const homes = words.map((w) => {
      const r = w.getBoundingClientRect();
      return {
        left: r.left - initialHeadingRect.left,
        top: r.top - initialHeadingRect.top,
        width: r.width,
        height: r.height,
      };
    });

    // The "i" dot's offset relative to heading, measured once right now
    // while everything is still at its natural mount-time position — exactly
    // the same pattern as `homes` above. This is what lets the anchor be
    // computed analytically later (getHeadingRect() + this fixed offset)
    // instead of needing to live-measure iDotRef directly, which would only
    // be trustworthy once "Attention" (a dodge-able word, unlike the old
    // static "o") has ACTUALLY finished easing back to rest — an async,
    // real-time-dependent condition that doesn't line up with scroll
    // progress and previously caused the reveal to skip straight to
    // whatever size scroll had already reached by the time it was measured.
    const iDotHome = (() => {
      const el = iDotRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: r.left - initialHeadingRect.left,
        top: r.top - initialHeadingRect.top,
        width: r.width,
        height: r.height,
      };
    })();

    words.forEach((w, i) => {
      const h = homes[i];
      w.style.position = "absolute";
      w.style.left = `${h.left}px`;
      w.style.top = `${h.top}px`;
    });

    const quickSetters = words.map((w) => ({
      x: gsap.quickTo(w, "x", { duration: FLEE_DURATION, ease: FLEE_EASE }),
      y: gsap.quickTo(w, "y", { duration: FLEE_DURATION, ease: FLEE_EASE }),
    }));

    // Per-word roaming state, independent of React — current offset from
    // home, and a timestamp lockout so a word mid-dash doesn't get
    // retargeted by the very next mousemove tick.
    const state = words.map(() => ({ x: 0, y: 0, fleeingUntil: 0 }));

    // Replays every time this section comes into view — each word
    // individually flickers into place, like a CRT signal locking onto a
    // channel, rather than the whole headline just being statically there
    // the instant you scroll in. Staggered per word, not simultaneous —
    // reads as something "catching," not a single fade. GSAP-driven, not
    // scroll-scrubbed: this plays out on its own timeline once triggered,
    // independent of scroll position, and doesn't touch `state[i].x/y` —
    // the flee physics are untouched by it.
    let entrancePlayed = false;
    let entranceTimelines: gsap.core.Timeline[] = [];
    const playWordEntrance = () => {
      if (entrancePlayed) return;
      entrancePlayed = true;
      // One flicker cue for the whole staggered entrance, not per word —
      // the stagger is only 0.09s/word, so five overlapping copies of the
      // same buzz would just read as noise, not five distinct catches.
      playFlicker();
      // Hide everything synchronously FIRST — each word's own staggered
      // timeline (below) doesn't set opacity:0 until its own delayed start,
      // so without this, later words (bigger delay) would sit fully visible
      // at their default opacity for the whole gap before their turn.
      gsap.set(words, { opacity: 0, filter: "blur(5px)" });
      entranceTimelines = words.map((word, i) =>
        gsap
          .timeline({ delay: i * 0.09 })
          .to(word, { opacity: 0.5, duration: 0.045 })
          .to(word, { opacity: 0.04, duration: 0.035 })
          .to(word, { opacity: 0.65, duration: 0.045 })
          .to(word, { opacity: 0.08, duration: 0.035 })
          .to(word, { opacity: 1, filter: "blur(0px)", duration: 0.32, ease: "power2.out" }),
      );
    };
    // Kills anything mid-flight and snaps back to the pre-entrance hidden
    // state — called on leaving the section (both directions) so the next
    // entry gets a fresh flicker instead of the words just sitting at
    // whatever opacity they happened to be at (or the guard above
    // permanently blocking a second play, which is the one-shot-forever
    // bug this replaces).
    const resetWordEntrance = () => {
      entranceTimelines.forEach((tl) => tl.kill());
      entranceTimelines = [];
      entrancePlayed = false;
      gsap.set(words, { opacity: 0, filter: "blur(5px)" });
    };

    // 0 while words are still dodge-able, ramps to 1 partway through —
    // words stop evading and the resolution line fades in. No pin: this
    // trigger only reads scroll progress through the section's natural
    // (tall) bounds.
    //
    // Starts at progress 0.23, not earlier — a single strong Mac trackpad
    // swipe (Lenis momentum stacked on top of the OS's own) can easily
    // cover several hundred px in one continuous gesture, and at the
    // section's old, shorter height that was enough to skip past the whole
    // word-game phase in one motion, landing straight on "Until now."
    // already showing. Section height bumped to 240vh specifically to give
    // this threshold (and everything downstream of it: the hold, then
    // ZOOM_START) enough absolute scroll distance that one gesture can't
    // skip past it. Settle completes at progress 0.35, comfortably before
    // the hold and ZOOM_START (0.45).
    const settle = { value: 0 };
    let settledWordsReturned = false;
    // Captured ONCE, then frozen — not updated on every tick. Computed
    // analytically (getHeadingRect() + iDotHome, both fixed/live-safe
    // values) rather than by live-measuring iDotRef directly, so it's valid
    // the instant settle reaches 1 regardless of whether "Attention" (a
    // dodge-able word) has actually finished its return tween yet.
    // requiredScale is the wall's own scale factor at which the dot's own
    // rendered size (holeStartRadius * scale) exactly reaches full-viewport
    // coverage from the final (viewport-center) position — the hole's
    // radius is never animated on its own separate curve, it's always just
    // "the dot's current on-screen size," literally.
    let anchorCaptured = false;
    let anchorX = 0;
    let anchorY = 0;
    let holeStartRadius = 0;
    let requiredScale = 1;
    // The viewport dimensions the anchor was last computed against — needed
    // to correctly SHIFT it on resize (see shiftAnchorForResize) without
    // re-measuring the DOM, which is NOT safe to do mid-zoom (see there).
    let capturedViewportWidth = 0;
    let capturedViewportHeight = 0;

    // Only safe to call while the wall's transform is still identity (i.e.
    // at the moment settle first completes, t=0) — getHeadingRect() reads
    // getBoundingClientRect(), which reflects whatever transform is
    // CURRENTLY applied to stage. Calling this again later, mid-zoom, would
    // measure the already-scaled/translated position and feed it back in
    // as if it were the untransformed rest position — compounding into a
    // wildly wrong result (confirmed: produced an anchor at x=-7, clean off
    // the left edge of the viewport).
    const captureAnchor = () => {
      if (!iDotHome) return;
      const headingRect = getHeadingRect();
      anchorX = headingRect.left + iDotHome.left + iDotHome.width / 2;
      anchorY = headingRect.top + iDotHome.top + iDotHome.height * I_DOT_Y_RATIO;
      holeStartRadius = iDotHome.width * I_DOT_RADIUS_RATIO;
      requiredScale = radiusToCoverFrom(window.innerWidth / 2, window.innerHeight / 2) / holeStartRadius;
      capturedViewportWidth = window.innerWidth;
      capturedViewportHeight = window.innerHeight;
    };

    // Safe to call ANY time, including mid-zoom — purely analytical, never
    // touches the (possibly mid-transform) DOM. The wall is `flex
    // items-center justify-center`, so the heading's rest position is
    // always exactly centered in the viewport; if the viewport's dimensions
    // change, that centered position shifts by exactly half the change on
    // each axis. holeStartRadius doesn't need updating — it's the dot's own
    // rendered size, driven by font-size, not viewport size — only
    // requiredScale (which depends on how big the CURRENT viewport is) does.
    const shiftAnchorForResize = () => {
      const dx = (window.innerWidth - capturedViewportWidth) / 2;
      const dy = (window.innerHeight - capturedViewportHeight) / 2;
      anchorX += dx;
      anchorY += dy;
      capturedViewportWidth = window.innerWidth;
      capturedViewportHeight = window.innerHeight;
      if (holeStartRadius > 0) {
        requiredScale = radiusToCoverFrom(window.innerWidth / 2, window.innerHeight / 2) / holeStartRadius;
      }
    };

    // Pure function of `progress` (plus the anchor/capture state above) —
    // deliberately callable from more than just onUpdate. GSAP can stop
    // firing onUpdate for a trigger once scroll is confirmed well outside
    // its range (a performance optimization), but onLeave/onLeaveBack only
    // used to toggle visibility, never re-render this — so after scrolling
    // ALL the way through to Impact/Proof and back in one motion, whatever
    // transform was on-screen at the LAST tick onUpdate happened to fire
    // could get frozen in place, invisible-but-wrong, until the NEXT scroll
    // event forced GSAP to recompute it. Confirmed via user report: stuck
    // until scrolling again, regardless of scroll speed — not a timing
    // race, a genuinely stale value with nothing to refresh it. Calling
    // this from onEnter/onLeave/onEnterBack/onLeaveBack too means every
    // lifecycle crossing forces a fresh, correct render for whatever
    // progress actually is at that instant — no window where it can go stale.
    const applyZoomVisual = (progress: number) => {
      if (anchorCaptured) {
        const t = gsap.utils.clamp(0, 1, (progress - ZOOM_START) / (1 - ZOOM_START));
        const cx = gsap.utils.interpolate(anchorX, window.innerWidth / 2, t);
        const cy = gsap.utils.interpolate(anchorY, window.innerHeight / 2, t);
        // Uncapped — what the dot's own scale factor would need to be for
        // full coverage. The WALL never actually renders at this (see
        // WALL_SCALE_CAP); it's only used to work out where along `t` the
        // cap gets hit, and as the reference point the hole's own,
        // decoupled tail-growth curve continues from.
        const rawScale = gsap.utils.interpolate(1, requiredScale, t);
        const wallScale = Math.min(rawScale, WALL_SCALE_CAP);

        let radius: number;
        if (t <= 0) {
          radius = 0;
        } else if (rawScale <= WALL_SCALE_CAP) {
          // Still under the cap — hole IS the dot's literal on-screen size.
          radius = holeStartRadius * rawScale;
        } else {
          // Past the cap — wall stays frozen at WALL_SCALE_CAP, hole keeps
          // growing on its own from where it was AT the cap up to full
          // coverage, over whatever's left of `t`.
          const tCap = (WALL_SCALE_CAP - 1) / (requiredScale - 1);
          const tPastCap = gsap.utils.clamp(0, 1, (t - tCap) / (1 - tCap));
          const radiusAtCap = holeStartRadius * WALL_SCALE_CAP;
          radius = gsap.utils.interpolate(radiusAtCap, radiusToCoverFrom(cx, cy), tPastCap);
        }
        // mask-image, not clip-path — see the will-change comment on the
        // overlay's own JSX below for why. A radial-gradient with both
        // color stops pinned to the SAME position (100%) is a hard binary
        // edge, not a soft fade: everything inside that radius is opaque
        // (#000, i.e. "keep"), everything outside is transparent (i.e.
        // "hide"), with no gradient blur between them — visually identical
        // to circle(...), just routed through a different (and, for a
        // rapidly-updating fixed/composited layer, more reliable) Chromium
        // rendering path.
        const hardEdgeMask = `radial-gradient(circle ${radius}px at ${cx}px ${cy}px, #000 100%, transparent 100%)`;
        overlay.style.setProperty("mask-image", hardEdgeMask);
        overlay.style.setProperty("-webkit-mask-image", hardEdgeMask);
        stage.style.transformOrigin = `${anchorX}px ${anchorY}px`;
        stage.style.transform = `translate(${cx - anchorX}px, ${cy - anchorY}px) scale(${wallScale})`;
        // Caught on video (real GPU Chrome, not this sandbox's default
        // software-rendered one) doing a rapid scroll reversal that
        // settled mid-zoom: this "wall" is unmasked and has no fade of
        // its own, so whatever scale it happens to be resting at just
        // sits there as huge, blocky, orange-tinted letter fragments
        // ("t"/"i"/"O" fragments spanning hundreds of px) — exactly the
        // reported "orange stripe." It reads fine at speed, when you fly
        // past this scale in a fraction of a second, but nothing here
        // ever treated "resting here" as different from "passing through
        // here" — a fast reversal (or just stopping) can leave a scroll
        // position permanently sitting on this exact ugly intermediate
        // frame. requiredScale is ~60-80x (see its own comment above),
        // so even a small `t` already means a big, blown-up, hard-to-read
        // wall — fading it out FAST (essentially finished by t=0.18, long
        // before the letters get large enough to read as shapes rather
        // than text) means any rest point past that threshold shows the
        // section's own plain ink background instead — identical to the
        // wall's own bg-ink, so the fade itself is invisible, only the
        // "stuck showing giant letters" failure mode is gone.
        stage.style.opacity = String(1 - smoothstep(0.02, 0.18, t));
        const grainT =
          t < GRAIN_PEAK_T
            ? gsap.utils.clamp(0, 1, (t - GRAIN_START_T) / (GRAIN_PEAK_T - GRAIN_START_T))
            : gsap.utils.clamp(0, 1, 1 - (t - GRAIN_PEAK_T) / (GRAIN_END_T - GRAIN_PEAK_T));
        grain.style.opacity = String(grainT * GRAIN_MAX_OPACITY);
      } else {
        overlay.style.setProperty("mask-image", "radial-gradient(circle 0px at 50% 50%, #000 100%, transparent 100%)");
        overlay.style.setProperty("-webkit-mask-image", "radial-gradient(circle 0px at 50% 50%, #000 100%, transparent 100%)");
        stage.style.transform = "scale(1)";
        stage.style.opacity = "1";
        grain.style.opacity = "0";
      }
    };

    const trigger = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      // "bottom bottom" ends the moment the section's bottom reaches the
      // viewport's bottom — that's only (sectionHeight - viewportHeight) of
      // scroll, NOT the section's full height, so progress hit 1 (hiding
      // both fixed layers via onLeave) hundreds of px before Impact's real
      // section — which sits at the section's TRUE bottom — ever arrived.
      // That gap was rendering as a stretch of pure black. "bottom top"
      // (section's bottom reaches viewport's TOP) is the point at
      // scrollY = sectionTop + full sectionHeight — exactly matching every
      // "progress spans the whole section" assumption made throughout this
      // file (settle timing, ZOOM_START, etc).
      end: "bottom top",
      // `true`, not a smoothing duration like `1` — Lenis (see
      // SmoothScroll.tsx: "one motion authority... every ScrollTrigger
      // elsewhere reads the same [already-smoothed] source") is already
      // the thing easing raw input into smooth scroll motion here; adding
      // GSAP's OWN scrub-smoothing on top double-smooths the same signal.
      // That's mostly invisible for small/ordinary scroll deltas, but over
      // a very large, fast scroll-back (all the way through Impact/Proof
      // and back up in one continuous motion) the two independent easing
      // systems can transiently disagree about where "now" actually is,
      // which is exactly the class of bug reported: correct at rest, wrong
      // only after a big fast reversal. `scrub: true` tracks Lenis's
      // already-smooth position exactly, with no second lag layer to drift.
      scrub: true,
      onUpdate: (self) => {
        settle.value = self.progress > 0.23 ? Math.min(1, (self.progress - 0.23) / 0.12) : 0;
        resolution.style.opacity = String(settle.value);
        // Hysteresis: only un-capture the anchor once scroll has moved
        // meaningfully back into the word-game zone (well clear of the
        // settle threshold at 0.32) — resetting on ANY dip below settle=1
        // meant ordinary scroll jitter (Lenis has
        // inertia; the raw position wobbles a few px around a resting spot)
        // right at that exact boundary repeatedly dropped and re-captured
        // the anchor, popping the hole to nothing and back. A resting
        // scroll position doesn't oscillate across a wide gap like 0.15.
        if (self.progress < 0.15) {
          anchorCaptured = false;
        } else if (!anchorCaptured && settle.value >= 1 && iDotHome) {
          // The anchor math below assumes "Attention" (a dodge-able word)
          // is EXACTLY at its home offset (x=0, y=0) — but the moment
          // settle first reaches 1 is the same tick that only KICKS OFF its
          // 0.6s return-to-home tween below; it could still be mid-flight.
          // Any residual x/y left on it at capture time silently offsets
          // where the dot actually renders from where this math assumes it
          // is — and that offset gets multiplied by the zoom's scale factor
          // (which climbs past 70x), turning even a few leftover px into a
          // large, growing on-screen drift between the hole and the dot
          // (confirmed via direct measurement — X matched exactly, Y grew
          // in lockstep with scale, the signature of exactly this). Forcing
          // it to true rest INSTANTLY here, not via a tween, is what
          // guarantees the assumption actually holds.
          state[ACCENT_WORD_INDEX].x = 0;
          state[ACCENT_WORD_INDEX].y = 0;
          const accentWord = words[ACCENT_WORD_INDEX];
          if (accentWord) gsap.set(accentWord, { x: 0, y: 0 });

          captureAnchor();
          anchorCaptured = true;
        }
        if (settle.value >= 1 && !settledWordsReturned) {
          settledWordsReturned = true;
          words.forEach((w, i) => {
            state[i].x = 0;
            state[i].y = 0;
            gsap.to(w, { x: 0, y: 0, duration: 0.6, ease: "power2.out" });
          });
        } else if (settle.value < 1) {
          settledWordsReturned = false;
        }

        // Zoom-into-the-dot reveal — grows continuously across the rest of this
        // section's own scroll range (including the dead-zone stretch after
        // the sticky word-stage releases), so there's no gap between "words
        // settle" and "circle starts opening." Impact's content sits fully
        // rendered behind the wall the whole time (see ImpactSection) — the
        // dot of the "i" is the literal peekhole into it, starting at the
        // glyph's real size/position and drifting to viewport-center as it
        // grows, rather than a circle that just grows in place. The wall
        // itself scales around the dot's fixed original position, which is
        // what sends everything else in it rushing past the camera and out
        // of frame — that does the "clearing the wall" work on its own, no
        // early opacity fade needed.
        applyZoomVisual(self.progress);
      },
      // `fixed` (not `sticky`) has no native scroll-linked show/hide of its
      // own — unlike sticky, it doesn't just naturally reappear when
      // scrolling back up, so all three layers need explicit visibility
      // toggles on all four crossing directions for the zoom to reverse
      // cleanly instead of just snapping between "stacked section" and
      // "overlay."
      onEnter: (self) => {
        stage.style.visibility = "visible";
        overlay.style.visibility = "visible";
        grain.style.visibility = "visible";
        applyZoomVisual(self.progress);
        playWordEntrance();
      },
      onLeave: (self) => {
        stage.style.visibility = "hidden";
        overlay.style.visibility = "hidden";
        grain.style.visibility = "hidden";
        applyZoomVisual(self.progress);
        resetWordEntrance();
      },
      onEnterBack: (self) => {
        stage.style.visibility = "visible";
        overlay.style.visibility = "visible";
        grain.style.visibility = "visible";
        applyZoomVisual(self.progress);
        playWordEntrance();
      },
      onLeaveBack: (self) => {
        stage.style.visibility = "hidden";
        overlay.style.visibility = "hidden";
        applyZoomVisual(self.progress);
        grain.style.visibility = "hidden";
        resetWordEntrance();
      },
    });

    /** Clamps a candidate (x, y) offset (from home) to stay within the
     * viewport's safe area, and reports which axis actually got clamped —
     * that's the "wall" a flee just hit. Takes the current heading rect so
     * callers always pass a freshly-measured one. */
    const clampToViewport = (
      headingRect: DOMRect,
      i: number,
      x: number,
      y: number,
    ) => {
      const h = homes[i];
      const minX = EDGE_PADDING - headingRect.left - h.left;
      const maxX = window.innerWidth - EDGE_PADDING - headingRect.left - h.left - h.width;
      const minY = TOP_PADDING - headingRect.top - h.top;
      const maxY = window.innerHeight - EDGE_PADDING - headingRect.top - h.top - h.height;
      const hitX = x < minX || x > maxX;
      const hitY = y < minY || y > maxY;
      return { x: Math.min(maxX, Math.max(minX, x)), y: Math.min(maxY, Math.max(minY, y)), hitX, hitY };
    };

    const flee = (i: number, cursorX: number, cursorY: number) => {
      const headingRect = getHeadingRect();
      const h = homes[i];
      const wordCx = headingRect.left + h.left + state[i].x + h.width / 2;
      const wordCy = headingRect.top + h.top + state[i].y + h.height / 2;
      let angle = Math.atan2(wordCy - cursorY, wordCx - cursorX);
      if (!isFinite(angle)) angle = Math.random() * Math.PI * 2;

      let dx = Math.cos(angle) * FLEE_DISTANCE;
      let dy = Math.sin(angle) * FLEE_DISTANCE;
      let target = clampToViewport(headingRect, i, state[i].x + dx, state[i].y + dy);

      // DVD-bounce: the direct flee path is blocked by a wall — reflect off
      // it and dash the other way, instead of just stopping at the edge.
      if (target.hitX) dx = -dx;
      if (target.hitY) dy = -dy;
      if (target.hitX || target.hitY) {
        target = clampToViewport(headingRect, i, state[i].x + dx, state[i].y + dy);
      }

      state[i].x = target.x;
      state[i].y = target.y;
      state[i].fleeingUntil = performance.now() + FLEE_DURATION * 1000 + 40;
      quickSetters[i].x(target.x);
      quickSetters[i].y(target.y);
    };

    const pointerMove = (clientX: number, clientY: number) => {
      // Locks the instant "Until now." starts fading in (settle.value > 0),
      // not only once it's fully bright (settle.value >= 1) — the words
      // should already be still by the time the resolution line is visibly
      // appearing, not still dodge-able throughout its whole fade-in.
      if (settle.value > 0) return;
      const now = performance.now();
      words.forEach((word, i) => {
        if (now < state[i].fleeingUntil) return; // mid-dash, don't retarget
        const rect = word.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dist = Math.hypot(cx - clientX, cy - clientY);
        if (dist < FLEE_RADIUS) flee(i, clientX, clientY);
      });
    };

    const onMouseMove = (e: MouseEvent) => pointerMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) pointerMove(touch.clientX, touch.clientY);
    };

    // Quiet return home — once a word hasn't fled in a bit, ease it back,
    // slowly but not glacially, like it's sneaking back into place.
    const returnTicker = window.setInterval(() => {
      const now = performance.now();
      words.forEach((word, i) => {
        if (now < state[i].fleeingUntil + 500) return; // still settling from a dash
        if (state[i].x !== 0 || state[i].y !== 0) {
          state[i].x = 0;
          state[i].y = 0;
          gsap.to(word, { x: 0, y: 0, duration: RETURN_DURATION, ease: "power2.out" });
        }
      });
    }, 700);

    stage.addEventListener("mousemove", onMouseMove);
    stage.addEventListener("touchmove", onTouchMove, { passive: true });

    // The anchor (and everything derived from it — hole start size, the
    // scale needed for full coverage) is captured once and frozen against
    // whatever the viewport happened to be at that exact moment — but the
    // EFFECTIVE viewport isn't actually static during a scroll session on
    // every browser. Safari (and some other configurations) auto-hide/show
    // their toolbar as you scroll, changing window.innerHeight with no
    // deliberate resize action from the user — inherently non-deterministic
    // in timing, which matches exactly what was reported: the clipping
    // showing up differently each time, not at a fixed, reproducible point.
    // Once that height differs from what the anchor was captured against,
    // the dot's actual current position no longer matches the frozen one
    // the whole zoom's math is built on. Re-deriving it live on resize
    // (only while a zoom is actually in progress — nothing to fix
    // otherwise) and immediately re-rendering keeps it correct instead of
    // carrying a silently-stale reference for the rest of the scroll.
    const handleResize = () => {
      if (!anchorCaptured) return;
      shiftAnchorForResize();
      applyZoomVisual(trigger.progress);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      trigger.kill();
      entranceTimelines.forEach((tl) => tl.kill());
      window.clearInterval(returnTicker);
      stage.removeEventListener("mousemove", onMouseMove);
      stage.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("resize", handleResize);
    };
    };

    let cancelled = false;
    let cleanup: (() => void) | null = null;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      cleanup = setupAttention();
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <section ref={sectionRef} className="relative min-h-[240vh] w-full bg-ink">
      <div
        ref={stageRef}
        // No `will-change-transform` here (deliberately, unlike most
        // animated elements in this build) — this is exactly the kind of
        // GPU-layer-promotion hint implicated in a class of Chrome/Safari
        // compositor bugs when combined with large/changing `scale()`
        // values, and a hard rectangular clip artifact (confirmed not a
        // CSS overflow or logic issue — same computed transform rendered
        // clean in one test, broken in another) is exactly what that class
        // of bug produces. Letting the browser decide when to promote this
        // layer, rather than forcing it up front, is the next lever to try.
        className="invisible fixed inset-0 z-30 flex flex-col items-center justify-center gap-8 bg-ink px-6 text-center"
      >
        <p className="font-mono-kicker text-xs uppercase tracking-[0.3em] text-chalk-muted">
          [ the problem ]
        </p>
        <h2
          ref={headingRef}
          className="flex max-w-4xl flex-wrap items-center justify-center gap-x-5 gap-y-2 font-display text-4xl font-semibold leading-tight text-chalk sm:text-6xl md:text-7xl"
        >
          {WORDS.map((word, i) => (
            <span
              key={word}
              ref={(el) => {
                wordRefs.current[i] = el;
              }}
              className={
                i === ACCENT_WORD_INDEX
                  ? "inline-block text-accent will-change-transform [text-shadow:0_0_28px_rgba(255,78,50,0.45)]"
                  : "inline-block will-change-transform"
              }
            >
              {i === ACCENT_WORD_INDEX ? (
                <>
                  Attent
                  <span ref={iDotRef}>i</span>
                  on
                </>
              ) : (
                word
              )}
            </span>
          ))}
        </h2>
        <p
          ref={resolutionRef}
          className="font-mono-kicker text-sm uppercase tracking-[0.25em] text-accent opacity-0 [text-shadow:0_0_24px_rgba(255,78,50,0.5)]"
        >
          Until now.
        </p>
      </div>

      {/* Coarse, static grain — a subtle cover for the CSS-transform-scale
          blur "Attention" would otherwise show at extreme zoom (60-80x).
          On top of the wall, below the reveal hole (z-30 < z-[35] < z-40) —
          the noise sits on the glass, not on the content, so it doesn't
          scale/move with the wall's own transform. Static, no per-frame
          animation on the texture — an earlier version jittered it via a
          CSS keyframe for "life," but that read as flickering, not grain.
          The noise itself is still generated with feTurbulence, but as a
          `background-image` data-URI (a static, once-rasterized bitmap
          tile), not a live `filter:` applied to this fixed, full-viewport
          layer — feTurbulence as a live CSS filter is one of the most
          expensive effects mobile Safari can be asked to run, and this
          layer sits active for this section's entire 240vh scroll range
          on a page that's already continuously repainting via Lenis/GSAP,
          which can force WebKit to keep re-evaluating rather than caching
          the filtered raster. Moving the same noise generation into a
          pre-rasterized tile keeps the identical look for a fraction of
          the cost — reported directly as real, severe mobile lag through
          this exact section. */}
      <div
        ref={grainRef}
        className="invisible pointer-events-none fixed inset-0 z-[35] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.25' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.9 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundRepeat: "repeat",
          backgroundColor: "#888",
          opacity: 0,
        }}
      />

      {/* Zoom-into-the-dot-of-"i" reveal overlay — mirrors ImpactSection's content
          exactly so once it fully covers the viewport and hands off to the
          real ImpactSection sitting in normal flow right below, the swap is
          imperceptible. Fixed (not sticky): tracks this section's scroll
          progress continuously with no un-stick math of its own, which is
          what lets it keep growing straight through the stretch where the
          word-stage above has already released. */}
      <div
        ref={overlayRef}
        // Masked with mask-image (a radial-gradient), not clip-path — see
        // the hard-edge-mask comment in applyZoomVisual for why. clip-path
        // animated on a `position: fixed`, high-z-index layer is a known
        // Chromium bug class: stale/mismatched raster tiles leave a
        // hard-edged rectangular slice of this layer's content (the orange
        // glow blob) visibly stuck on screen after a fast scroll reversal —
        // matches the report exactly, and explains why the JS-computed
        // clip-path value always read correctly under inspection even
        // though the pixels didn't: the bug was in how the GPU painted that
        // value, not the value itself. A `will-change: clip-path` hint
        // alone didn't fix it (Chromium can still ignore/drop a hint under
        // memory pressure or between updates); `transform: translateZ(0)`
        // forces this onto a PERMANENT composited layer instead of a hint,
        // and mask-image runs through a different rasterization path than
        // clip-path entirely, sidestepping the specific bug either way.
        className="invisible pointer-events-none fixed inset-0 z-40 flex items-center justify-center overflow-hidden bg-ink [transform:translateZ(0)]"
        style={{ maskImage: "radial-gradient(circle 0px at 50% 50%, #000 100%, transparent 100%)", WebkitMaskImage: "radial-gradient(circle 0px at 50% 50%, #000 100%, transparent 100%)" }}
      >
        <div className="pointer-events-none absolute h-[60vmin] w-[60vmin] scale-125 rounded-full bg-accent blur-[100px]" />
        <div className="relative z-10 flex flex-col items-center gap-4 px-6 text-center">
          <p className="font-mono-kicker text-xs uppercase tracking-[0.3em] text-chalk-muted">[ impact ]</p>
          <h2 className="max-w-3xl font-display text-4xl font-semibold leading-tight text-chalk sm:text-5xl md:text-6xl">
            Then we hit{" "}
            {/* Invisible, not omitted — keeps the exact same layout/spacing
                as the real ImpactSection (which reveals this word itself,
                see ImpactSection.tsx) so the handoff stays seamless, while
                not spoiling the payoff word through the hole before the
                real section's own reveal gets to play it. */}
            <span className="text-accent opacity-0 [text-shadow:0_0_24px_rgba(255,78,50,0.5)]">
              the mark
            </span>
            .
          </h2>
        </div>
      </div>
    </section>
  );
}
