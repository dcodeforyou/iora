"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { gsap } from "@/lib/scroll/gsapSetup";
import { getLenisInstance, lockLenisScroll, unlockLenisScroll } from "@/lib/scroll/lenisInstance";
import {
  signalBlend,
  HERO_PIN_VH_MULTIPLIER,
  HERO_ENTRY_SETTLE_PROGRESS,
  HERO_EXPLODE_SETTLE,
  HERO_SCREEN_BREAK_MID,
  HERO_IMPACT_TIME,
  HERO_SIGNAL_BLEND_DURATION,
} from "@/lib/scroll/heroEntry";
import { initHeroVideo, playHeroVideo, getActiveVideoKey } from "@/lib/scroll/heroVideo";
import { initHeroMusic } from "@/lib/scroll/heroMusic";

// Real telegram convention: "STOP" stood in for a period, since
// punctuation wasn't reliably transmittable over telegraph lines (and
// was billed as an extra word regardless) — rendered smaller than the
// message itself here for the same reason a period is smaller than the
// words around it, not shouting at the same volume as the sentence.
// Two lines, not one paragraph — big, headline-scale type reads as one
// long run-on line otherwise; splitting where the sentence actually
// breaks (each STOP is a full stop) keeps it legible at this size.
const LINES = ["NOISE IS CHEAP STOP", "SIGNAL IS NOT STOP"];
type Ch = { char: string; small: boolean };
// Chars grouped into WORDS purely for layout safety, NOT animation
// timing (the reveal below still strikes in letter by letter, typewriter
// style — see the effect). Individual inline-block characters gave the
// browser no signal that "STOP" was one unit, so it could (and on a
// 390px viewport, did) line-wrap mid-word. Each word is its own flex
// item instead (rendered via `inline-flex`, spacing between words via
// `gap-x` rather than literal space characters) — flex items don't break
// internally, so wrapping can only happen between whole words, while the
// characters inside a word still animate independently.
const LINE_WORDS: Ch[][][] = LINES.map((line) =>
  line
    .split(/(STOP)/g)
    .filter(Boolean)
    .flatMap((segment) => segment.split("").map((char) => ({ char, small: segment === "STOP" })))
    .reduce<Ch[][]>((words, c) => {
      if (c.char === " ") return [...words, []];
      const last = words[words.length - 1];
      if (last) last.push(c);
      return words;
    }, [[]])
    .filter((word) => word.length > 0),
);

