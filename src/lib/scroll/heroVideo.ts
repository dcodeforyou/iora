"use client";

import { gsap } from "./gsapSetup";
import { HERO_LOOP_TIME, HERO_VIDEO_BREAKPOINT } from "./heroEntry";
import { isSoundEnabled, subscribeSound } from "@/lib/sound/soundManager";

// Ambient ducking, independent of the mute toggle: full volume while Hero
// is anywhere in the viewport, quietly present (not silent) once it's
// scrolled fully out of view, back up the instant it's back in view even
// slightly. `.muted` (see initHeroVideo below) is the separate, absolute
// on/off gate driven by the site's own sound toggle — that one wins
// outright when off (a muted element stays silent no matter what `.volume`
// is set to); this only ever adjusts the level for when it IS on.
export const HERO_VIDEO_VOLUME_IN_VIEW = 1;
export const HERO_VIDEO_VOLUME_OUT_OF_VIEW = 0;

// Two source cuts of the exact same "hooded figure kicks the CRT" footage —
// a landscape desktop version and a portrait mobile version — see AGENTS.md's
// shattered-CRT motif. Selected ONCE per session by viewport width (the same
// threshold HeroScene.tsx uses for its own mobile shard seed), not
// re-evaluated on resize/rotate: this is the hero's one scene graph, not
// something that should swap footage mid-session.
const SOURCES = {
  web: "/videos/iora-web.mp4",
  mobile: "/videos/iora-mobile.mp4",
} as const;

export type HeroVideoKey = keyof typeof SOURCES;

let activeKey: HeroVideoKey | null = null;

/** Resolved once (module-level cache) on first call, client-only. */
export function getActiveVideoKey(): HeroVideoKey {
  if (activeKey) return activeKey;
  activeKey = typeof window !== "undefined" && window.innerWidth < HERO_VIDEO_BREAKPOINT ? "mobile" : "web";
  return activeKey;
}

// Plain mutable object (not React state) — same pattern as signalBlend/
// progress elsewhere in this scroll layer. `.el` is set the instant the
// element exists so HeroScene's VideoTexture can bind to it immediately;
// `.ready` flips true on `canplaythrough` — informational only, nothing in
// the click-to-enter flow blocks on it (see initHeroVideo's own comment).
export const heroVideoState: { el: HTMLVideoElement | null; ready: boolean; key: HeroVideoKey | null } = {
  el: null,
  ready: false,
  key: null,
};

let loopHandlerInstalled = false;

/**
 * Creates (once — idempotent, safe to call from multiple mount effects) a
 * hidden <video> element for whichever cut this viewport uses, and calls
 * `.load()` immediately. Meant to be invoked as the very first thing
 * CrtPowerOn's mount effect does, well before its own boot timeline's two
 * deferred rAFs even run — bytes need to start flowing over the network
 * before "[ signal lost ]" has even faded in, per this site's own explicit
 * requirement that the video (and the WebGL shard shaders — see
 * HeroScene.tsx's gl.compileAsync warm-up) be ready by the time that screen
 * appears. Also called from HeroScene's SceneContent so the VideoTexture
 * has a real element to bind to regardless of component mount order.
 *
 * Deliberately loads ONLY the active platform's file, not both — loading
 * the unused cut too would compete for the exact bandwidth this function
 * exists to protect, for a file that will never play this session.
 *
 * Not gated on network speed: `.play()` (see playHeroVideo below) is called
 * unconditionally on the entry click regardless of `.ready` — browsers
 * handle playback of a partially-buffered video natively (play what's
 * downloaded, keep buffering), and this site has no loading-spinner state
 * to show instead. The real guarantee here is "loading started as early as
 * technically possible," not "guaranteed fully buffered by click time."
 */
export function initHeroVideo(): HTMLVideoElement {
  if (heroVideoState.el) return heroVideoState.el;
  if (typeof document === "undefined") {
    // SSR guard — this module is imported by client components, but the
    // component's own module body still executes once during the server
    // render pass. Real callers only ever invoke this from inside a
    // useEffect, which never runs server-side, but keeping the guard here
    // (rather than trusting every call site) means this function is safe
    // to call from anywhere, always.
    throw new Error("initHeroVideo() must only be called client-side");
  }

  const key = getActiveVideoKey();
  const video = document.createElement("video");
  // Follows the site's real sound toggle (soundManager.ts / SoundToggle.tsx)
  // — the same on/off flag every synthesized SFX cue already respects —
  // rather than a hardcoded mute. Sound defaults off site-wide (a real user
  // gesture is required before any audio plays, per soundManager's own
  // autoplay-policy reasoning), so the video starts muted for the same
  // reason, and un-mutes live the instant the user flips the toggle, no
  // matter when that happens relative to the video already playing.
  video.muted = !isSoundEnabled();
  video.defaultMuted = video.muted;
  subscribeSound((enabled) => {
    video.muted = !enabled;
  });
  video.playsInline = true;
  video.preload = "auto";
  // Off-screen but genuinely attached to the document — some browsers
  // (older iOS Safari in particular) throttle or refuse to decode/autoplay
  // a video element that was never attached to the DOM at all.
  video.style.position = "fixed";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  video.setAttribute("aria-hidden", "true");
  video.setAttribute("tabindex", "-1");
  document.body.appendChild(video);

  video.addEventListener("canplaythrough", () => {
    heroVideoState.ready = true;
  }, { once: true });

  // Set after the listeners/attributes above, then load() — src assignment
  // is what actually kicks off the network request, so everything that
  // needs to observe "did it finish" has to be wired first.
  video.src = SOURCES[key];
  video.load();

  heroVideoState.el = video;
  heroVideoState.key = key;
  return video;
}

