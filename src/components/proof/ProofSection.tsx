"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { gsap, ScrollTrigger } from "@/lib/scroll/gsapSetup";
import { PROOF_CARD_TOP_VH } from "@/lib/scroll/marbleGeometry";
import ProofGlassCanvas, { CARD_COUNT, createProofGlassState } from "./ProofGlassCanvas";
import { playGlassBounce } from "@/lib/sound/sfx";
import { HERO_VIDEO_BREAKPOINT } from "@/lib/scroll/heroEntry";

const CARD_RADIUS_PX = 44; // matches the WebGL card mesh's uRadius default

// Trimmed to three — the carousel is one-card-at-a-time by design, not a
// scrollable list, so three is the actual content, not a placeholder cut.
// Every card links to /work (the full case-study index) rather than one
// specific project each — the hover glimpse below is still an honest,
// service-specific preview, it just isn't tied to a single case study's
// own URL anymore.
const SERVICES = [
  {
    title: "AI Video Ads",
    desc: "Scroll-stopping ads, built to turn viewers into customers.",
    glimpseImage: "/work/convergence/frame-10.webp",
    glimpseVideo: "/videos/product-ad.mp4",
  },
  {
    title: "Brand Websites",
    desc: "Sites built to turn visitors into your next lead.",
    glimpseImage: "/work/coffee-roastry/roaster.jpg",
    glimpseVideo: "/videos/product-websites.mp4",
  },
  {
    title: "Motion & Identity",
    desc: "A brand system made to move — and stay in your customers' minds.",
    glimpseImage: "/work/dental/esthetic.jpg",
    glimpseVideo: "/videos/product-motion.mp4",
  },
];

// Progress keyframes (fractions of this section's own scroll range) for
// the card track: dwell on card 1, slide to card 2, dwell, slide to card
// 3, dwell, then EXIT — card 3 slides away too (same as the other
// transitions) with nothing sliding in behind it, since it's the last
// card. Kept as named constants rather than inline magic numbers because
// the marble-hop logic below needs the exact same windows.
//
// Dwell zones deliberately much longer than transition zones (110vh vs
// 50vh, at 500vh total) — a real HOLD per card, the scroll equivalent of
// how a pinned section holds its own beat in view, rather than scroll
// input almost immediately starting the next transition once a card
// arrives. An earlier version had transitions LARGER than dwells (100vh
// transition vs 75-100vh dwell), which read as "it just keeps moving"
// instead of "it lands and holds."
const DWELL1_END = 0.22;
const TRANSITION1_END = 0.32;
const DWELL2_END = 0.54;
const TRANSITION2_END = 0.64;
const DWELL3_END = 0.86;
// Fraction of the EXIT zone (DWELL3_END to 1) spent on the scroll-tied
// rise before handing off to the independent gravity fall below.
const EXIT_RISE_FRACTION = 0.4;

// The card's top edge IS the marble's resting place — it rests ON the
// roof, bouncing UP away from it, not the other way around. These are
// how high above that resting point each bounce type swings.
// Nudged up a little (208 -> 250) -- at 208 the arc's landing/secondary
// bounce sat too close to the card's rounded top corner, reading as
// cramped against that curve.
const HOP_HEIGHT = 250;
const IDLE_BOUNCE_HEIGHT = 72;

// Where the marble comes to rest after leaving the last card — a
// fraction of the viewport height, deliberately NOT far enough to fall
// out of frame. It used to fall well past the bottom of the viewport
// (gone entirely) and sit there invisible until PitchSection reset it
// back above the screen and dropped it again — that read as two
// disconnected falls with a glitchy pop back into view partway through
// Pitch, not one motion. Landing it near the bottom of the viewport
// instead means it's visible the ENTIRE time — through the rest of this
// section's own scroll-out and the scroll gap into Pitch — so Pitch's
// own descent trigger picks it up from somewhere already on screen and
// carries it up to "you." without anything ever vanishing.
const EXIT_REST_VH = 0.85;

// The card-transition hop is two clean parabolic arcs, not one rise +
// bounce.out landing — a big arc that fully lands just before the new
// card finishes centering, then a small secondary bounce that closes
// the last bit of distance, landing exactly as it centers. BIG_ARC_SPLIT
// is where (as a fraction of the whole transition) the big arc touches
// down; SMALL_BOUNCE_RATIO is the secondary bounce's height relative to
// the main hop height.
// Bumped again (0.75 -> 0.85 -> 0.9) — even at 0.85 the arc's landing
// still reached the card's rounded top corner before the secondary
// bounce kicked in.
const BIG_ARC_SPLIT = 0.9;
const SMALL_BOUNCE_RATIO = 0.2;

// The marble smoothly TRACKS scroll while transiting from Impact into
// Proof, but only for the first 60% of that transit's scroll range —
// it reaches its resting Y before the transit is actually over and
// holds there ("stuck") for the remaining 40%, rather than continuing
// to track scroll all the way to the exact moment Proof is fully
// entered. That gap is deliberate breathing room between "arrived at
// position" and "the section is actually fully in view."
const FOLLOW_FRACTION = 0.6;