/**
 * The page's own "TV turns on" reveal — plays exactly once, on first
 * mount, before the page is otherwise interactive. Not a single timeline
 * anymore: it plays a boot sequence, then WAITS (scroll still locked) at an
 * explicit entry button rather than auto-continuing, and only the click
 * hands control back — see the two-timeline split below.
 *
 * Boot sequence (`tl`), fully automatic, four beats:
 *   1. A brief flash (the flyback transformer surge/electron gun
 *      warming up).
 *   2. The whole screen — nav included, this is the TV's own picture
 *      switching on, not just Hero's CRT static canvas — grows from a
 *      thin horizontal line at center out to full height. That's the
 *      real, physical CRT power-on silhouette: the mirror image of how
 *      a CRT actually collapses to a line and then a dot on power-OFF
 *      (well-documented, searched for the real reference before
 *      building this rather than guessing).
 *   3. A short telegram-style message strikes out letter by letter,
 *      typewriter-style — each character starts slightly oversized and
 *      snaps down to its resting size almost instantly (a mechanical
 *      "stroke," not a soft fade) — the thesis of the whole site stated
 *      once, plainly.
 *   4. An entry button fades in ("Enter Iora Stop" — a third line of the
 *      same transmission, not a separate UI label) — this is the ONLY
 *      way past this screen now. No auto-continue, no scroll-to-dismiss,
 *      no timeout. Scroll stays fully locked until it's clicked.
 *
 * Click (`handleEnter`), fired by the button: the real hero video starts
 * playing (see heroVideo.ts) right underneath the boot group (message +
 * button) fading out, WHILE — same timeline, same start time —
 * `signalBlend` (see heroEntry.ts) tweens from 0 to 1, read every frame by
 * CrtScreenShard's own shader to resolve the procedural static into the
 * live picture. The screen's overall visibility is untouched by this —
 * it's scroll-progress only (see HeroScene's Orchestrator) — so the screen
 * stays opaque and the video stays watchable all the way through the
 * pre-impact hold. Once the fade/blend finishes, a second, scroll-driven
 * sequence takes over (still in `handleEnter`, see its own doc comment) and
 * drives real scroll through Hero's existing break/explode/settle
 * choreography, timed so the screen-crack snap lands exactly on the
 * video's own real impact frame (`HERO_IMPACT_TIME`) — "someone approaching
 * from behind, screen shatters on impact," now genuinely synced to real
 * footage rather than an independent guessed duration. Scroll only unlocks
 * once that whole sequence finishes.
 *
 * Once entered, there is no way back to this screen for the rest of the
 * session — scrolling to the top later shows the already-broken Hero, not
 * a re-armed CRT/button. Only an actual page reload replays any of this,
 * which falls out for free: `signalBlend` is a plain module-level object,
 * and a real reload re-executes the module from scratch.
 *
 * Two solid `ink` bars covering the top/bottom halves of the viewport,
 * retracting via `transform: scaleY` (not `clip-path` on the real page,
 * and not `height`) — scaleY is compositor-only/GPU-cheap, and doing
 * this as an overlay means the real page content (including Hero's own
 * WebGL canvas) is never itself transformed/resized mid-animation, only
 * covered and uncovered from outside. `transform-origin` on each bar is
 * its own OUTER edge (top bar: top; bottom bar: bottom), so shrinking
 * toward 0 pulls each bar's INNER edge back toward the vertical center,
 * which is what actually reveals the growing band.
 */
