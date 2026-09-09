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

// The loader's own copy — two status lines from the same transmission,
// alternating in place while the bar (which IS this text, see below)
// fills. Order matters: "gathering signal" is what's literally happening
// first (the video bytes arriving), "preparing iora world" is what that
// enables.
const LOADER_PHRASES = ["GATHERING SIGNAL", "PREPARING IORA WORLD"];

// Per-word entrance/exit, matched to broedutrecht.nl's own loader after
// inspecting it directly: each word is split into per-character
// inline-blocks sitting inside an `overflow: hidden` mask, and the
// characters are translated on Y with a small stagger, so the word wipes
// up into frame letter by letter rather than fading. Words then replace
// each other in place, which is the "interchanging texts" part.
//
// Their timing, read off the live site: 0.5s per character on a
// cubic-bezier(0.35, 0.8, 0.2, 1) curve with a 0.05s stagger. GSAP has no
// built-in cubic-bezier ease and CustomEase is a paid plugin, so the curve
// is matched numerically instead — that bezier passes through ~0.8 at
// t=0.35, and power4.out gives 0.821 at the same point, which is the
// closest standard ease by a wide margin (power3.out is 0.725).
//
// The exit is deliberately NOT a mirror of the entrance: characters
// continue travelling UP and out through the top of the mask rather than
// retreating downward the way they came. Motion in one consistent
// direction reads as a ticker advancing to the next word; reversing it
// reads as the word being retracted, i.e. as an undo.
// Both character arrays below are stored FLAT (one entry per rendered
// character across all phrases) rather than nested per phrase. Nesting
// read cleaner but meant a ref callback writing `refs.current[p][c]`,
// which the react-hooks/refs lint rule rejects outright as accessing a ref
// during render — the flat form matches the `charRefs.current[i] = el`
// pattern the STOP lines above already use and the rule already accepts.
// These ranges are what let the animation still address one phrase at a
// time. Spaces are skipped because they are rendered as bare spacers with
// no ref (see the JSX).
const LOADER_PHRASE_RANGES: readonly (readonly [number, number])[] = (() => {
  let next = 0;
  return LOADER_PHRASES.map((phrase) => {
    const start = next;
    next += [...phrase].filter((c) => c !== " ").length;
    return [start, next] as const;
  });
})();

// Deliberately much faster than the reference site's own numbers (0.5s /
// 0.05s stagger, which this originally copied verbatim). Broed's loader
// words are the whole screen — a leisurely wipe is the main event there.
// Here the words are a status line under the actual message, and at that
// scale the same timing read as the loader lagging behind the load rather
// than reporting on it. The swap now lands close to instant: a whole
// phrase is in frame in ~0.5s including its stagger, and the full cycle
// per phrase is ~1.4s instead of ~2.7s.
// How long the letters take to FORM the word (and to leave). Kept short on
// purpose: this is transition, not content. Every millisecond spent here is
// a millisecond the phrase is only half readable, so the useful lever for
// "show the words longer" is the dwell below, never this. A brief 5x-slower
// experiment made that obvious — it did not make the words more readable,
// it just made more of their on-screen life unreadable.
const LOADER_CHAR_IN = 0.22;
const LOADER_CHAR_OUT = 0.16;
// Stagger as a TOTAL SPAN, not a per-character delay. Per-character was
// the second half of the reported swap lag: at 0.016s each, the 18
// characters of "PREPARING IORA WORLD" spread the entrance across nearly
// 0.3s on their own, so the tail of the word landed a third of a second
// after its head and the longer phrase felt slower than the shorter one
// for no reason the viewer can see. GSAP's `{ amount }` form divides one
// fixed span across however many characters there are, so both phrases
// take exactly the same time and the sweep stays a sweep instead of
// becoming a queue.
const LOADER_IN_STAGGER_SPAN = 0.12;
const LOADER_OUT_STAGGER_SPAN = 0.08;
// Time a phrase sits FULLY READABLE — measured from the moment its last
// character lands to the moment it starts leaving, so it is the settled
// dwell rather than the whole on-screen life (which is this plus the
// ~0.34s entrance and ~0.24s exit it overlaps with). This is the ONE knob
// for "show the words longer"; the transition constants above are not, and
// lengthening those makes readability worse rather than better.
//
// Paired with LOADER_FILL_EASING, which sets how long the loader survives
// at all — a long dwell is meaningless if the loader is dismissed before
// the dwell finishes, which is exactly the trap the earlier passes fell
// into. Change one and check the other.
const LOADER_PHRASE_HOLD = 2.2;