/**
 * Three "Liquid Glass" cards (see .liquid-glass-card in globals.css), one
 * centered at a time — scrolling drags the active card out to the left
 * while the next slides in from the right. Fully scroll-scrubbed and
 * reversible, like everything else on this site: this is a translateX
 * driven directly by scroll progress, not a snap-per-tick carousel widget.
 *
 * The marble itself is owned jointly with Impact: ImpactSection condenses
 * the glow into a marble that just sits at its spawn point (see its own
 * doc comment), and the transit into Proof is this section's own
 * scroll-SCRUBBED `transitTrigger` below — the marble tracks scroll
 * smoothly toward its resting Y, then holds early (see FOLLOW_FRACTION)
 * rather than tracking the whole way, and snaps straight into the idle
 * bounce (no separate fall animation) the instant Proof is genuinely
 * fully in view. It lands exactly ON the current card's own top edge
 * (measured from the real DOM, see cardTopY below) — that edge IS the
 * resting place, every bounce swings UP away from it, never below. Once
 * landed, the marble stays as a resident element instead of fading out.
 * While a card is at rest (not
 * transitioning) the marble keeps doing a small continuous idle bounce —
 * it never fully stops, reading as "alive" rather than a static dot
 * glued in place. Each idle cycle is one clean rise-then-fall parabola
 * (power2.out up, power2.in down — real ball physics, rise/fall time
 * symmetric under constant gravity), not bounce.out — bounce.out's own
 * multiple decaying micro-bounces read as "busy"/"forceful" when
 * repeating continuously, right only for the one-time dramatic initial
 * drop. When scrolling drags the next card in, the idle bounce is killed
 * and the marble does one reactive hop (quick rise, then a bounce.out
 * landing — the same motion as its original drop) timed to the card's
 * arrival, then resumes idling once the new card settles at
 * center.
 *
 * Previously revealed itself through a growing circular clip-path mask;
 * that mechanic moved to ImpactSection's marble drop (see there), so this
 * section is now just normal document flow with a plain reversible
 * fade/rise for the heading.
 */
