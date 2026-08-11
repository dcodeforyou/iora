"use client";

import { gsap } from "./gsapSetup";
import { isSoundEnabled, subscribeSound } from "@/lib/sound/soundManager";
import { HERO_VIDEO_VOLUME_IN_VIEW, onHeroVideoLoopStart, onHeroVideoLoopRestart } from "./heroVideo";

// Track's own name/artist — the single source of truth for both the credit
// text (Hero.tsx) and any future reference, so the two can never drift.
export const HERO_MUSIC_TITLE = "Future Club";
export const HERO_MUSIC_ARTIST = "Perturbator";

const SOURCE = "/audio/future-club.mp3";

// Not a fixed volume — a RATIO of whatever the hero video's own volume
// currently is, so the music automatically tracks the exact same ducking
// dynamic (in-view vs out-of-view, see heroVideo.ts's own HERO_VIDEO_
// VOLUME_* constants) without needing a second, separate visibility
// observer of its own.
const HERO_MUSIC_VOLUME_RATIO = 0.4;

// Plain mutable object (not React state) — same pattern as heroVideoState.
export const heroMusicState: { el: HTMLAudioElement | null; started: boolean } = {
  el: null,
  started: false,
};

const startListeners = new Set<() => void>();

/**
 * Fires exactly once, the instant playHeroMusic() actually starts real
 * playback — Hero.tsx uses this to reveal the credit line only once the
 * track is genuinely audible, not from page load (crediting a track that
 * hasn't started yet reads as premature/confusing).
 */
export function onHeroMusicStart(listener: () => void): () => void {
  startListeners.add(listener);
  return () => startListeners.delete(listener);
}

let loopSubscribed = false;

/**
 * Creates (once — idempotent) a hidden <audio> element for the background
 * track and starts loading it. Also the one place that subscribes to
 * heroVideo.ts's `onHeroVideoLoopStart` — the actual trigger for
 * `playHeroMusic()` below, so simply calling this early (see CrtPowerOn.tsx)
 * is enough to arm the whole "start exactly when the loop begins" behavior;
 * nothing else needs to remember to wire that up.
 */
export function initHeroMusic(): HTMLAudioElement {
  if (heroMusicState.el) return heroMusicState.el;
  if (typeof document === "undefined") {
    throw new Error("initHeroMusic() must only be called client-side");
  }

  const audio = document.createElement("audio");
  // Same site-wide sound toggle the hero video itself follows — if the
  // toggle is off, 25% of "off" is still off, so gating this the exact
  // same way (rather than only scaling `.volume`) is both correct and the
  // simplest way to guarantee it.
  audio.muted = !isSoundEnabled();
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = HERO_VIDEO_VOLUME_IN_VIEW * HERO_MUSIC_VOLUME_RATIO;
  subscribeSound((enabled) => {
    audio.muted = !enabled;
  });
  audio.style.display = "none";
  audio.setAttribute("aria-hidden", "true");
  audio.setAttribute("tabindex", "-1");
  document.body.appendChild(audio);

  audio.src = SOURCE;
  audio.load();

  heroMusicState.el = audio;

  if (!loopSubscribed) {
    loopSubscribed = true;
    onHeroVideoLoopStart(() => playHeroMusic());
    // Every SUBSEQUENT video loop restart (not just the first) resets the
    // track back to its own t=0 too — keeps the two re-anchored together
    // on every cycle instead of drifting apart once the music's own
    // (shorter, ~30s) duration and the video's own loop length stop
    // lining up. `loop = true` above still covers the track looping on
    // its own in between video-loop cycles, if the video's loop happens
    // to run longer than the music's own duration.
    onHeroVideoLoopRestart(() => {
      const el = heroMusicState.el;
      if (!el || !heroMusicState.started) return;
      el.currentTime = 0;
      void el.play().catch(() => {});
    });
  }

  return audio;
}

/**
 * Starts the background track — called automatically the instant the hero
 * video's own post-impact loop begins (see initHeroMusic's subscription
 * above), never at the click/impact moment. Idempotent: only the FIRST
 * loop start ever triggers this, since the track then keeps looping on its
 * own (`loop = true`) independently of how many times the video itself
 * loops afterward.
 *
 * Plays from the file's own start (0), not seeked to any offset — this
 * asset is already a ~30s trim beginning at the intended point in the
 * original track (its own total duration is ~30s), not the full song, so
 * its own t=0 IS "starting from 29s of the original."
 */
export function playHeroMusic(): void {
  if (heroMusicState.started) return;
  heroMusicState.started = true;
  const audio = heroMusicState.el ?? initHeroMusic();
  audio.currentTime = 0;
  void audio.play().catch(() => {
    // Same reasoning as heroVideo.ts's own playHeroVideo — a failed play()
    // here is not worth surfacing, the visual sequence doesn't depend on it.
  });
  startListeners.forEach((listener) => listener());
}

// Out-of-view music level is a flat, ABSOLUTE volume — NOT derived from
// HERO_VIDEO_VOLUME_OUT_OF_VIEW × HERO_MUSIC_VOLUME_RATIO the way the
// in-view level still is. That ratio-based math would otherwise silence
// the music entirely the instant the video itself goes fully silent
// out-of-view (0 × anything = 0) — direct feedback was that the video
// should genuinely go to 0 out-of-view, but the music should stay
// independently audible at a flat 5% regardless. In-view math is
// untouched (still exactly HERO_VIDEO_VOLUME_IN_VIEW × HERO_MUSIC_VOLUME_
// RATIO), only this one branch was decoupled.
const HERO_MUSIC_VOLUME_OUT_OF_VIEW = 0.05;

let volumeTween: gsap.core.Tween | null = null;

/**
 * Mirrors heroVideo.ts's own `setHeroVideoFocus` — same `inView` signal
 * (HeroScene.tsx calls both from the same effect), same duration/ease.
 * In-view target is still the video's own volume × HERO_MUSIC_VOLUME_RATIO
 * (exactly as before); out-of-view target is the flat
 * HERO_MUSIC_VOLUME_OUT_OF_VIEW above, not a ratio of the video's (now
 * silent) out-of-view level — see that constant's own comment.
 */
export function setHeroMusicFocus(inView: boolean): void {
  const audio = heroMusicState.el;
  if (!audio) return;
  volumeTween?.kill();
  if (!inView) {
    volumeTween = gsap.to(audio, { volume: HERO_MUSIC_VOLUME_OUT_OF_VIEW, duration: 0.8, ease: "power1.inOut" });
    return;
  }
  const videoTarget = HERO_VIDEO_VOLUME_IN_VIEW;
  volumeTween = gsap.to(audio, {
    volume: videoTarget * HERO_MUSIC_VOLUME_RATIO,
    duration: 0.8,
    ease: "power1.inOut",
  });
}
