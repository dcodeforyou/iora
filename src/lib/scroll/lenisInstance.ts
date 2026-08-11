import type Lenis from "lenis";

// The single Lenis instance SmoothScroll owns, exposed for the rare case
// a scroll-tied beat needs to briefly stop/start real scroll input itself
// (see PitchSection's entrance lock) — not for driving scroll position,
// that stays ScrollTrigger's job. Null whenever Lenis isn't running at
// all (prefers-reduced-motion, or before/after SmoothScroll's own effect
// has mounted/unmounted) — every caller must treat this as optional.
let instance: Lenis | null = null;

// `locked`, not just "call .stop() once" — CrtPowerOn (root layout, see
// layout.tsx) mounts and runs its effect BEFORE SmoothScroll does, so at
// the moment it wants to lock scroll, this module's `instance` is still
// null: a bare `getLenisInstance()?.stop()` silently no-ops on nothing,
// and the real instance SmoothScroll creates moments later is never told
// to stop at all — confirmed directly (simulated wheel input moved
// scrollY from 0 to 551 while the CRT/button screen was supposedly
// locked). Tracking intent as its own flag, checked here in
// `setLenisInstance` too, makes this correct regardless of which of the
// two components' effects happens to run first: whichever arrives
// second sees the other's already-recorded state and reconciles.
let locked = false;

export function setLenisInstance(lenis: Lenis | null) {
  instance = lenis;
  if (instance && locked) instance.stop();
}

export function getLenisInstance(): Lenis | null {
  return instance;
}

// Belt-and-suspenders alongside `instance.stop()` — confirmed directly
// (real wheel-event instrumentation, comparing scrollY before/after under
// rapid synthetic wheel input) that `instance.stop()` alone still let
// real scroll through during a multi-second lock. Lenis's own wheel
// handler DOES correctly call `preventDefault()` while stopped — but
// `preventDefault()` only blocks the browser's OWN native scroll; it does
// NOT stop other listeners (including Lenis's own) from still reacting to
// the event. `stopImmediatePropagation()`, registered here with
// `capture: true` so this runs before Lenis's own (bubble-phase) listener
// ever sees the event at all, is what actually closes the gap — Lenis's
// handler never runs in the first place, rather than running and (for
// reasons not fully pinned down beyond this) still moving scroll despite
// its own isStopped/isLocked checks.
function preventScrollInput(e: Event) {
  e.preventDefault();
  e.stopImmediatePropagation();
}
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
function preventScrollKeydown(e: KeyboardEvent) {
  if (SCROLL_KEYS.has(e.key)) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}

/** Stops real scroll input immediately if Lenis already exists, and makes
 * sure it starts stopped too if it doesn't exist yet (see `locked` above). */
export function lockLenisScroll() {
  locked = true;
  instance?.stop();
  window.addEventListener("wheel", preventScrollInput, { passive: false, capture: true });
  window.addEventListener("touchmove", preventScrollInput, { passive: false, capture: true });
  window.addEventListener("keydown", preventScrollKeydown, { passive: false, capture: true });
}

const unlockListeners = new Set<() => void>();

/**
 * Fires every time unlockLenisScroll() actually runs — Hero.tsx uses this
 * to hold its own "Scroll" hint hidden until scroll is genuinely available
 * again, rather than showing it unconditionally from mount. It used to be
 * visible underneath/around the CRT boot overlay (CrtPowerOn's own centered
 * content doesn't cover Hero's bottom-of-viewport hint), telling a user
 * "scroll" while scroll was actually still locked — confirmed directly as
 * a real, misleading report.
 */
export function onLenisUnlock(listener: () => void): () => void {
  unlockListeners.add(listener);
  return () => unlockListeners.delete(listener);
}

export function unlockLenisScroll() {
  locked = false;
  instance?.start();
  window.removeEventListener("wheel", preventScrollInput, { capture: true });
  window.removeEventListener("touchmove", preventScrollInput, { capture: true });
  window.removeEventListener("keydown", preventScrollKeydown, { capture: true });
  unlockListeners.forEach((listener) => listener());
}