export default function ProofSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  // Plain mutable object, not React state — written into every scroll
  // tick from the GSAP onUpdate below, read every WebGL frame inside
  // ProofGlassCanvas. Per AGENTS.md: Three.js state goes through
  // refs/uniforms, never triggers a React re-render.
  const glassState = useMemo(() => createProofGlassState(), []);
  // One ref per card's glimpse video. Desktop: played/paused imperatively
  // (CSS :hover alone can't start video playback) on real pointer enter/
  // leave — not autoplaying in the background the whole time a visitor is
  // on the page, since three simultaneously-decoding videos sitting
  // off-screen for the entire session is real, avoidable battery/CPU cost
  // for a glimpse that's invisible (opacity-0) until actually hovered.
  // Mobile has no hover at all, and no WebGL glass canvas either (see
  // ProofGlassCanvas — replaced with a CSS poster there, real-time
  // refraction was reported as still-severely laggy on real mobile GPUs
  // across multiple rounds of tuning) — the glimpse video IS each card's
  // visual interest on mobile now, so it just plays continuously (see the
  // mobile-only effect below), matching the CSS below that shows it at
  // rest instead of gating it behind a hover that can't happen there.
  const glimpseVideoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const handleGlimpseEnter = (index: number) => {
    const video = glimpseVideoRefs.current[index];
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => {
      // Muted playback shouldn't ever be rejected, but a failed play() is
      // not worth surfacing — the poster frame (see glimpseImage below)
      // is still a reasonable fallback if it somehow is.
    });
  };
  const handleGlimpseLeave = (index: number) => {
    glimpseVideoRefs.current[index]?.pause();
  };

  // Mobile-only continuous playback — explicit JS play(), same reasoning
  // as ResolutionSection's own mobile video: the bare `autoplay` HTML
  // attribute has been unreliable on this site's mobile testing, and
  // adding it unconditionally would also autoplay these on desktop
  // (undesired — desktop keeps its existing hover-gated behavior
  // untouched). Checked once at mount, matching this codebase's other
  // resolved-once mobile breakpoint checks.
  useEffect(() => {
    if (window.innerWidth >= HERO_VIDEO_BREAKPOINT) return;
    glimpseVideoRefs.current.forEach((video) => {
      if (!video) return;
      void video.play().catch(() => {});
    });
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    const heading = headingRef.current;
    if (!section || !track || !heading) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    // Resolved once — same convention as heroVideo.ts's getActiveVideoKey.
    // Used below to lower the main trigger's scrub lag on mobile (see
    // `trigger` further down) — this scroll-hijack carousel pattern is
    // intentional and correct as-is on desktop, but a 0.6s catch-up lag
    // reads as "stuck"/disconnected from a touch scroll specifically,
    // where the expectation is closer to 1:1 tracking with your finger.
    const isMobile = window.innerWidth < HERO_VIDEO_BREAKPOINT;

    gsap.set(heading, { opacity: 0, y: 30 });
    gsap.set(track, { xPercent: 0 });

    // The three cards are identically sized — measuring one (off the
    // first) covers the WebGL layer's fixed dimensions for all of them.
    // Their per-frame SCREEN CENTER (which differs per card, since the
    // carousel slides them) is computed analytically in onUpdate below,
    // not via getBoundingClientRect every tick (that forces a synchronous
    // layout read on every scroll frame — fine once, not 60x/sec).
    const firstCard = track.querySelector<HTMLElement>(".liquid-glass-card");
    // The marble's resting-position math needs to know where the card's
    // ACTUAL top edge is on screen. This section's outer wrapper is
    // `position: sticky` — BEFORE it's scrolled into its pinned state it
    // sits in normal document flow, thousands of pixels down the page, so
    // measuring getBoundingClientRect().top at mount (scrollY still 0)
    // captures that huge, meaningless pre-scroll value, not the real
    // on-screen position. Real fix: don't trust a mount-time measurement
    // for position at all — re-measure fresh in playFall() below, which
    // only ever runs once the user has actually scrolled to "top top" of
    // this section, guaranteeing the sticky pin is genuinely active and
    // the rect is real. (Width/height ARE safe to measure at mount —
    // sticky doesn't change an element's size, only its position — so
    // updateCardSize below still owns those.)
    let cardTopY = PROOF_CARD_TOP_VH * window.innerHeight;
    const updateCardSize = () => {
      if (!firstCard) return;
      const rect = firstCard.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      glassState.cardWidth = rect.width;
      glassState.cardHeight = rect.height;
      glassState.cardRadius = CARD_RADIUS_PX;
    };
    updateCardSize();
    const resizeObserver = new ResizeObserver(updateCardSize);
    if (firstCard) resizeObserver.observe(firstCard);

    // y = -4t(1-t) for t in [0,1] is the exact discretized shape of a
    // projectile's height under constant gravity over a fixed time
    // window — 0 at both ends, peak at t=0.5 — not an easing curve
    // chosen to look nice, the actual physics. Reused for both arcs.
    const parabola = (t: number) => -4 * t * (1 - t);

    // Two clean parabolic arcs, not one rise + bounce.out landing (which
    // packs several small decaying bounces into its own landing half —
    // right for the marble's original one-time dramatic drop, but here
    // it read as an imprecise, mushy arrival rather than a real thrown
    // hop). The big arc fully lands (returns to baseline) at
    // BIG_ARC_SPLIT, just before the new card finishes centering; the
    // remaining scroll range plays one small secondary bounce that
    // closes the last bit of distance and settles exactly as the card
    // arrives.
    const hopOffset = (subP: number, height: number) => {
      if (subP < BIG_ARC_SPLIT) {
        const t = subP / BIG_ARC_SPLIT;
        return height * parabola(t);
      }
      const t2 = (subP - BIG_ARC_SPLIT) / (1 - BIG_ARC_SPLIT);
      return height * SMALL_BOUNCE_RATIO * parabola(t2);
    };

    // The marble's resting Y (as a GSAP-relative offset from its spawn
    // point at viewport center) — the card's own MEASURED top edge
    // (cardTopY, real DOM rect, not the PROOF_CARD_TOP_VH constant),
    // converted into that offset space. Offset up by the marble's own
    // radius so its BOTTOM edge touches the roof line, not its center —
    // without this the marble's center sat ON the line, meaning half the
    // ball visually poked below it, into the card. The marble rests ON
    // this line; every bounce swings ABOVE it (smaller y), never below.
    const MARBLE_RADIUS = 16; // h-8 w-8 = 32px marble
    const getRestingY = (viewportHeight: number) => cardTopY - MARBLE_RADIUS - viewportHeight / 2;

    // Time-based, not scroll-scrubbed — a resting marble should keep
    // gently bouncing on its own clock, independent of whether/how fast
    // the user is scrolling. Only runs while a card is actually at rest;
    // killed the instant a transition starts so it doesn't fight the
    // scroll-driven hop for control of the same y property. Defined
    // ahead of the fall below so the fall's own onComplete can start it
    // directly — see the note there on why that matters.
    //
    // Each cycle is one clean rise-then-fall arc, not a symmetric yoyo (a
    // plain yoyo — same mirrored ease both ways — read as "stiff" and
    // "oscillating," a pendulum rather than a ball) and NOT bounce.out
    // (which has several decaying micro-bounces packed inside its own
    // 0.5s — right for the one-time dramatic initial drop, but "force"
    // and busy for something repeating continuously at rest). power2.out
    // rising against gravity (slows as it climbs), power2.in falling back
    // with it (speeds up as it drops) — basic ball physics. Near-zero
    // repeatDelay: a real ball rebounds off the ground almost instantly,
    // it doesn't pause there — the "soft" quality comes from the ease
    // curves and modest height, not from a lingering dwell at the bottom.
    let idleTween: gsap.core.Timeline | null = null;
    const startIdleBounce = (marble: HTMLElement, restingY: number, bounceHeight: number) => {
      if (idleTween) return;
      gsap.set(marble, { y: restingY });
      // Under constant gravity, the time to rise to a peak and the time
      // to fall back to the same height are physically EQUAL — a real
      // ball doesn't take a different amount of time going up than
      // coming down, only a different SPEED profile along the way
      // (that asymmetry is what the two different eases already
      // capture). Slower overall (0.5s+0.5s vs 0.3s+0.34s before) while
      // keeping that rise/fall symmetry.
      const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.04 });
      idleTween = tl;
      tl.to(marble, {
        y: restingY - bounceHeight,
        duration: 0.5,
        ease: "power2.out",
      })
        .to(marble, {
          y: restingY,
          duration: 0.5,
          ease: "power2.in",
        })
        // Every idle cycle's own landing — this repeats indefinitely
        // while a card is at rest, which is exactly why playGlassBounce
        // was softened (see its own comment): a bright ping here would
        // be a metronome, a soft one just reads as the marble quietly
        // settled and breathing.
        .call(() => playGlassBounce(0.4));
    };
    const stopIdleBounce = () => {
      idleTween?.kill();
      idleTween = null;
    };

    // Contact-with-surface SFX for the scroll-scrubbed hop above — NOT
    // wired into startIdleBounce's own continuous rise/fall (that repeats
    // every ~1s while a card just sits at rest; a percussive ping on every
    // single cycle would read as an annoying tic, not an ambient loop).
    // These fire only at the two real "landing" instants inside a
    // transition hop: the big arc touching down at BIG_ARC_SPLIT, and the
    // small secondary bounce settling at t=1 — reset back to armed
    // whenever `t` retreats below each threshold, so scrolling back
    // through the same transition replays it, same pattern as every other
    // scroll-position-driven cue on this site.
    let bouncedBig = false;
    let bouncedSmall = false;
    const checkHopBounce = (t: number) => {
      if (t >= BIG_ARC_SPLIT) {
        if (!bouncedBig) {
          bouncedBig = true;
          playGlassBounce(1);
        }
      } else {
        bouncedBig = false;
      }
      if (t >= 0.999) {
        if (!bouncedSmall) {
          bouncedSmall = true;
          playGlassBounce(0.5);
        }
      } else {
        bouncedSmall = false;
      }
    };
    const resetHopBounce = () => {
      bouncedBig = false;
      bouncedSmall = false;
    };

    // The marble's exit off the last card is scroll-SCRUBBED the whole
    // way, same as everything else in this section — no independent
    // fixed-duration tween that finishes and parks the marble somewhere,
    // waiting. That used to hand off to PitchSection via a hard
    // gsap.set teleport (marble reset to just above the viewport, then a
    // fresh timed fall) which read as two disconnected falls with a jump
    // between them. Now the fall itself is just more of updateProof's own
    // scroll-tied `hop` math (see the exit branch below) — PitchSection's
    // own descent trigger picks up the marble's REAL current position and
    // continues from there, so it's one unbroken motion end to end.
    // `reachedExitZone` tracks whether the most recent tick was in the
    // falling half of the exit (not just the rising half) — read once,
    // from `trigger`'s onLeave below, to decide whether to hand off to
    // Pitch at all.
    let reachedExitZone = false;

    // The marble's transit from Impact into Proof — NOT a one-shot
    // gravity fall anymore. ImpactSection's job ends once the glow has
    // condensed into a marble sitting still at its spawn point (marked
    // via `marble.dataset.formed`); from there, this scroll-SCRUBBED
    // trigger takes over: the marble tracks scroll smoothly toward its
    // resting Y for the first FOLLOW_FRACTION of the transit, then holds
    // there ("stuck") for the rest of it — no further movement even
    // though there's still scroll range left before Proof is genuinely
    // "arrived." Only once the user has scrolled all the way to Proof
    // being fully in view (onLeave, below) does it snap straight into
    // the idle bounce cycle — no separate fall/bounce.out landing
    // animation, since the marble is already sitting at that Y by then.
    //
    // Range: "top bottom" (Proof's top merely touching the viewport's
    // bottom — the earliest moment there's any scroll distance to
    // measure progress against) to "top top" (Proof's top reaching the
    // viewport's top — genuinely, fully arrived, the same instant the
    // main scroll-scrubbed trigger below starts being active).
    //
    // Proof's own sticky container isn't actually pinned for most of
    // this range (it only pins right at "top top"), so the CARD itself
    // is still moving in normal document flow throughout — the target Y
    // used here is computed from PROOF_CARD_TOP_VH directly (the same
    // value driving the track's own CSS `top`, so it can't drift from
    // the actual layout) rather than a live DOM measurement, which
    // wouldn't be meaningful until the pin is active anyway. The real
    // DOM rect is still used to CONFIRM/correct that value the instant
    // the pin does become active, in onLeave below.
    const transitTrigger = ScrollTrigger.create({
      trigger: section,
      start: "top bottom",
      end: "top top",
      scrub: true,
      onUpdate: (self) => {
        const marble = document.getElementById("impact-marble");
        if (!marble || marble.dataset.formed !== "true" || marble.dataset.landed === "true") return;
        const viewportHeight = window.innerHeight;
        const targetY = PROOF_CARD_TOP_VH * viewportHeight - MARBLE_RADIUS - viewportHeight / 2;
        const followP = Math.min(1, self.progress / FOLLOW_FRACTION);
        gsap.set(marble, { y: followP * targetY });
      },
      onLeave: () => {
        const marble = document.getElementById("impact-marble");
        if (!marble || marble.dataset.formed !== "true") return;
        // Fresh measurement now that the sticky pin is genuinely active
        // — corrects the CSS-derived estimate above against reality.
        if (firstCard) {
          const rect = firstCard.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) cardTopY = rect.top;
        }
        const restingY = getRestingY(window.innerHeight);
        gsap.set(marble, { y: restingY });
        marble.dataset.landed = "true";
        // The marble's very first touchdown, onto card 1 — this transit
        // hands off straight into the idle cycle with no separate
        // fall/landing tween of its own (see this trigger's own comment),
        // so without this call, card 1 was the one card that never got a
        // contact sound at all.
        playGlassBounce(1);
        startIdleBounce(marble, restingY, IDLE_BOUNCE_HEIGHT);
      },
      onEnterBack: () => {
        // Scrolled back up into the transit zone from deep within Proof
        // — hand control back to onUpdate's scroll-follow above.
        stopIdleBounce();
        const marble = document.getElementById("impact-marble");
        if (marble) delete marble.dataset.landed;
      },
      onLeaveBack: () => {
        // Scrolled back out of the transit zone entirely, into Impact.
        stopIdleBounce();
        const marble = document.getElementById("impact-marble");
        if (!marble) return;
        delete marble.dataset.landed;
        if (marble.dataset.formed === "true") {
          gsap.set(marble, { y: 0 });
        }
      },
    });

    // Pulled out to a named function so it can be called manually once,
    // synchronously, right after the trigger below is created — GSAP
    // computes `self.progress` correctly at creation time from the
    // CURRENT scroll position, but never actually INVOKES onUpdate until
    // the next real scroll event. Left unhandled, that meant glassState
    // (glowCenter etc., defaulted to {x:0,y:0} — literally the top-left
    // corner) rendered with those placeholder values for however long it
    // took the user to scroll even slightly, which is exactly the "bg
    // shape is at top-left first, then snaps into place" bug.
    const updateProof = (self: ScrollTrigger) => {
        const p = self.progress;
        const viewportHeight = window.innerHeight;
        const restingY = getRestingY(viewportHeight);
        const hopHeight = HOP_HEIGHT;

        // xPercent is relative to the TRACK's own box (300% of viewport,
        // three cards wide), not the viewport itself — one card's worth
        // of shift is -100/3, not -100.
        const CARD_SHARE = 100 / SERVICES.length;

        let xPercent: number;
        let isTransition = false;
        let isExitFalling = false;
        let hop = 0;
        if (p < DWELL1_END) {
          xPercent = 0;
          resetHopBounce();
        } else if (p < TRANSITION1_END) {
          const t = (p - DWELL1_END) / (TRANSITION1_END - DWELL1_END);
          xPercent = -t * CARD_SHARE;
          hop = hopOffset(t, hopHeight);
          isTransition = true;
          checkHopBounce(t);
        } else if (p < DWELL2_END) {
          xPercent = -CARD_SHARE;
          resetHopBounce();
        } else if (p < TRANSITION2_END) {
          const t = (p - DWELL2_END) / (TRANSITION2_END - DWELL2_END);
          xPercent = -CARD_SHARE - t * CARD_SHARE;
          hop = hopOffset(t, hopHeight);
          isTransition = true;
          checkHopBounce(t);
        } else if (p < DWELL3_END) {
          xPercent = -CARD_SHARE * 2;
          resetHopBounce();
        } else {
          // EXIT — card 3 slides away exactly like the other transitions
          // (nothing slides in behind it, it's the last card), but the
          // marble's OWN motion splits in two: a scroll-tied rise (the
          // same launch shape/height as a normal hop) for the first
          // EXIT_RISE_FRACTION, then a scroll-tied ACCELERATING fall
          // (power2.in — real gravity, not a linear slide) for the rest
          // of the exit zone. Both halves stay under scroll control the
          // entire time, unlike the old version's independent timed
          // tween — a fast scroll now visibly speeds the fall up instead
          // of the marble lagging behind or racing ahead of it.
          const t = (p - DWELL3_END) / (1 - DWELL3_END);
          xPercent = -CARD_SHARE * 2 - t * CARD_SHARE;
          isTransition = true;
          if (t < EXIT_RISE_FRACTION) {
            const riseT = t / EXIT_RISE_FRACTION;
            // Rising half only of the same parabola a normal hop uses —
            // launches the same way, just doesn't come back down under
            // scroll control.
            hop = hopHeight * parabola(riseT * 0.5);
          } else {
            isExitFalling = true;
            const fallT = (t - EXIT_RISE_FRACTION) / (1 - EXIT_RISE_FRACTION);
            const eased = gsap.parseEase("power2.in")(Math.min(1, fallT));
            // Falls from the rise's peak to a fixed spot near the bottom
            // of the viewport (EXIT_REST_VH) — an absolute on-screen
            // target, independent of the card's own position, so it's
            // still clearly visible once it "lands" there instead of
            // continuing past the edge.
            const exitRestOffsetY = viewportHeight * EXIT_REST_VH - viewportHeight / 2;
            const restHop = exitRestOffsetY - restingY;
            hop = gsap.utils.interpolate(-hopHeight, restHop, eased);
          }
        }
        reachedExitZone = isExitFalling;

        gsap.set(track, { xPercent });

        // Each card's live on-screen center, computed analytically from
        // the same xPercent driving the DOM track (rather than measuring
        // via getBoundingClientRect on every scroll frame, which forces
        // a synchronous layout read 60x/sec) — fed to the WebGL glass
        // layer so its refraction tracks the carousel pixel-for-pixel.
        const viewportWidth = window.innerWidth;
        const trackWidthPx = viewportWidth * SERVICES.length;
        const cardCenterY = PROOF_CARD_TOP_VH * viewportHeight + glassState.cardHeight / 2;
        for (let i = 0; i < CARD_COUNT; i++) {
          glassState.cardCenters[i].x =
            viewportWidth * (i + 0.5) + (xPercent / 100) * trackWidthPx;
          glassState.cardCenters[i].y = cardCenterY;
        }

        // The environment the glass refracts brightens during a
        // transition — the glass visibly "catches more light" exactly
        // when a new card is arriving, so the refraction genuinely
        // changes as you scroll instead of sitting on a frozen
        // background (matches the ambient glow blobs below).
        const transitionGlow = Math.min(1, Math.abs(hop) / hopHeight);
        // Every value tried from 0.55 down through 0.28 kept reading as
        // "still too low" and, at the end, as moving the WRONG way when
        // decreased — because it was: backgroundSceneMaterial.ts's plane
        // UV was unflipped, so the shader's own y-axis ran opposite to
        // the Y-down convention this fraction is written in. Fixed at
        // its source (see that file's vertex shader). 0.42 is a fresh
        // value chosen post-fix, not a holdover from the broken-axis
        // tuning above.
        glassState.glowCenter.x = viewportWidth * 0.5;
        glassState.glowCenter.y = viewportHeight * 0.42;
        glassState.glowIntensity = 0.4 + transitionGlow * 0.3;
        glassState.glow2Center.x = viewportWidth * 0.32;
        glassState.glow2Center.y = viewportHeight * 0.68;
        glassState.glow2Intensity = 0.22 + transitionGlow * 0.18;

        // ImpactSection's own gravity-fall tween sets this the instant
        // the marble genuinely finishes landing (see its playHandoff).
        // Without this check, this onUpdate — which starts firing as
        // soon as Proof's own trigger range becomes active, overlapping
        // with when that fall tween is still mid-flight — was setting
        // the marble's y on every scroll tick and fighting the fall
        // tween for the same property, making the drop look scroll-tied
        // instead of gravity-timed.
        const marble = document.getElementById("impact-marble");
        if (marble && marble.dataset.formed === "true") {
          if (marble.dataset.landed !== "true") {
            // Self-heal. `transitTrigger`'s onLeave (below) is the only
            // OTHER place `landed` ever gets set, and it fires exactly
            // once, mid-scroll, checking `formed` at that single instant
            // — if Impact's own condense sequence (jitter -> resolve ->
            // glow-collapse, played out in real time, not scroll-tied,
            // ~1.1-1.5s) hadn't finished yet at that exact crossing, it
            // silently gave up forever: nothing else ever revisits it.
            // Confirmed by direct testing — a scroll pace only modestly
            // faster than that animation reliably outran the one shot,
            // and the marble was later found frozen indefinitely:
            // formed, never landed, with every branch below (and this
            // whole reclaim block) gated on `landed` alone. This
            // function only runs because Proof's own trigger range is
            // currently active, so `formed` being true here already
            // means the marble belongs to Proof's control regardless of
            // which exact tick first noticed — claim it now too, not
            // only at that one original crossing. Every branch below
            // does an absolute `gsap.set` of `y` (never a relative
            // delta), so whatever stale position the marble was left at
            // gets corrected the same frame this fires, not just future
            // ones.
            marble.dataset.landed = "true";
          }
          if (isExitFalling) {
            // No bounce (it isn't landing on anything) and no fade —
            // stays fully visible and opaque the whole way, since the
            // plan is to pick it back up in Pitch rather than have it
            // vanish here. Scroll-tied `hop` (computed above) IS the
            // fall now — no separate tween fighting for control of y.
            stopIdleBounce();
            delete marble.dataset.exited; // still falling, not handed off yet
            gsap.set(marble, { y: restingY + hop, opacity: 1 });
          } else if (isTransition) {
            stopIdleBounce();
            // Scrolling back into any transition (including the exit
            // zone's own rise) reclaims the marble from Pitch, if it had
            // been handed off.
            delete marble.dataset.exited;
            gsap.set(marble, { y: restingY + hop, opacity: 1 });
          } else {
            delete marble.dataset.exited;
            gsap.set(marble, { opacity: 1 });
            startIdleBounce(marble, restingY, IDLE_BOUNCE_HEIGHT);
          }
        }
    };

    const trigger = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "bottom bottom",
      scrub: isMobile ? 0.15 : 0.6,
      onUpdate: updateProof,
      // Fires exactly once, the instant scroll crosses "bottom bottom" —
      // Proof's own pin genuinely releasing. That's the real hand-off
      // moment: if the marble was mid-exit-fall, it's frozen at its last
      // scroll-tied position (since onUpdate simply stops being called
      // past this point) and is now safe for PitchSection's own descent
      // trigger to pick up and continue from exactly there.
      onLeave: () => {
        const marble = document.getElementById("impact-marble");
        if (marble && reachedExitZone) {
          marble.dataset.exited = "true";
        }
      },
      // The idle-bounce tween runs on repeat: -1, its own independent
      // clock — nothing above ever kills it except a transition
      // starting. If the user scrolls up fast enough to leave this
      // trigger's range entirely, onUpdate simply stops firing and that
      // tween is left running forever in the background (the marble
      // "keeps bouncing" bug). onLeaveBack catches exactly that exit.
      onLeaveBack: () => stopIdleBounce(),
    });
    // Run it once immediately, synchronously, using the trigger's own
    // already-correct initial progress — see the comment on updateProof
    // above for why this is necessary.
    updateProof(trigger);

    // `onLeave` (setting marble.dataset.exited) only fires on an actual
    // scroll crossing of "bottom bottom" — never synchronously just
    // because the page happened to mount already past it, e.g. a
    // back-nav scroll restore landing deep in Pitch (see the matching
    // fix + full explanation in ImpactSection.tsx).
    //
    // A single deferred check isn't reliable here either — measured
    // directly that `trigger.progress` itself can still be wrong shortly
    // after a fresh remount, because it's derived from `trigger`'s own
    // cached start/end PIXEL bounds, which are only as correct as the
    // page's layout was at the moment this ScrollTrigger got created.
    // Same fix as ImpactSection: a short bounded retry, calling
    // `ScrollTrigger.refresh()` (recalculates those bounds against
    // current layout) before each check, matching the codebase's own
    // established polling pattern (see ImpactSection's attemptHandoff).
    // Re-running `updateProof` each try is harmless — idempotent, just
    // resets the same DOM properties from current scroll state — and
    // picks up the corrected position/`reachedExitZone` once the bounds
    // are actually right.
    // Keeps RE-ASSERTING for the whole retry window rather than stopping
    // at the first success — measured directly that a one-shot "set it
    // once and stop" wasn't enough: SmoothScroll's own settle-driven
    // `ScrollTrigger.refresh()` calls (the fix for the earlier
    // stuck-scroll bug) keep recomputing this trigger's start/end bounds
    // as the rest of the page's layout continues settling, which fires
    // this trigger's own registered onUpdate (`updateProof`) again
    // independently of this retry loop — and `updateProof`'s own "at
    // rest" branch unconditionally deletes `exited` whenever progress
    // lands outside the exit zone, with no way to tell "genuine
    // scroll-up" apart from "bounds just shifted under an unmoving
    // scroll position." Rather than trying to make that branch smarter,
    // just keep re-imposing the correct state for the same settle
    // window (~1.5s) SmoothScroll itself uses — the LAST check, once
    // layout has genuinely finished moving, is the one that sticks.
    let selfHealCall: gsap.core.Tween | null = null;
    const trySelfHeal = (triesLeft: number) => {
      ScrollTrigger.refresh();
      updateProof(trigger);
      if (trigger.progress >= 1 && reachedExitZone) {
        const marble = document.getElementById("impact-marble");
        if (marble) marble.dataset.exited = "true";
      }
      if (triesLeft > 0) {
        selfHealCall = gsap.delayedCall(0.15, () => trySelfHeal(triesLeft - 1));
      }
    };
    trySelfHeal(10);

    const headingTrigger = ScrollTrigger.create({
      trigger: section,
      start: "top 80%",
      onEnter: () =>
        gsap.to(heading, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }),
      onEnterBack: () =>
        gsap.to(heading, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }),
      onLeaveBack: () => gsap.set(heading, { opacity: 0, y: 30 }),
    });

    return () => {
      selfHealCall?.kill();
      trigger.kill();
      headingTrigger.kill();
      transitTrigger.kill();
      stopIdleBounce();
      resizeObserver.disconnect();
    };
  }, [glassState]);

  return (
    <section ref={sectionRef} className="relative min-h-[500vh] w-full bg-ink">
      <div className="sticky top-0 h-svh w-full overflow-hidden">
        {/* Genuine refraction has nothing to show if there's nothing
            behind the glass worth bending — a flat solid color displaced
            is still a flat solid color. This gives the lens something to
            actually reveal: a soft, shifting field of accent-colored
            light, on-brand with the throughline glow from Impact/marble
            rather than an arbitrary decorative blob. */}
        {/* Opacity bumped (8% -> 25%) — these sit BEHIND ProofGlassCanvas,
            fully hidden under its opaque WebGL canvas on desktop either
            way (safe to change with zero desktop-visible effect), but on
            mobile that canvas is now the plain CSS GlassPoster (semi-
            transparent) instead — these blobs are what the cards' new
            backdrop-blur frosted glass actually has to refract, and the
            original faint values left it with barely anything to catch. */}
        <div
          className="pointer-events-none absolute left-1/2 top-[55vh] h-[50vh] w-[50vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/25 blur-[100px]"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute left-[30%] top-[70vh] h-[35vh] w-[35vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-chalk/15 blur-[80px]"
          aria-hidden="true"
        />
        {/* The actual glass — real-time WebGL refraction (see
            ProofGlassCanvas.tsx), pixel-synced to the DOM cards below via
            glassState. Sits behind the DOM track so the glass shape reads
            as part of each card, with real text on top of it — not
            behind, per AGENTS.md ("DOM text stays semantic... never
            render copy as canvas/WebGL text"). */}
        <ProofGlassCanvas state={glassState} />
        <div
          ref={headingRef}
          className="absolute inset-x-0 top-[6vh] z-10 flex flex-col items-center gap-4 px-6 text-center"
        >
          <p className="font-mono-kicker text-xs uppercase tracking-[0.3em] text-chalk-muted">
            [ the deploy ]
          </p>
          <h2 className="max-w-2xl font-display text-4xl font-semibold leading-tight text-chalk sm:text-5xl">
            What we deploy.
          </h2>
        </div>

        <div
          ref={trackRef}
          className="absolute inset-x-0 flex"
          style={{ top: `${PROOF_CARD_TOP_VH * 100}vh`, width: `${SERVICES.length * 100}%` }}
        >
          {SERVICES.map((service, i) => (
            <div
              key={service.title}
              className="flex shrink-0 justify-center px-6"
              style={{ width: `${100 / SERVICES.length}%` }}
            >
              <Link
                href="/work"
                data-cursor="lens"
                // Mobile-only real iOS-style frosted glass — backdrop-blur
                // of whatever's actually behind the card (the section's
                // own ambient accent/chalk glow blobs, still there per
                // AGENTS.md now that the WebGL canvas is gone on mobile —
                // see ProofGlassCanvas), a faint chalk tint so the frost
                // itself has some material presence, and an inset
                // highlight along the top edge (the actual detail that
                // sells "glass" over "blur" — a real light catching a
                // curved edge). The video/scrim/text below are all
                // children rendered ON TOP of this element's own backdrop
                // plane, so they stay crisp — only what's behind the card
                // gets blurred. Desktop reverts all of it (still the real
                // WebGL refraction underneath, untouched).
                className="liquid-glass-card group relative block h-[95vh] w-full max-w-md overflow-hidden backdrop-blur-2xl [background:linear-gradient(to_bottom,color-mix(in_srgb,var(--color-chalk)_10%,transparent),color-mix(in_srgb,var(--color-chalk)_3%,transparent))] shadow-[inset_0_1px_1px_rgba(244,244,242,0.3),inset_0_0_50px_rgba(244,244,242,0.05)] sm:bg-none sm:shadow-none sm:backdrop-blur-none"
                onMouseEnter={() => handleGlimpseEnter(i)}
                onMouseLeave={() => handleGlimpseLeave(i)}
              >
                {/* The glimpse — a real clip from the actual product this
                    card represents, not stock/decorative footage. Sits
                    behind the text, invisible at rest so the glass
                    refraction underneath (ProofGlassCanvas) stays the
                    only thing reading at a glance; hover brings it up at
                    low opacity, "showing through" the glass rather than
                    replacing it, and starts real playback (see
                    handleGlimpseEnter above — CSS :hover alone can't
                    start a video). Pure grayscale, no color tint — this
                    card's own border is a real full-spectrum rainbow
                    refraction (ProofGlassCanvas's WebGL glass), which is
                    already the section's one color statement; a tinted
                    clip underneath was competing with that rainbow ring
                    rather than supporting it. Staying monochrome keeps
                    the glass the only thing with color, exactly the
                    "near-monochrome until earned" restraint AGENTS.md
                    asks for elsewhere on this site. Muted permanently —
                    this is a silent background glimpse, not a video with
                    its own soundtrack, regardless of the site's own sound
                    toggle (that only ever governs SFX and the Hero video). */}
                <video
                  ref={(el) => {
                    glimpseVideoRefs.current[i] = el;
                  }}
                  src={service.glimpseVideo}
                  poster={service.glimpseImage}
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-hidden="true"
                  // Visible at rest on mobile (opacity-60, no hover there
                  // to gate it on — it plays continuously instead, see
                  // the mobile-only effect above), hover-gated on desktop
                  // exactly as before (sm:opacity-0 sm:group-hover:...).
                  className="absolute inset-0 z-0 h-full w-full object-cover opacity-60 grayscale-[90%] transition-opacity duration-500 ease-out sm:opacity-0 sm:group-hover:opacity-60"
                />
                {/* A soft top-down scrim, ONLY over the text's own region
                    (not the full card) — the glimpse video sits right
                    behind the title/description at 60% opacity, and once
                    it's playing real motion (not a static still) the text
                    read as noticeably harder to pick out than at rest.
                    This darkens just enough behind the copy to hold
                    contrast without flattening the glimpse into a solid
                    block. Visible at rest on mobile (matching the video
                    above), hover-gated on desktop as before. */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-2/3 bg-gradient-to-b from-ink/70 via-ink/35 to-transparent opacity-100 transition-opacity duration-500 ease-out sm:opacity-0 sm:group-hover:opacity-100"
                />
                <div className="relative z-10 flex h-full flex-col justify-start gap-3 p-8 pt-16 sm:p-10 sm:pt-20">
                  <span className="font-mono-kicker text-[11px] uppercase tracking-[0.2em] text-chalk-muted">
                    0{i + 1}
                  </span>
                  <h3 className="font-display text-2xl font-medium text-chalk [text-shadow:0_1px_3px_rgba(11,12,16,0.6),0_4px_16px_rgba(11,12,16,0.5)] sm:text-3xl">
                    {service.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-chalk [text-shadow:0_1px_3px_rgba(11,12,16,0.6),0_4px_16px_rgba(11,12,16,0.5)]">
                    {service.desc}
                  </p>
                </div>
                <span className="pointer-events-none absolute inset-x-8 bottom-8 z-10 font-mono-kicker text-[11px] uppercase tracking-[0.25em] text-accent opacity-100 transition-opacity duration-500 ease-out sm:inset-x-10 sm:opacity-0 sm:group-hover:opacity-100">
                  View case study →
                </span>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
