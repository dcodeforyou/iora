"use client";

// What's currently sitting behind the fixed Nav, as a function of
// SCROLL POSITION — not pointer position. This is a different question
// from CustomCursor's light/dark detection (which reacts to where the
// mouse is), since Nav is fixed at the top of the viewport regardless
// of where the cursor happens to be. Three states, matching the site's
// three real backgrounds: the default ink black, Pitch's committed
// amber/accent wash, and the chalk-white Resolution/Footer stretch.
export type NavBg = "dark" | "amber" | "light";

type Listener = (state: NavBg) => void;

let current: NavBg = "dark";
const listeners = new Set<Listener>();

export function getNavBg(): NavBg {
  return current;
}

export function setNavBg(next: NavBg) {
  if (next === current) return;
  current = next;
  listeners.forEach((l) => l(current));
}

export function subscribeNavBg(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
