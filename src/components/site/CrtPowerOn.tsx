"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { gsap } from "@/lib/scroll/gsapSetup";
import { getLenisInstance, lockLenisScroll, unlockLenisScroll } from "@/lib/scroll/lenisInstance";
import {
  signalBlend,
  shardShadersReady,
  HERO_PIN_VH_MULTIPLIER,
  HERO_ENTRY_SETTLE_PROGRESS,
  HERO_EXPLODE_SETTLE,
  HERO_SCREEN_BREAK_MID,
  HERO_IMPACT_TIME,
  HERO_SIGNAL_BLEND_DURATION,
} from "@/lib/scroll/heroEntry";
import { initHeroVideo, playHeroVideo, getActiveVideoKey, heroVideoProgress } from "@/lib/scroll/heroVideo";
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

/*
  ── LOADER: APPEARANCE ONLY ──────────────────────────────────────────────
  Everything below changes what the loading indicator LOOKS like — the words
  it shows and how they animate — and nothing about what it DOES. The
  readiness logic it reports on (combinedProgress, the 12s wall-clock
  deadline, the 100ms poll, releasing on `p >= 1`, revealButton) is the
  original code, untouched, because that is what guarantees the hero video
  and shard shaders are actually ready before anyone can enter.

  A previous attempt rewrote that logic as well and cost real time to undo.
  If this section ever needs changing again: the visual layer is here, the
  functional layer is in startLoadingBar, and they should stay separable.

  The indicator itself is the type. Two phrases alternate in place, each
  character masked and wiped up into frame, and the load level rises as an
  accent fill inside otherwise hollow letterforms.
*/
const LOADER_PHRASES = ["GATHERING SIGNAL", "PREPARING IORA WORLD"];

// Flat index ranges, one per phrase, over the rendered (non-space)
// characters — this is what lets the animation address a single phrase
// while the refs stay in one flat array, which is the form the
// react-hooks/refs lint rule accepts.
const LOADER_PHRASE_RANGES: readonly (readonly [number, number])[] = (() => {
  let next = 0;
  return LOADER_PHRASES.map((phrase) => {
    const start = next;
    next += [...phrase].filter((c) => c !== " ").length;
    return [start, next] as const;
  });
})();

// Entrance/exit are kept short: this is transition, not content. Stagger is
// a TOTAL SPAN rather than a per-character delay, so both phrases take the
// same time regardless of length instead of the longer one visibly
// dragging.
const LOADER_CHAR_IN = 0.22;
const LOADER_CHAR_OUT = 0.16;
const LOADER_IN_STAGGER_SPAN = 0.12;
const LOADER_OUT_STAGGER_SPAN = 0.08;
// Settled dwell, an upper bound rather than a promise — the loader lives
// exactly as long as the assets take, so a fast load may cut a phrase short.
// That is correct: the loader must never outlive its own job.
const LOADER_PHRASE_HOLD = 2.2;

// Where the caps actually sit inside a character's 1em line box, measured
// off Anton via canvas TextMetrics rather than guessed: the cap band runs
// 5.8%-93.3%, so clipping across the raw 0-100% would spend the ends of the
// load animating through blank leading. Face-specific — re-measure if
// --font-condensed changes.
const GLYPH_TOP_PCT = 5;
const GLYPH_BOTTOM_PCT = 94;
// Zero progress shows a half-filled letter, not an empty one: hollow
// condensed caps at this size barely register on their own, and the boot
// sequence in front of the loader has already done real work by the time
// anyone reads it. The top half is measured, the bottom half is a floor.
const LOADER_FILL_FLOOR = 0.5;

