"use client";

// Global SFX authority — one AudioContext, one master gain, one mute flag.
// Browsers block audio until a real user gesture; rather than fight that,
// sound defaults OFF (same as noomo's own labs site — an explicit "sound
// on" toggle, not autoplay-and-hope) and the toggle button's own click IS
// the unlock gesture that creates/resumes the AudioContext.
//
// Deliberately NOT persisted across reloads/visits (no localStorage) —
// sound here is ambiance, not core content, and silently carrying an "on"
// state forward means a page reload could start playing audio the instant
// the user scrolls, with no fresh gesture of their own behind it that
// visit. Every real page load/refresh re-asks, same as noomo's own
// "to make this more immersive we use sound effects" prompt does each
// time rather than remembering a past answer. This also means the
// AudioContext is only ever created inside an explicit click (see
// setSoundEnabled below), which is always a valid, synchronous unlock
// gesture — no separate "resume on next gesture after reload" handling
// needed.
//
// No licensed/recorded audio files — every cue below is synthesized from
// oscillators and filtered noise (see sfx.ts), which sidesteps sourcing
// entirely and, being purely electrical/digital in character, actually
// fits this site's CRT motif better than recorded foley would.

type Listener = (enabled: boolean) => void;

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
const listeners = new Set<Listener>();
let enabled = false;

// Lazily created, never re-created — AudioContext construction itself
// counts as "using audio hardware" in some browsers' power/permission
// accounting, so this only ever happens once, on the first real toggle-on.
function getContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);
  }
  return ctx;
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function subscribeSound(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((l) => l(enabled));
}

export function setSoundEnabled(next: boolean) {
  enabled = next;
  if (next) {
    // The gesture that flipped this on is also the unlock gesture —
    // create/resume the context synchronously within the same click.
    const c = getContext();
    if (c.state === "suspended") void c.resume();
  }
  notify();
}

export function toggleSound() {
  setSoundEnabled(!enabled);
}

/**
 * Get the shared AudioContext + master gain for a synth function to render
 * into. Returns null if sound is currently disabled or the context can't
 * be created (SSR, unsupported browser) — callers should no-op in that case.
 */
export function getAudioGraph(): { context: AudioContext; destination: GainNode } | null {
  if (!enabled) return null;
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  const context = getContext();
  if (!masterGain) return null;
  return { context, destination: masterGain };
}
