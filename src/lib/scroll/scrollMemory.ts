// Per-pathname scroll position cache for back/forward navigation. Kept
// in memory (not sessionStorage) — this only ever needs to survive
// within the current SPA session; a real reload already goes through
// the entrance-animation reset path on purpose (see layout.tsx's inline
// script and SmoothScroll's own mount effect), and shouldn't resume
// mid-scroll into a one-shot boot sequence.
const positions = new Map<string, number>();

export function saveScrollPosition(pathname: string, y: number) {
  positions.set(pathname, y);
}

export function getScrollPosition(pathname: string): number | undefined {
  return positions.get(pathname);
}