// How hard the displayed fill chases the real measured progress, per poll
// tick. See the poll loop for why this exists at all — short version, the
// underlying signal is genuinely step-shaped and this is what turns it
// back into something that reads as filling.
// Also, in practice, what sets the loader's MINIMUM lifetime.
//
// This matters more than it looks. The loader is dismissed the moment the
// displayed fill reaches 100%, so how fast the fill climbs is how soon the
// whole thing disappears — and on a warm cache the real progress is
// effectively 1 from the first tick, so a fast chase meant the loader
// appeared and left inside about a second and a half. That is the actual
// reason the words read as barely-there regardless of how long the dwell
// was set: the dwell was never the binding constraint, the loader's own
// lifetime was. It was being cut off mid-word, not shown briefly.
//
// At 0.08 per 40ms tick the fill takes ~2.5s to close from a standing
// start, which is almost exactly one full phrase cycle (0.34s to form +
// 2.2s dwell). So the first phrase now always gets its complete dwell
// before the button can appear, and the fill is climbing the entire time
// rather than finishing early and sitting full. Still honest — the
// displayed value can only ever lag the measured one, never overstate it.
const LOADER_FILL_EASING = 0.042;
const LOADER_POLL_MS = 40;

// The loader stays up for at least this long, even when the video is
// already cached and the real progress is 1 from the first tick.
//
// This is the thing that was actually being asked for across several
// rounds of tuning the phrase timings, and it could never have come from
// those timings: the loader is dismissed as soon as the fill closes, so its
// own lifetime — not the dwell — is what caps how long any word is on
// screen. Previously that was ~2.5s, which is one phrase and nothing else.
// 5.1s is exactly one full cycle: both phrases, each with its complete
// 2.2s dwell, so the loader always shows the whole message it exists to
// show. The cost is real and deliberate — on a warm cache this holds the
// entry button back by a few seconds it would not otherwise need. Set to 0
// to go back to "dismiss the moment loading is done".
const LOADER_MIN_VISIBLE_MS = 5100;

// Zero progress does not mean an empty letter — the fill starts half way
// up and the load drives the top half only. Two reasons. Hollow condensed
// caps at this size are faint enough on their own that a fully empty word
// barely registers as text at all, and by the time anyone actually reads
// the loader some real work has already happened (the boot sequence in
// front of it takes about a second and a half), so a bar sitting at a true
// zero is arguably the less honest of the two. The tradeoff is explicit:
// the top half is a real measurement, the bottom half is a floor.
const LOADER_FILL_FLOOR = 0.5;