export default function CrtPowerOn() {
  // Rendered unconditionally from the root layout, which now also covers
  // /work and its subroutes — this "TV turns on" boot sequence is Hero's
  // own one-time entrance beat, not a site-wide chrome piece, so it needs
  // to opt out everywhere except the actual homepage rather than
  // replaying (or worse, scroll-locking via its own ScrollTrigger setup)
  // on every route. Called before the early return below so hook order
  // stays stable regardless of route.
  const pathname = usePathname();
  const flashRef = useRef<HTMLDivElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const bottomBarRef = useRef<HTMLDivElement>(null);
  const textWrapRef = useRef<HTMLDivElement>(null);
  const charRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const signalLostRef = useRef<HTMLParagraphElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // The DOM nodes below are now always rendered (see the `display`
    // toggle at the bottom of this component, replacing an earlier
    // conditional `return null` that caused a real bug — see its own
    // comment), so their refs attach regardless of the route the app
    // happened to first load on. This effect's own boot/scroll-lock
    // logic still must only ever run for an actual "/" landing — a
    // fresh load on /work would otherwise silently lock scroll for
    // ~1.5s playing an entirely invisible (display:none) boot sequence.
    // `pathname` here is intentionally the value from this effect's own
    // FIRST run (empty dep array) — "did this session start on /", not
    // "is the user currently on /". If the session started elsewhere,
    // skip the boot entirely — but still push these elements straight
    // to their POST-boot state (not their raw CSS defaults), the same
    // way the reduced-motion branch below does. Otherwise the first-ever
    // navigation INTO "/" during a session that started on /work would
    // reveal the bars still at their untouched, un-retracted 50vh
    // height — the same black-screen shape this whole fix is for, just
    // reached via a different path (never boot at all vs. re-mounting
    // after boot).
    if (pathname !== "/") {
      const flash = flashRef.current;
      const topBar = topBarRef.current;
      const bottomBar = bottomBarRef.current;
      const textWrap = textWrapRef.current;
      const signalLost = signalLostRef.current;
      const button = buttonRef.current;
      if (flash && topBar && bottomBar && textWrap && signalLost && button) {
        gsap.set([topBar, bottomBar], { scaleY: 0 });
        gsap.set(flash, { opacity: 0 });
        gsap.set(textWrap, { opacity: 0 });
        gsap.set(signalLost, { opacity: 0 });
        gsap.set(button, { opacity: 0, pointerEvents: "none" });
        signalBlend.value = 1;
      }
      return;
    }

    const flash = flashRef.current;
    const topBar = topBarRef.current;
    const bottomBar = bottomBarRef.current;
    const textWrap = textWrapRef.current;
    const signalLost = signalLostRef.current;
    const button = buttonRef.current;
    const chars = charRefs.current.filter((c): c is HTMLSpanElement => c !== null);
    if (!flash || !topBar || !bottomBar || !textWrap || !signalLost || !button || chars.length === 0) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set([topBar, bottomBar, flash], { display: "none" });
      gsap.set(textWrap, { opacity: 1 });
      gsap.set(chars, { opacity: 1, scale: 1 });
      gsap.set(signalLost, { opacity: 1 });
      // No button, no lock, no wait — reduced motion skips straight to the
      // already-entered state (see AGENTS.md: show final states directly).
      gsap.set(button, { display: "none" });
      signalBlend.value = 1;
      return;
    }

    // Kicks off the video network request as early as physically possible
    // — before scroll is even locked, before the boot timeline's own
    // double-rAF defer (see below). This is a hard site requirement (see
    // this component's own doc comment): both the video and the WebGL
    // shard shaders (warmed separately, see HeroScene.tsx's
    // gl.compileAsync) must be ready well before "[ signal lost ]" ever
    // fades in, not just before the button becomes clickable.
    initHeroVideo();
    // Also arms the background-music loop-start subscription (see
    // heroMusic.ts) and starts its own network request early — it won't
    // actually PLAY until the hero video's post-impact loop begins, but
    // the file should already be loaded by then, same reasoning as the
    // video itself.
    initHeroMusic();

    // Locks scroll until the entry button is clicked (see handleEnter) —
    // `overflow: hidden` alone is NOT the actual guarantee here: Lenis
    // intercepts wheel/touch input itself and drives scroll through its
    // own RAF loop, bypassing native overflow entirely, so a real lock
    // requires Lenis itself to be stopped. `lockLenisScroll` (not a bare
    // `getLenisInstance()?.stop()`) specifically because CrtPowerOn
    // mounts and runs this effect BEFORE SmoothScroll creates the real
    // Lenis instance (see layout.tsx's render order) — confirmed
    // directly that a bare `.stop()` here was a no-op on a still-null
    // instance, silently leaving the freshly-created one never stopped.
    // Applied immediately (not deferred, unlike the timeline below) —
    // the black pre-flash frame should already be scroll-locked.
    document.documentElement.style.overflow = "hidden";
    lockLenisScroll();

    // Explicit reset — React Strict Mode double-invokes this effect in
    // dev (mount, cleanup, mount again); without this, the second run
    // would continue animating from wherever the first run's killed
    // tween happened to leave things.
    gsap.set([topBar, bottomBar], { scaleY: 1 });
    gsap.set(flash, { opacity: 0 });
    gsap.set(textWrap, { opacity: 1 });
    gsap.set(chars, { opacity: 0, scale: 1.7 });
    gsap.set(signalLost, { opacity: 0 });
    gsap.set(button, { opacity: 0, pointerEvents: "none" });
    signalBlend.value = 0;

    // Building/starting the timeline is deferred two animation frames
    // past mount, not synchronous — SmoothScroll sets
    // `gsap.ticker.lagSmoothing(0)` globally (needed so Lenis's own
    // tweens don't unnaturally "catch up" after a stutter), which also
    // means GSAP applies the FULL elapsed time on its very first tick
    // with no cap. Page mount is exactly when that first tick tends to
    // have an inflated delta (hydration/JS parsing was blocking the
    // main thread right up until then) — confirmed empirically: without
    // this, the sequence visibly snapped toward its end state within the
    // first ~150ms. Two rAFs (not one) is the standard margin for "wait
    // until the browser has genuinely settled into steady per-frame
    // ticking," not just "wait one tick."
    let rafId1 = 0;
    let rafId2 = 0;
    let tl: gsap.core.Timeline | null = null;
    rafId1 = requestAnimationFrame(() => {
      rafId2 = requestAnimationFrame(() => {
        // No onComplete here anymore — the boot sequence's job now ends
        // at "button visible and clickable," not "scroll unlocked." See
        // handleEnter below for what happens next.
        tl = gsap.timeline();
        // A single, modest-brightness pulse — not full white, and not
        // repeating: one flash isn't the rapid strobing AGENTS.md's
        // flash-rate note warns about, that's about REPEATED flashing.
        // Fully SEQUENTIAL with the bars below, not overlapping —
        // verified via a recorded video that an earlier overlapping
        // version was a real bug, not just a look: the flash was still
        // substantially opaque while the bars retracted, so the thin
        // bright line — the actual iconic moment of this whole effect —
        // was washed out under a gray haze and never visible at all.
        tl.to(flash, { opacity: 0.8, duration: 0.05, ease: "power1.in" }).to(flash, {
          opacity: 0,
          duration: 0.15,
          ease: "power1.out",
        });
        // The bars retract together, starting only once the flash has
        // fully cleared — the picture growing from a thin line at
        // center out to the full screen, actually visible as a line.
        tl.to([topBar, bottomBar], { scaleY: 0, duration: 0.55, ease: "power2.out" });
        // The message strikes in letter by letter — a typewriter stroke,
        // not a fade: each character starts oversized (like the type-bar
        // has just struck the page, ink still spreading) and snaps down
        // hard to its resting size almost instantly. `power3.out` is a
        // much harder deceleration than the `power1.out` used elsewhere
        // on this site — deliberate here, a mechanical impact reads as
        // fast-then-stop, not a gentle ease; everywhere else on the site
        // stays in the softer register per AGENTS.md, this is the one
        // documented exception for a literal impact, same idea as
        // Impact's own two-step "hit" pop.
        tl.to(
          chars,
          { opacity: 1, scale: 1, duration: 0.1, stagger: 0.045, ease: "power3.out" },
          "+=0.1",
        );
        // "[ signal lost ]" — the same small kicker label Hero's own
        // headline used to carry, moved here to sit with the telegram
        // message it actually describes (the CRT losing signal, not "we
        // break through the noise" — that headline is the resolution,
        // not the loss). A soft fade once the STOP lines finish
        // striking in, not another mechanical stroke — this is a status
        // label commenting on the message above it, not part of the
        // message itself.
        tl.to(signalLost, { opacity: 1, duration: 0.3, ease: "power1.out" }, "+=0.15");
        // The entry button — the actual end of the automatic boot
        // sequence now. Fades in after signal-lost, then becomes
        // clickable (`pointerEvents: "auto"` only set once fully
        // visible, so a click can't land mid-fade-in). Nothing beyond
        // this in the timeline: the sequence just stops here and waits,
        // scroll still locked, until handleEnter fires.
        tl.to(button, { opacity: 1, duration: 0.4, ease: "power1.out" }, "+=0.2").set(button, {
          pointerEvents: "auto",
        });
      });
    });

    return () => {
      cancelAnimationFrame(rafId1);
      cancelAnimationFrame(rafId2);
      tl?.kill();
      // Deliberately NOT unlocking scroll here (an earlier version did,
      // unconditionally) — this cleanup's only real caller in practice is
      // React Strict Mode's synthetic dev-only double-invoke (mount →
      // cleanup → mount again), which fires almost immediately, before the
      // deferred double-rAF above even gets a chance to build the real
      // boot timeline. That synthetic cleanup was calling
      // `unlockLenisScroll()` unconditionally, which raced against the
      // SECOND (real) mount's own `lockLenisScroll()` — confirmed directly
      // as the cause of a real bug: clicking the entry button sometimes
      // did nothing visible and immediately unlocked scroll, because
      // scroll had already been silently unlocked by this cleanup well
      // before the click. This component never truly unmounts in
      // practice (see the `display: none` toggle below instead of
      // `return null`), so there's no real "component is actually gone,
      // must release the lock" case this would ever need to cover — the
      // next real mount's own lock call is what's authoritative.
    };
  }, []);

  // Fired by the entry button's onClick. Two stages, both still fully
  // scroll-locked from the user's side:
  //
  // Stage 1 (`exitTl`): the message+button group fades out while, on the
  // same timeline at the same start time, the real hero video starts
  // playing (`playHeroVideo()`, called first — this is video-clock t=0 for
  // every duration computed below) and `signalBlend` tweens 0 -> 1 (read
  // every frame by CrtScreenShard's own shader — see heroEntry.ts), the
  // procedural static resolving into the live picture. This does NOT fade
  // the screen's own visibility anymore — an earlier version did, which
  // hid the screen (and the video on it) within ~0.7s of the click
  // regardless of scroll, well before any real video could ever reach its
  // own impact frame. Visibility is scroll-progress only now (see
  // HeroScene's Orchestrator) — the screen stays fully opaque, showing the
  // real video, all the way through the hold below.
  //
  // Stage 2 (`scrollTl`, in exitTl's onComplete): rather than building a
  // second, separate shatter/explode/settle animation, this drives a REAL
  // scroll — Lenis's own `force: true` scrollTo option scrolls even while
  // stopped, called with `immediate: true` every frame (a plain jump, no
  // extra easing/lerp layered on top from Lenis's own side). That real
  // scroll change flows through the exact same path a genuine user
  // scroll would: `lenis.on("scroll", ScrollTrigger.update)` in
  // SmoothScroll.tsx fires, Hero's own ScrollTrigger recomputes
  // `progress.value` from real scroll position, and HeroScene's
  // Orchestrator plays the break/explode/settle exactly as already built
  // and tested for scroll-scrub — zero new WebGL/shatter code needed here.
  //
  // GSAP drives the actual pacing (a plain `proxy.p` value, tweened by a
  // timeline), NOT Lenis's own scrollTo duration/easing — an earlier
  // version chained three separate async `lenis.scrollTo(...)` calls back
  // to back via onComplete callbacks, and the REAL measured timing didn't
  // match the specified durations at all (confirmed directly: a chain
  // specified to take ~4.4s total measured at ~2.5s, with segments
  // finishing in well under their stated duration) — chaining Lenis's own
  // async animations back-to-back has timing behavior this codebase
  // doesn't otherwise rely on or trust. GSAP's timeline timing is proven
  // throughout this entire build; using it here too and making Lenis a
  // dumb per-frame position-setter is the more robust split — pacing
  // precision from the system already trusted for it, scroll-position
  // side-effects from the system that owns scroll. Critically, a GSAP
  // tween ALWAYS reaches its `to` target at exactly its stated `duration`
  // regardless of the ease curve's shape — which is what makes it possible
  // to pin the screen-break to a real video timestamp below just by
  // choosing the right segment duration, with no need to reverse-engineer
  // where a non-linear ease curve sits at an arbitrary point in time.
  //
  // THREE segments, aligned to real moments rather than one uniform tween:
  //   1. proxy 0 -> HERO_SCREEN_BREAK_MID (a point inside HeroScene's own
  //      SCREEN_BREAK_START..END window) — duration is HERO_IMPACT_TIME
  //      minus HERO_SIGNAL_BLEND_DURATION, i.e. exactly enough real time
  //      that this segment's END (a GSAP tween always lands its target
  //      exactly on schedule) coincides with the video's own real impact
  //      frame (see heroEntry.ts — both source cuts were frame-inspected
  //      independently and land the kick at the same timestamp). The
  //      subtraction accounts for exitTl's own duration already having
  //      elapsed, in video-clock terms, before this segment even starts.
  //      This is what makes the WebGL screen-crack snap land on the exact
  //      video frame where the figure's boot actually connects.
  //   2. HERO_SCREEN_BREAK_MID -> HERO_EXPLODE_SETTLE — the slomo burst
  //      continuing after the break, given a deliberately generous
  //      duration (real shard-explosion window, not rushed).
  //   3. HERO_EXPLODE_SETTLE -> HERO_ENTRY_SETTLE_PROGRESS — quick
  //      settle-arrival, the small remaining distance to the actual
  //      handoff point.
  //
  // Landing progress is HERO_ENTRY_SETTLE_PROGRESS (0.68, inside the
  // settle plateau) — real scroll position is genuinely sitting there
  // once this finishes, so the user's very next real scroll continues
  // smoothly from exactly that point, no jump. Scroll only unlocks once
  // the WHOLE timeline finishes — not after the fade alone, and not
  // partway through the explode, which were both earlier (wrong)
  // versions of this.
  const handleEnter = () => {
    const textWrap = textWrapRef.current;
    const button = buttonRef.current;
    if (!textWrap || !button) return;
    button.style.pointerEvents = "none";

    // Video-clock t=0 — every duration in this function is measured from
    // this exact call, since the video starts playing right here,
    // underneath the fade (not after it).
    playHeroVideo();

    const exitTl = gsap.timeline({
      onComplete: () => {
        const lenis = getLenisInstance();
        if (!lenis || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          // No Lenis (shouldn't happen here) or a reduced-motion user who
          // still somehow reached this click path — skip straight to the
          // landing position instead of animating through it.
          document.documentElement.style.overflow = "";
          unlockLenisScroll();
          return;
        }

        const pinDistance = window.innerHeight * HERO_PIN_VH_MULTIPLIER;
        const proxy = { p: 0 };
        const jumpTo = (p: number) => lenis.scrollTo(pinDistance * p, { immediate: true, force: true });

        const scrollTl = gsap.timeline({
          onComplete: () => {
            document.documentElement.style.overflow = "";
            unlockLenisScroll();
          },
        });
        // Approach — covers the pre-break hold (the video plays, visible,
        // the whole time) AND the screen-break snap itself, timed so this
        // segment's end lands exactly on the video's real impact frame.
        // scrollTl itself starts HERO_SIGNAL_BLEND_DURATION seconds after
        // playHeroVideo() was called (exitTl's own duration), so that's
        // subtracted from the target video timestamp to get this
        // segment's own real duration.
        const approachDuration = Math.max(0.1, HERO_IMPACT_TIME - HERO_SIGNAL_BLEND_DURATION);
        scrollTl.to(proxy, {
          p: HERO_SCREEN_BREAK_MID,
          duration: approachDuration,
          ease: "power1.in",
          onUpdate: () => jumpTo(proxy.p),
        });
        // Mobile-only extra hold right after the screen-crack lands, before
        // the shards actually start flying — reported directly as the
        // explosion burst starting too soon on mobile. Doesn't touch
        // approachDuration above (that's precisely synced to the video's
        // own real impact frame, confirmed identical across both source
        // cuts — shifting it would desync the crack from the video kick),
        // just adds a pure pause between the crack landing and the slomo
        // explode segment starting, mobile only. `{}, { duration }` — a
        // real no-op tween on an empty object, purely to consume timeline
        // time, since GSAP timelines don't have a bare "wait" method.
        // Started at 0.7, then reported as reading too late — trimmed to
        // 0.2.
        if (getActiveVideoKey() === "mobile") {
          scrollTl.to({}, { duration: 0.2 });
        }
        // The slomo segment — real shard-explosion window, given real
        // extra time rather than being buried in the fast middle of a
        // longer uniform ease.
        scrollTl.to(proxy, {
          p: HERO_EXPLODE_SETTLE,
          duration: 1.8,
          ease: "power1.inOut",
          onUpdate: () => jumpTo(proxy.p),
        });
        // Settle arrival — quick again, the small remaining distance to
        // the actual handoff point.
        scrollTl.to(proxy, {
          p: HERO_ENTRY_SETTLE_PROGRESS,
          duration: 0.5,
          ease: "power1.out",
          onUpdate: () => jumpTo(proxy.p),
        });
      },
    });
    exitTl.to(textWrap, { opacity: 0, filter: "blur(8px)", duration: 0.4, ease: "power1.out" }, 0);
    // The static resolving into the real video feed — deliberately slower
    // than the boot sequence's own mechanical beats (that's a
    // stroke/impact register; this is the first half of a cinematic
    // "someone approaching" reveal, not a snap).
    exitTl.to(signalBlend, { value: 1, duration: HERO_SIGNAL_BLEND_DURATION, ease: "power2.out" }, 0);
  };

  // NOT a conditional `return null` (the earlier version) — this
  // component is rendered once from the root layout and never remounts
  // on client-side navigation, but its effect above (which does the
  // actual boot animation and one-time gsap.set retract) also only ever
  // runs ONCE, tied to true component mount. `return null` unmounts
  // these DOM nodes (React detaches the refs and destroys them) every
  // time you navigate off "/", then RECREATES fresh, un-animated nodes
  // the moment you navigate back — with no effect re-run to ever set
  // their retracted state again. Net result, reproduced directly: the
  // two bars come back at their CSS-default, un-transformed size (each
  // is 50vh tall) covering the entire viewport in solid `bg-ink`, i.e. a
  // full black screen, on every "navigate away from / and back" trip.
  // Keeping the same DOM nodes alive permanently (hidden via `display:
  // none` instead of unmounted) means their already-correct retracted
  // state, once set, is never touched again.
  let flatIndex = 0;

  return (
    <div style={pathname === "/" ? undefined : { display: "none" }}>
      <div
        ref={flashRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[200] bg-chalk opacity-0"
      />
      <div
        ref={topBarRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-[190] h-[50vh] origin-top bg-ink"
      />
      <div
        ref={bottomBarRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[190] h-[50vh] origin-bottom bg-ink"
      />
      <div
        ref={textWrapRef}
        className="pointer-events-none fixed inset-0 z-[195] flex flex-col items-center justify-center gap-2 px-6 text-center opacity-0"
      >
        <p
          ref={signalLostRef}
          aria-hidden="true"
          className="mb-2 font-mono-kicker text-xs uppercase tracking-[0.3em] text-chalk-muted opacity-0"
        >
          [ signal lost ]
        </p>
        {LINE_WORDS.map((wordsInLine, lineIdx) => (
          <p
            key={lineIdx}
            aria-hidden="true"
            className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 font-mono-kicker uppercase tracking-[0.05em] text-chalk [text-shadow:0_1px_4px_rgba(0,0,0,0.45)] sm:gap-x-5 sm:tracking-[0.1em] md:gap-x-6"
          >
            {wordsInLine.map((word, wordIdx) => (
              <span key={wordIdx} className="inline-flex">
                {word.map((c) => {
                  const i = flatIndex++;
                  return (
                    <span
                      key={i}
                      ref={(el) => {
                        charRefs.current[i] = el;
                      }}
                      className={
                        c.small
                          ? "inline-block align-baseline text-xl sm:text-2xl md:text-3xl"
                          : "inline-block align-baseline text-5xl sm:text-6xl md:text-7xl"
                      }
                    >
                      {c.char}
                    </span>
                  );
                })}
              </span>
            ))}
          </p>
        ))}
        {/* The only way past this screen — see handleEnter. Reads as a
            third line of the SAME telegram transmission above it, not a
            separate UI element bolted on: same uppercase mono-kicker
            voice, same "STOP" period-convention and small/big size
            split as LINE_WORDS — no brackets, that's the small kicker-
            label register ("[ signal lost ]"), a different voice from
            the message itself. Amber border + text at REST now, not just
            on hover — this is the only interactive element on the whole
            boot screen, and a dim chalk/40 outline blended into the
            static enough that it didn't read as clickable at all; full
            accent at rest makes it the one obvious thing to click. Hover
            inverts to a filled accent pill (bg-accent, ink text) — the
            same "lift + color inversion" CTA hover language this site
            already uses elsewhere (see WhatsAppButton), now free to be
            the hover state since accent-at-rest took its old job. Static
            `opacity-0` class is the SSR-safe default (matches
            signalLostRef's own pattern); GSAP owns both opacity and
            pointer-events from mount once the effect runs. */}
        <button
          ref={buttonRef}
          type="button"
          onClick={handleEnter}
          className="mt-8 flex items-baseline gap-x-3 border border-accent px-8 py-4 font-mono-kicker uppercase tracking-[0.05em] text-accent opacity-0 transition-colors duration-300 hover:bg-accent hover:text-ink sm:tracking-[0.1em]"
        >
          <span className="text-2xl sm:text-3xl md:text-4xl">Enter Iora</span>
          <span className="text-base sm:text-lg md:text-xl">Stop</span>
        </button>
      </div>
    </div>
  );
}