const loopStartListeners = new Set<() => void>();

/**
 * Fires exactly once per session, the FIRST time the video's own playback
 * position reaches HERO_LOOP_TIME[key] — which happens on the very first
 * playthrough (forward playback simply arriving at that timestamp), not
 * only at the later "ended" -> jump-back-to-HERO_LOOP_TIME restart. An
 * earlier version fired this from "ended" alone, which meant the
 * background track (see heroMusic.ts) never started until the ENTIRE
 * first playthrough finished (23.7s in for the web cut) — direct feedback
 * was that it should start the first time playback reaches that same
 * timestamp, matching the loop point's own meaning ("the ambient tail
 * begins here") rather than only its later literal restarts. heroMusic.ts
 * subscribes to this without heroVideo.ts needing to know music exists at
 * all (one-directional dependency: heroMusic imports from here, never the
 * reverse).
 */
export function onHeroVideoLoopStart(listener: () => void): () => void {
  loopStartListeners.add(listener);
  return () => loopStartListeners.delete(listener);
}

const loopRestartListeners = new Set<() => void>();

/**
 * Fires on EVERY actual loop restart (every "ended" -> jump-back-to-
 * HERO_LOOP_TIME cycle below), unlike onHeroVideoLoopStart above which
 * only ever fires once. heroMusic.ts uses this to reset the background
 * track back to its own beginning each time the video loops, so the two
 * stay re-anchored together on every cycle instead of drifting apart once
 * the music's own (shorter) duration and the video's own loop length stop
 * lining up.
 */
export function onHeroVideoLoopRestart(listener: () => void): () => void {
  loopRestartListeners.add(listener);
  return () => loopRestartListeners.delete(listener);
}

/**
 * Starts real playback from 0 and installs the custom loop — once the video
 * reaches its natural end, jump back to HERO_LOOP_TIME[key] (not 0) and keep
 * playing, forever. The native `loop` attribute always restarts at 0, which
 * would replay the whole approach-and-impact beat on every loop; this plays
 * only each cut's ambient tail after the first playthrough.
 */
export function playHeroVideo(): void {
  const video = heroVideoState.el ?? initHeroVideo();
  const key = heroVideoState.key ?? getActiveVideoKey();

  if (!loopHandlerInstalled) {
    loopHandlerInstalled = true;
    video.addEventListener("ended", () => {
      video.currentTime = HERO_LOOP_TIME[key];
      void video.play();
      loopRestartListeners.forEach((listener) => listener());
    });
    // Separate from the "ended" listener above (which owns the actual
    // looping mechanic) — this one only ever fires the loop-start
    // listeners, exactly once, the first moment currentTime crosses
    // HERO_LOOP_TIME, whether that's mid-way through the first natural
    // playthrough or (redundantly, harmlessly — `fired` guards it) at a
    // later restart.
    let fired = false;
    video.addEventListener("timeupdate", () => {
      if (fired || video.currentTime < HERO_LOOP_TIME[key]) return;
      fired = true;
      loopStartListeners.forEach((listener) => listener());
    });
  }

  video.currentTime = 0;
  void video.play().catch(() => {
    // Autoplay rejection shouldn't be possible here (this is only ever
    // called from a real click handler — see CrtPowerOn's handleEnter) but
    // swallow rather than throw: a failed video play is not a reason to
    // abort the rest of the entry sequence (scroll unlock, shard shatter).
  });
}

let volumeTween: gsap.core.Tween | null = null;

/**
 * Smoothly ducks/restores the hero video's own volume based on whether
 * Hero is currently in the viewport — called from HeroScene.tsx's own
 * IntersectionObserver (`isVisible`), the SAME signal that already pauses
 * the WebGL render loop when Hero scrolls off-screen, reused here rather
 * than standing up a second observer for what's really the same question
 * ("is Hero on screen right now"). `threshold: 0` on that observer means
 * `isVisible` flips to false only once Hero is FULLY out of view, and back
 * to true the instant even a sliver is visible again — exactly the "poora
 * scroll past" / "thodi bhi wapas aaye" behavior asked for.
 */
export function setHeroVideoFocus(inView: boolean): void {
  const video = heroVideoState.el;
  if (!video) return;
  volumeTween?.kill();
  volumeTween = gsap.to(video, {
    volume: inView ? HERO_VIDEO_VOLUME_IN_VIEW : HERO_VIDEO_VOLUME_OUT_OF_VIEW,
    duration: 0.8,
    ease: "power1.inOut",
  });
}