// Single source of truth for the fill level — the JSX's SSR-safe starting
// value and the live updates in setLoaderFill have to agree exactly, and
// having each compute the geometry itself is how they quietly drift apart.
//
// Returns just the inset percentage, not a whole clip-path, because the
// level is published as ONE custom property on the wrapper and every
// character's fill layer reads it from there in CSS. The earlier version
// wrote a full clip-path string onto all 33 character layers on every
// tick: 33 style mutations at 40ms, ~825 a second, on elements carrying
// -webkit-text-stroke, during the exact window when the hero video is
// buffering and the shard shaders are compiling. That is a real
// main-thread cost on a phone and matches the "too much concurrent
// compositing work" failure mode in the device diagnostic. One property
// write now does the same job.
function loaderFillTop(p: number) {
  const shown = LOADER_FILL_FLOOR + p * (1 - LOADER_FILL_FLOOR);
  return `${GLYPH_BOTTOM_PCT - shown * (GLYPH_BOTTOM_PCT - GLYPH_TOP_PCT)}%`;
}
// Where the CAPS actually sit inside the fill layer's line box, as
// percentages from its top. Even at `leading-none` the box is a full em
// tall while uppercase glyphs only occupy the cap-height band inside it —
// the descender room below the baseline (unused by caps) and the gap above
// the cap line are both empty. Clipping across the raw 0-100% of the box
// would therefore spend the first eighth and last eighth of the load
// animating through blank space, so the fill would look stuck at empty,
// then stuck at full. Mapping progress onto just this band means 0% is
// exactly "caps entirely hollow" and 100% is exactly "caps entirely
// solid," with every step in between visible.
//
// Not eyeballed — measured in the browser off the real resolved face via
// canvas TextMetrics. Anton at 100px: fontBoundingBox ascent 118 /
// descent 33, so the 151px content box centers in the 100px line box
// (leading-none) with -25.5px half-leading, putting the baseline at
// 92.5px; actualBoundingBox ascent 86.72 and descent 0.78 (the overshoot
// on round caps like O and S) put the cap band at 5.8%-93.3%. Rounded
// outward by a hair each way so the endpoints are unambiguous.
//
// Anton's caps fill almost the entire em box, which is a second reason
// the condensed face suits this: barely any of the fill's travel is spent
// crossing blank leading. It is also why these numbers are nothing like
// the ones the previous (Instrument Sans) version used — they are
// FACE-SPECIFIC, so swapping --font-condensed for a licensed Druk means
// re-measuring both. Every term scales linearly with font-size, so the
// percentages themselves hold at all three breakpoints.
const GLYPH_TOP_PCT = 5;
const GLYPH_BOTTOM_PCT = 94;
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
  const loaderWrapRef = useRef<HTMLDivElement>(null);
  // Every phrase is rendered up front and stacked, one absolutely
  // positioned layer per phrase — NOT one element whose textContent gets
  // swapped (the earlier version). Per-character masking needs a real DOM
  // node per character, and rebuilding ~20 nested spans on every phrase
  // change, mid-animation, from inside a GSAP callback is both more code
  // and more to go wrong than rendering both phrases once and animating
  // whichever one is due. Characters live below their own mask when idle,
  // so an off-duty phrase is invisible without needing to be hidden.
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
      const loaderWrap = loaderWrapRef.current;
      if (flash && topBar && bottomBar && textWrap && signalLost && button) {
        gsap.set([topBar, bottomBar], { scaleY: 0 });
        gsap.set(flash, { opacity: 0 });
        gsap.set(textWrap, { opacity: 0 });
        gsap.set(signalLost, { opacity: 0 });
        gsap.set(button, { opacity: 0, pointerEvents: "none" });
        if (loaderWrap) gsap.set(loaderWrap, { opacity: 0 });
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
      if (loaderWrapRef.current) gsap.set(loaderWrapRef.current, { display: "none" });
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

    // Declared ahead of the reset block below, not down with the other
    // timeline/interval handles — the reset calls setLoaderFill, which
    // writes this, and a `let` declared further down would still be in its
    // temporal dead zone at that point (a real ReferenceError, not a
    // stylistic preference).
    let lastFillP = 0;

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
    if (loaderWrapRef.current) {
      gsap.set(loaderWrapRef.current, { opacity: 0, display: "block" });
      // Every character parked below its own mask, so no phrase is showing
      // until the cycle explicitly raises one.
      //
      // `y: 0` is NOT redundant, and leaving it out was a real bug worth
      // stating plainly. The JSX gives each character an SSR-safe inline
      // `transform: translateY(100%)`. On its first write GSAP PARSES that
      // existing transform and records it as `y: 24px` — a separate
      // component from `yPercent` — so a bare `yPercent: 100` stacked on top
      // of it, putting the character 48px down instead of 24px.
      //
      // That inverted the entire loader. At `yPercent: 0`, where a word is
      // meant to be sitting readable, the leftover `y: 24px` still held it a
      // full mask-height below the window, invisible. At `yPercent: -100`,
      // where it is meant to be leaving, the two cancelled to 0 and the word
      // was actually on screen. So every phrase was hidden for its whole
      // 2.2s dwell and visible only during its half-second exit sweep.
      //
      // Zeroing `y` here makes yPercent the only vertical term, which is
      // what all the timing arithmetic elsewhere assumes.
      gsap.set(allLoaderChars(), { y: 0, yPercent: 100 });
      setLoaderFill(0);
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

    // Drives the fill height of the accent copy of the text. `p` is 0-1
    // load progress; the clip is an inset from the TOP, so it shrinks as
    // progress grows — the solid layer is revealed upward from the
    // baseline, liquid rising inside the hollow letterforms.
    function setLoaderFill(p: number) {
      lastFillP = p;
      // `p` stays the RAW measured progress — the floor is applied only on
      // the way to the screen (see loaderFillTop). Keeping the raw value is
      // what lets revealButton's top-up still reason about whether the load
      // actually finished or timed out.
      //
      // ONE write, on the wrapper. Every character's fill layer clips
      // against this same custom property, so they all move together for
      // free — and because each character's box shares one line-height, an
      // identical inset still produces one continuous level line straight
      // across the word rather than a per-letter staircase.
      loaderWrapRef.current?.style.setProperty("--loader-fill", loaderFillTop(p));
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

    function startLoadingBar() {
      const wrap = loaderWrapRef.current;
      const chars = allLoaderChars();
      if (!wrap || chars.length === 0) {
        revealButton();
        return;
      }
      gsap.set(wrap, { opacity: 1 });

      // Weak-signal-to-clear-signal flicker: the loader arrives the way a
      // picture arrives on the CRT behind it — guttering, catching,
      // guttering again, then locking in. The swings get shallower and the
      // gaps between them longer as it settles, which is what makes it read
      // as a signal stabilising rather than as a strobe; a uniform on/off
      // blink would read as a broken element.
      //
      // ONLY on the first appearance, never on a phrase swap. It used to
      // run on every swap and that was the dominant cause of the swap still
      // reading as laggy even after the transforms were made simultaneous:
      // the flicker dips the whole wrap to 0.12 opacity at exactly the
      // crossover moment, so the two words were in fact changing places
      // instantly but doing it while nearly invisible, which looks
      // identical to a gap. Here there is no outgoing word for it to hide,
      // so it costs nothing and the effect survives where it actually means
      // something — the signal being acquired in the first place.
      const flicker = () =>
        gsap
          .timeline()
          .to(wrap, { opacity: 0.25, duration: 0.04 })
          .to(wrap, { opacity: 1, duration: 0.03 })
          .to(wrap, { opacity: 0.12, duration: 0.05 })
          .to(wrap, { opacity: 0.9, duration: 0.04 })
          .to(wrap, { opacity: 0.4, duration: 0.05 })
          .to(wrap, { opacity: 1, duration: 0.16, ease: "power2.out" });

      // The first phrase arriving. Deliberately OUTSIDE the loop below —
      // see startPhraseLoop for why the loop can't also own the very first
      // entrance.
      cycleTl = gsap.timeline({ onComplete: startPhraseLoop });
      cycleTl.add(flicker(), 0);
      cycleTl.to(
        phraseChars(0),
        {
          yPercent: 0,
          duration: LOADER_CHAR_IN,
          stagger: { amount: LOADER_IN_STAGGER_SPAN },
          ease: "power4.out",
        },
        0,
      );

      // The phrase ticker, as a loop of SWAPS rather than a loop of
      // phrases. This distinction is the whole fix for the reported lag.
      //
      // The obvious structure — "phrase enters, holds, exits" repeated — is
      // what this had, and it has dead air built into it two different
      // ways. Within an iteration the exit finishes before the next
      // entrance starts, so the screen is empty for the length of an exit;
      // and across the loop seam it is worse, because a GSAP timeline ends
      // when its last child ends, which is the final exit, so the repeat
      // waits out that whole exit before the first phrase comes back.
      //
      // Making each iteration "hold, then exit the current word and enter
      // the next one AT THE SAME INSTANT" fixes both at once. Nothing is
      // ever waiting on anything: the words cross, like a split-flap board
      // rather than a slideshow. And because each iteration now ENDS on an
      // entrance instead of an exit, the loop seam is just another swap —
      // which is exactly why the first entrance has to live outside the
      // loop, as a one-time preamble.
      function startPhraseLoop() {
        const loop = gsap.timeline({ repeat: -1 });
        // Absolute positions, and every iteration STATES the world it needs
        // instead of inheriting it. Both details exist because of a real bug
        // measured in this timeline, not as defensive habit.
        //
        // The bug: a repeating GSAP timeline rewinds its tweens on every
        // repeat. Tweens that have not started yet at the new time are
        // re-rendered at their FROM value. The previous version ended each
        // cycle on "phrase 0 arrives" and assumed that state carried into
        // the next cycle — but the moment the loop restarted, GSAP reverted
        // that very tween and threw phrase 0 straight back below its mask.
        // Sampling the built timeline showed phrase 0 fully readable for
        // 0.06s per cycle against phrase 1's 2.28s, with 2.2s of completely
        // blank line at the top of every loop. That is the "word flashes for
        // a fraction of a second then vanishes" report, and no amount of
        // adjusting the hold could have fixed it, because the hold was being
        // spent on an empty line.
        //
        // The fix: open each iteration with explicit `set`s that park every
        // phrase except the one that should be showing. Mid-cycle they are
        // no-ops — they assert exactly what the previous iteration's
        // animation just produced — but they make each iteration
        // self-contained, so the repeat seam lands in a defined state rather
        // than a rewound one.
        let at = 0;
        LOADER_PHRASES.forEach((_, i) => {
          const current = phraseChars(i);
          const next = phraseChars((i + 1) % LOADER_PHRASES.length);
          if (current.length === 0 || next.length === 0) return;

          LOADER_PHRASES.forEach((_, j) => {
            if (j !== i) loop.set(phraseChars(j), { yPercent: 100 }, at);
          });
          loop.set(current, { yPercent: 0 }, at);

          // Both words move on the SAME frame — the swap has no gap in it.
          // No flicker and nothing touching opacity either (see the
          // flicker's own comment above), so the two stay fully opaque while
          // they roll past each other.
          const swapAt = at + LOADER_PHRASE_HOLD;
          loop.to(
            current,
            {
              yPercent: -100,
              duration: LOADER_CHAR_OUT,
              stagger: { amount: LOADER_OUT_STAGGER_SPAN },
              ease: "power2.in",
            },
            swapAt,
          );
          loop.to(
            next,
            {
              yPercent: 0,
              duration: LOADER_CHAR_IN,
              stagger: { amount: LOADER_IN_STAGGER_SPAN },
              ease: "power4.out",
            },
            swapAt,
          );
          // The iteration ends the instant the incoming word has fully
          // landed, so the next iteration's hold is time spent readable
          // rather than time that includes an entrance.
          at = swapAt + LOADER_CHAR_IN + LOADER_IN_STAGGER_SPAN;
        });
        // Hand the handle over so revealButton and the cleanup still have
        // exactly one timeline to kill — the preamble is finished by the
        // time this runs, which is what makes the swap safe.
        cycleTl = loop;
      }

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
      // The displayed level is NOT the measured level — it chases it.
      //
      // Reported directly as "the filling isn't increasing, it's just low
      // or just full," and the measurement backs that up: the underlying
      // signal is genuinely step-shaped, not gradual. `heroVideoProgress`
      // (see heroVideo.ts) moves on the video element's `progress` event,
      // which browsers fire sparsely — often two or three times for the
      // whole file — and `canplaythrough` then slams it to 1 outright.
      // The shader half is worse: it is a boolean, contributing its 0.15
      // in a single jump. So the honest value really does spend its life
      // at a couple of discrete plateaus, and painting it directly is what
      // produced the low-then-full behaviour.
      //
      // The fix belongs here, not in heroVideo.ts — that module should
      // keep reporting exactly what it knows. This is a display concern:
      // each tick the drawn value moves a fixed FRACTION of its remaining
      // distance to the real one, which turns any step into a fast
      // exponential ease-out and makes the level visibly climb. It stays
      // honest in the direction that matters, since it can only ever lag
      // the true value, never overstate it.
      //
      // Ticking at 40ms rather than the old 100ms purely for smoothness —
      // 100ms steps in an eased ramp are visible as stepping. This is
      // still plain setInterval, so the timing guarantees above are intact.
      let displayed = 0;
      const shownAt = performance.now();
      const poll = () => {
        const target = Math.min(1, combinedProgress());
        displayed += (target - displayed) * LOADER_FILL_EASING;
        // Snap the last hair shut rather than easing forever — an
        // exponential chase never formally arrives, and without this the
        // completion test below could sit unsatisfied indefinitely while
        // the bar looks full.
        if (target >= 1 && displayed > 0.995) displayed = 1;
        setLoaderFill(displayed);
        const shownLongEnough = performance.now() - shownAt >= LOADER_MIN_VISIBLE_MS;
        // The 12s deadline still overrides, so a genuinely slow load is
        // never made slower by the minimum.
        if ((displayed >= 1 && shownLongEnough) || performance.now() >= deadline) {
          if (pollIntervalId !== null) clearInterval(pollIntervalId);
          pollIntervalId = null;
          revealButton();
        }
      };
      poll();
      pollIntervalId = window.setInterval(poll, LOADER_POLL_MS);
    }

    function revealButton() {
      const wrap = loaderWrapRef.current;
      const chars = allLoaderChars();
      if (!button) return;
      // Kill the phrase ticker first. It loops forever by design, so
      // nothing below would ever run against a settled state otherwise —
      // and a word mid-entrance would keep rising into a loader that is
      // already being dismissed.
      cycleTl?.kill();
      cycleTl = null;
      // Only the first-appearance flicker touches opacity now, but the load
      // can genuinely finish while it is still running — it is barely a
      // third of a second — and killing it mid-swing would strand the wrap
      // at whatever dipped value it was passing through, fading the final
      // top-up out from under the user. Put it back to full before the exit
      // runs.
      if (wrap) gsap.set(wrap, { opacity: 1 });
      // display:"none" once gone (not just an off-screen transform) — the
      // loader is a normal flex-flow sibling of the button inside
      // textWrap's own flex column, not absolutely positioned, so leaving
      // it in flow would still hold its layout space and push the button
      // down below where the loader used to be instead of the button
      // taking that same slot.
      const hasLoader = !!wrap && chars.length > 0;
      let exitDuration = 0;
      if (hasLoader) {
        const exitTl = gsap.timeline();
        // Top the fill up to 100% before dismissing it. On the normal path
        // the poll already reached 1 and this is a no-op, but the 12s
        // deadline path can bail out at any level — letting the words leave
        // visibly half-filled reads as the load having failed rather than
        // finished.
        const topUp = { v: lastFillP };
        if (lastFillP < 1) {
          exitDuration += 0.3;
          exitTl.to(topUp, {
            v: 1,
            duration: 0.3,
            ease: "power2.out",
            onUpdate: () => setLoaderFill(topUp.v),
          });
        }
        // The last word leaves the way every other word left — up and out
        // through the top of its mask — rather than fading, so the loader's
        // dismissal is the same gesture as its ticker instead of a
        // different one bolted on at the end. Targets ALL characters, not
        // just the phrase that happens to be showing: whichever phrase was
        // mid-cycle is unknowable here, and the idle phrase's characters
        // are already off-screen, so moving them further off costs nothing.
        exitDuration += LOADER_CHAR_OUT + LOADER_OUT_STAGGER_SPAN;
        exitTl.to(chars, {
          yPercent: -100,
          duration: LOADER_CHAR_OUT,
          stagger: { amount: LOADER_OUT_STAGGER_SPAN },
          ease: "power2.in",
          onComplete: () => gsap.set(wrap, { display: "none" }),
        });
      }
      // Button waits out the loader's own exit — an earlier fixed 0.15s
      // guess predates the exit being a real staggered animation whose
      // length depends on the phrase, so it is computed from the same
      // constants the exit is built from rather than restated as a number.
      revealTl = gsap.timeline({ delay: hasLoader ? exitDuration * 0.8 : 0 });
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
        {/* Real loading bar — except the bar IS the type. Fills based on
            actual hero-video buffer progress + WebGL shard-shader compile
            state (see startLoadingBar/combinedProgress above), not a
            simulated/timed fake. Replaces an earlier label + 2px track
            pair: a separate rule under a separate caption was two pieces
            of chrome saying one thing, and neither belonged to the
            telegram the rest of this screen is written as. Sits in the
            button's own spot — the button only appears once this finishes
            (see revealButton).

            TWO stacked copies of the same string, not one element with a
            gradient. The lower (in-flow) copy is transparent with a
            1px chalk stroke — hollow caps. The upper copy is absolutely
            positioned over it in solid accent and clipped from the top
            (see setLoaderFill), so progress reads as the accent rising up
            inside the empty letterforms. `background-clip: text` with a
            gradient would be the one-element version, but the outline has
            to survive underneath the fill, and text-stroke + a clipped
            background on the same node fight over the same pixels.

            Set in font-condensed (Anton, standing in for Druk Condensed —
            see globals.css), NOT the mono-kicker the other labels here use
            and no longer Instrument Sans either. Both earlier attempts
            failed the same way: the mechanic needs glyphs with real
            enclosed area for the level to climb through, and neither a
            0.3em-tracked mono nor a proportional sans at 700 packs enough
            ink per character — the fill had almost nothing to fill. A heavy
            condensed grotesque makes each letter a tall solid slab, which
            is exactly why the reference site's own loader reads at a
            glance. Tracking stays near zero so the phrase fills as one mass
            rather than as separate letters.

            Sized to stay under the "STOP" words above it: this is a status
            line reporting on the message, not a competing headline. The
            face being condensed buys real headroom here — it occupies far
            less width per character than the STOP lines do, so it can take
            a larger font-size than the old version without reading as
            louder.

            leading-none because BOTH the fill clip and the character masks
            are measured against this box — see GLYPH_TOP_PCT. Static
            opacity-0 is the SSR-safe default, same convention as every
            other element on this screen. */}
        <div
          ref={loaderWrapRef}
          aria-hidden="true"
          className="relative mt-8 h-[1em] w-full font-condensed text-lg leading-none tracking-[0.015em] uppercase opacity-0 sm:text-xl md:text-2xl"
          // The fill level lives here as one custom property that every
          // character's fill layer clips against — SSR-safe starting value,
          // and the only thing the poll writes at runtime.
          style={{ "--loader-fill": loaderFillTop(0) } as React.CSSProperties}
        >
          {LOADER_PHRASES.map((phrase, phraseIdx) => (
            // Absolutely stacked and centered so a longer phrase can't
            // shift the layout when it takes over, and so the wrap keeps
            // one fixed 1em height regardless of which phrase is up. The
            // wrap carries the type styles; `h-[1em]` therefore resolves
            // against the loader's own font-size at every breakpoint.
            <div key={phraseIdx} className="absolute inset-0 flex justify-center">
              {[...phrase].map((ch, charIdx) => {
                // One running index across every phrase, matching the flat
                // ref arrays (see LOADER_PHRASE_RANGES). Incremented only
                // for real characters, so spaces never consume a slot.
                const i = ch === " " ? -1 : loaderIndex++;
                return ch === " " ? (
                  // Word gaps are a plain spacer, not a masked character —
                  // a space has no glyph to reveal, and giving it a ref
                  // would put a dead element in the stagger, opening a
                  // visible hole in the sweep timing mid-phrase.
                  <span key={charIdx} className="w-[0.22em]" />
                ) : (
                  // The mask. overflow-hidden on a box exactly one line
                  // tall is what turns a plain Y translation into a wipe:
                  // the character is always fully rendered, just parked
                  // outside its own window until its turn.
                  <span key={charIdx} className="inline-block overflow-hidden">
                    <span
                      ref={(el) => {
                        loaderCharRefs.current[i] = el;
                      }}
                      className="relative block"
                      // SSR-safe starting position, below the mask. Written
                      // as an inline transform rather than a Tailwind
                      // translate utility on purpose: Tailwind v4 compiles
                      // those to the standalone `translate` property, which
                      // GSAP's own `transform` writes would NOT override.
                      style={{ transform: "translateY(100%)" }}
                    >
                      {/* Grey outline (chalk-muted, the same token the
                          "[ signal lost ]" kicker uses) rather than the
                          near-white chalk this used before — the unfilled
                          part of the word is the part that has NOT arrived
                          yet, so it should sit back at the muted end of the
                          palette and let the accent be the only thing that
                          reads as present. Kept at full opacity rather than
                          a faded white: against Hero's live CRT static,
                          which is bright high-frequency noise, a
                          part-opacity hairline dissolves entirely and the
                          hollow letters read as nothing at all.

                          0.75px, not 1px — the type is smaller now, and a
                          full pixel of stroke on a condensed face at this
                          size starts closing up the counters it exists to
                          show. No drop shadow, unlike the STOP lines: the
                          mask would clip it at the line box and leave a
                          hard edge under every character. */}
                      <span
                        className="block text-transparent"
                        style={{ WebkitTextStroke: "0.75px #8a8a92" }}
                      >
                        {ch}
                      </span>
                      {/* The fill layer carries no stroke of its own, so
                          the accent sits just inside the outline and leaves
                          a chalk rim around it. */}
                      {/* No ref. The fill level arrives through the
                          --loader-fill custom property set once on the
                          wrapper (see setLoaderFill), so every character
                          picks it up in CSS with no per-element JS write. */}
                      <span
                        className="absolute inset-0 block text-accent"
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