// One source of truth for the level. Published as a single custom property
// on the wrapper, which every character's fill layer clips against in CSS —
// so the poll writes once per tick instead of once per character.
function loaderFillTop(p: number) {
  const shown = LOADER_FILL_FLOOR + p * (1 - LOADER_FILL_FLOOR);
  return `${GLYPH_BOTTOM_PCT - shown * (GLYPH_BOTTOM_PCT - GLYPH_TOP_PCT)}%`;
}
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
  // Names and roles kept from the original bar deliberately, so
  // startLoadingBar and revealButton below need no changes: `label` is the
  // thing that fades in and out, `track` its inner container, `fill` the
  // element carrying the level. Only what they point AT has changed.
  const loaderLabelRef = useRef<HTMLDivElement>(null);
  const loaderTrackRef = useRef<HTMLDivElement>(null);
  const loaderFillRef = useRef<HTMLDivElement>(null);
  const loaderCharRefs = useRef<(HTMLSpanElement | null)[]>([]);

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
      const loaderLabel = loaderLabelRef.current;
      const loaderTrack = loaderTrackRef.current;
      if (flash && topBar && bottomBar && textWrap && signalLost && button) {
        gsap.set([topBar, bottomBar], { scaleY: 0 });
        gsap.set(flash, { opacity: 0 });
        gsap.set(textWrap, { opacity: 0 });
        gsap.set(signalLost, { opacity: 0 });
        gsap.set(button, { opacity: 0, pointerEvents: "none" });
        if (loaderLabel && loaderTrack) gsap.set([loaderLabel, loaderTrack], { opacity: 0 });
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
      if (loaderLabelRef.current && loaderTrackRef.current) {
        gsap.set([loaderLabelRef.current, loaderTrackRef.current], { display: "none" });
      }
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
    if (loaderLabelRef.current && loaderTrackRef.current && loaderFillRef.current) {
      gsap.set([loaderLabelRef.current, loaderTrackRef.current], { opacity: 0, display: "block" });
      loaderFillRef.current.style.setProperty("--loader-fill", loaderFillTop(0));
      // Park every character below its own mask. `y: 0` is NOT redundant:
      // the JSX gives each an SSR-safe inline translateY(100%), which GSAP
      // parses as a separate `y: 24px` and then stacks yPercent on top of,
      // putting them 48px down. That inverts the whole thing — a word is
      // then hidden during its dwell and only visible while leaving.
      gsap.set(allLoaderChars(), { y: 0, yPercent: 100 });
    }
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
    let revealTl: gsap.core.Timeline | null = null;
    let pollIntervalId: number | null = null;
    // Decorative phrase ticker only — see startPhraseCycle.
    let cycleTl: gsap.core.Timeline | null = null;
    rafId1 = requestAnimationFrame(() => {
      rafId2 = requestAnimationFrame(() => {
        tl = gsap.timeline({ onComplete: startLoadingBar });
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
        // Boot sequence's own job ends here now — at "signal lost has
        // faded in," not "button visible." startLoadingBar (onComplete
        // above) takes over from here: a real loading bar, gated on
        // actual asset readiness, replaces what used to be a fixed
        // `+=0.2` timeline offset straight into the button reveal.
      });
    });

    // Combines hero video buffer progress (the dominant, byte-heavy part)
    // with the WebGL shard shader compile (fast but binary — either done
    // or not) into one bar. Weighted toward video since that's genuinely
    // most of the wait; the shader compile is usually much faster but was
    // the exact cause of a real, separately-documented hitch (see
    // HeroScene.tsx's own compileAsync comment) if entry happens before
    // it's done — worth a real slice of the bar, not just an afterthought.
    const combinedProgress = () => heroVideoProgress.value * 0.85 + (shardShadersReady.value ? 0.15 : 0);

    function startLoadingBar() {
      const label = loaderLabelRef.current;
      const track = loaderTrackRef.current;
      const fill = loaderFillRef.current;
      if (!label || !track || !fill) {
        revealButton();
        return;
      }
      gsap.to([label, track], { opacity: 1, duration: 0.3, ease: "power1.out" });
      startPhraseCycle();

      // REAL wall-clock deadline (performance.now(), not a tick-count) —
      // an earlier version tracked elapsed time as `waited += 0.1` per
      // gsap.delayedCall, which measures GSAP-ticker time, not real time.
      // GSAP's ticker runs on requestAnimationFrame, which itself slows
      // down under main-thread/GPU congestion — reported directly as this
      // loading bar taking 1-1.5 REAL minutes despite a 12-"second" cap,
      // on exactly the kind of low-power/congested device this timeout
      // exists to protect. A real timestamp comparison can't drift like
      // that regardless of how slowly frames are actually arriving.
      // setInterval (not gsap.delayedCall) for the same reason — it's not
      // tied to rAF at all, so the poll itself keeps ticking even while
      // paint/GPU work is backed up, which is exactly the congested state
      // this needs to keep working through.
      const MAX_WAIT_MS = 12000;
      const deadline = performance.now() + MAX_WAIT_MS;
      const poll = () => {
        const p = Math.min(1, combinedProgress());
        // The ONLY line in this function that changed with the redesign:
        // the same `p` that used to drive a bar's width now drives the fill
        // level inside the letterforms. Everything around it — the 12s
        // wall-clock deadline, the 100ms setInterval, and releasing the
        // instant `p >= 1` — is the original code and must stay that way.
        fill.style.setProperty("--loader-fill", loaderFillTop(p));
        if (p >= 1 || performance.now() >= deadline) {
          if (pollIntervalId !== null) clearInterval(pollIntervalId);
          pollIntervalId = null;
          revealButton();
        }
      };
      poll();
      pollIntervalId = window.setInterval(poll, 100);
      poll();
    }

    function allLoaderChars() {
      return loaderCharRefs.current.filter((c): c is HTMLSpanElement => c !== null);
    }

    function phraseChars(i: number) {
      const [start, end] = LOADER_PHRASE_RANGES[i];
      return loaderCharRefs.current
        .slice(start, end)
        .filter((c): c is HTMLSpanElement => c !== null);
    }

    // Purely decorative, and deliberately isolated from everything above:
    // it reads no progress, gates nothing, and holds nothing up. Killing it
    // at any moment is safe.
    //
    // Structured as a loop of SWAPS, not of phrases. "Enter, hold, exit"
    // repeated has dead air in it twice over — the exit finishes before the
    // next entrance starts, and a repeating timeline ends on that exit, so
    // the loop waits it out before coming round. Making each iteration
    // "hold, then exit the current word and enter the next AT THE SAME
    // INSTANT" removes both: the words cross like a split-flap board.
    //
    // Each iteration also STATES the state it needs rather than inheriting
    // it. A repeating GSAP timeline rewinds its tweens on repeat, so a cycle
    // that ended on "phrase 0 arrives" had that very tween undone the moment
    // it looped, leaving phrase 0 visible for a single frame per cycle.
    function startPhraseCycle() {
      if (allLoaderChars().length === 0) return;
      cycleTl?.kill();
      cycleTl = gsap.timeline({ repeat: -1 });
      let at = 0;
      LOADER_PHRASES.forEach((_, i) => {
        const current = phraseChars(i);
        const next = phraseChars((i + 1) % LOADER_PHRASES.length);
        if (current.length === 0 || next.length === 0) return;
        LOADER_PHRASES.forEach((_, j) => {
          if (j !== i) cycleTl!.set(phraseChars(j), { yPercent: 100 }, at);
        });
        cycleTl!.set(current, { yPercent: 0 }, at);
        const swapAt = at + LOADER_PHRASE_HOLD;
        cycleTl!.to(
          current,
          {
            yPercent: -100,
            duration: LOADER_CHAR_OUT,
            stagger: { amount: LOADER_OUT_STAGGER_SPAN },
            ease: "power2.in",
          },
          swapAt,
        );
        cycleTl!.to(
          next,
          {
            yPercent: 0,
            duration: LOADER_CHAR_IN,
            stagger: { amount: LOADER_IN_STAGGER_SPAN },
            ease: "power4.out",
          },
          swapAt,
        );
        at = swapAt + LOADER_CHAR_IN + LOADER_IN_STAGGER_SPAN;
      });
    }

    function revealButton() {
      // Stop the decorative cycle first; it repeats forever by design.
      cycleTl?.kill();
      cycleTl = null;
      const label = loaderLabelRef.current;
      const track = loaderTrackRef.current;
      if (!button) return;
      // display:"none" once faded (not just opacity 0) — these are normal
      // flex-flow siblings of the button inside textWrap's own flex
      // column, not absolutely positioned, so leaving them at opacity:0
      // would still hold their layout space and push the button down
      // below where the loader used to be instead of the button taking
      // that same slot.
      const hasLoader = !!(label && track);
      if (hasLoader) {
        gsap.to([label, track], {
          opacity: 0,
          duration: 0.25,
          ease: "power1.out",
          onComplete: () => gsap.set([label, track], { display: "none" }),
        });
      }
      revealTl = gsap.timeline({ delay: hasLoader ? 0.15 : 0 });
      // The entry button — same flicker-catch entrance AttentionSection's
      // own words use (a few jagged opacity swings before settling), not a
      // plain fade — reads as "catching a signal" like the rest of this
      // boot sequence, rather than a generic UI fade-in. Then becomes
      // clickable (`pointerEvents: "auto"` only set once fully visible, so
      // a click can't land mid-flicker).
      revealTl
        .to(button, { opacity: 0.5, duration: 0.045 })
        .to(button, { opacity: 0.04, duration: 0.035 })
        .to(button, { opacity: 0.65, duration: 0.045 })
        .to(button, { opacity: 0.08, duration: 0.035 })
        .to(button, { opacity: 1, duration: 0.32, ease: "power2.out" })
        .set(button, { pointerEvents: "auto" });
    }

    return () => {
      cancelAnimationFrame(rafId1);
      cancelAnimationFrame(rafId2);
      tl?.kill();
      if (pollIntervalId !== null) clearInterval(pollIntervalId);
      cycleTl?.kill();
      revealTl?.kill();
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
  let loaderIndex = 0;

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
        {/* Real loading bar — fills based on actual hero-video buffer
            progress + WebGL shard-shader compile state (see
            startLoadingBar/combinedProgress above), not a simulated/timed
            fake. Same kicker-label register as "[ signal lost ]" above it
            (brackets, mono, tracked-out, muted), so it reads as another
            status line in the same transmission, not a bolted-on UI
            widget. Sits in the button's own spot — the button only
            appears once this finishes (see revealButton). Static
            opacity-0 is the SSR-safe default, same convention as every
            other element on this screen. */}
        {/* The indicator is the type itself, replacing the label + 2px
            track this used to be. Set in font-condensed (Anton) because the
            mechanic needs glyphs with real enclosed area for the level to
            climb through — a tracked-out mono has almost none. Sized to
            stay under the STOP words above; the condensed face reads as
            subordinate at this size despite the cap height.

            leading-none because both the fill clip and the per-character
            masks are measured against this box. --loader-fill is the single
            property the poll writes; every character's fill layer clips
            against it. */}
        <div
          ref={loaderLabelRef}
          aria-hidden="true"
          // w-full is load-bearing, not decoration. textWrap above is a
          // `flex flex-col items-center`, so its children shrink to fit
          // rather than stretching. Without an explicit width here the inner
          // `w-full` resolves against a collapsed parent, the absolutely
          // positioned phrase rows inherit that near-zero width, and every
          // character's overflow-hidden mask squeezes to a sliver — which
          // renders as the word running vertically down the screen.
          className="mt-8 w-full opacity-0"
        >
          <div
            ref={loaderFillRef}
            className="relative h-[1em] w-full font-condensed text-lg leading-none tracking-[0.015em] uppercase sm:text-xl md:text-2xl"
            style={{ "--loader-fill": loaderFillTop(0) } as React.CSSProperties}
          >
            {LOADER_PHRASES.map((phrase, phraseIdx) => (
              // Both phrases rendered once and stacked, centred, so a longer
              // phrase can't shift layout when it takes over. An off-duty
              // phrase is invisible by sitting below its masks, so it needs
              // no hiding of its own.
              <div
                key={phraseIdx}
                ref={phraseIdx === 0 ? loaderTrackRef : undefined}
                className="absolute inset-0 flex justify-center"
              >
                {[...phrase].map((ch, charIdx) => {
                  const i = ch === " " ? -1 : loaderIndex++;
                  return ch === " " ? (
                    <span key={charIdx} className="w-[0.22em] shrink-0" />
                  ) : (
                    // The mask: overflow-hidden on a box exactly one line
                    // tall is what turns a plain Y translation into a wipe.
                    <span key={charIdx} className="inline-block shrink-0 overflow-hidden">
                      <span
                        ref={(el) => {
                          loaderCharRefs.current[i] = el;
                        }}
                        className="relative block"
                        // Inline transform, not a Tailwind translate utility:
                        // v4 compiles those to the standalone `translate`
                        // property, which GSAP's `transform` writes would not
                        // override.
                        style={{ transform: "translateY(100%)" }}
                      >
                        {/* Chalk outline. It was grey (#8a8a92) so the accent
                            would be the only thing reading as present, but a
                            0.75px grey stroke on near-black simply was not
                            visible on a phone — the unfilled half of the word
                            disappeared rather than waiting. No drop shadow:
                            the mask would clip it into a hard edge under each
                            character. */}
                        <span
                          className="block text-transparent"
                          style={{ WebkitTextStroke: "0.75px var(--color-chalk)" }}
                        >
                          {ch}
                        </span>
                        {/* Fill at 80%, so it reads as light filling the
                            letter rather than a solid block painted over it —
                            the chalk edge stays faintly visible through it. */}
                        <span
                          className="absolute inset-0 block text-accent/80"
                          style={{ clipPath: "inset(var(--loader-fill) 0 0 0)" }}
                        >
                          {ch}
                        </span>
                      </span>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {/* The only way past this screen — see handleEnter. Reads as a
            third line of the SAME telegram transmission above it, not a
            separate UI element bolted on: same uppercase mono-kicker
            voice, same "STOP" period-convention and small/big size
            split as LINE_WORDS — no brackets, that's the small kicker-
            label register ("[ signal lost ]"), a different voice from
            the message itself. Amber border + text at REST on desktop
            (sm:), not just on hover — this is the only interactive
            element on the whole boot screen, and a dim chalk/40 outline
            blended into the static enough that it didn't read as
            clickable at all; full accent at rest makes it the one
            obvious thing to click. Hover inverts to a filled accent pill
            (bg-accent, ink text) — the same "lift + color inversion" CTA
            hover language this site already uses elsewhere (see
            WhatsAppButton). Mobile has no hover at all, so it gets that
            SAME filled look as its default/only state (bg-accent, ink
            text) instead of the outline — showing an outline-only rest
            state that never visually changes on tap read as less
            obviously tappable than committing straight to the "pressed/
            active" look. Static `opacity-0` class is the SSR-safe
            default (matches signalLostRef's own pattern); GSAP owns both
            opacity and pointer-events from mount once the effect runs. */}
        <button
          ref={buttonRef}
          type="button"
          onClick={handleEnter}
          className="mt-8 flex items-baseline gap-x-3 border border-accent bg-accent px-8 py-4 font-mono-kicker uppercase tracking-[0.05em] text-ink opacity-0 transition-colors duration-300 sm:bg-transparent sm:text-accent sm:tracking-[0.1em] sm:hover:bg-accent sm:hover:text-ink"
        >
          <span className="text-2xl sm:text-3xl md:text-4xl">Enter Iora</span>
          <span className="text-base sm:text-lg md:text-xl">Stop</span>
        </button>
      </div>
    </div>
  );
}
