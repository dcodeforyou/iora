"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";
import { gsap, ScrollTrigger } from "./gsapSetup";
import { getLenisInstance, setLenisInstance } from "./lenisInstance";
import { getScrollPosition, saveScrollPosition } from "./scrollMemory";

/**
 * Single smooth-scroll authority for the whole site (see AGENTS.md: "one
 * motion authority"). Lenis owns the actual scroll physics; every GSAP
 * ScrollTrigger elsewhere reads the same source via ScrollTrigger.update on
 * Lenis's own scroll event, so nothing fights over who drives scroll
 * position. Respects prefers-reduced-motion by not smoothing at all —
 * native scroll, and every ScrollTrigger consumer checks the same media
 * query itself before pinning/scrubbing anything.
 */
export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const isPopNav = useRef(false);
  pathnameRef.current = pathname;

  // Browser back/forward is the ONE case scroll should be RESTORED
  // rather than reset to 0 — e.g. clicking a Proof card from deep in
  // the homepage's scroll, then pressing back, should land exactly
  // back where that click happened, not snap to the top. `popstate`
  // only fires for actual back/forward navigation (not for a regular
  // forward `<Link>`/`router.push`), so it's the correct signal to flag
  // before the pathname-change effect below runs.
  useEffect(() => {
    const onPopState = () => {
      isPopNav.current = true;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Continuously keeps the CURRENT page's scroll position cached (keyed
  // by pathname) so it's already there by the time the user navigates
  // away — cheaper and less fragile than trying to catch "about to
  // leave" as a one-shot event.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => saveScrollPosition(pathnameRef.current, window.scrollY));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // The Lenis instance lives for the whole app session (created once
  // below, never torn down between routes) since this component's own
  // effect only runs on mount/unmount, not on client-side navigation.
  //
  // Measured directly (logging Lenis's own `dimensions.scrollHeight`
  // alongside the real `document.body.scrollHeight` on every tick after
  // a client-side nav into a project page): the real DOM height
  // genuinely moves as the new page settles — 1655 → 1479 → 3774px in
  // this case, as gallery images finish laying out — while Lenis's
  // cached height freezes at 1479 and never corrects, capping the
  // scroll limit far short of the real page and producing a hard stop
  // partway down (reported as scroll going "stuck"). Lenis DOES have
  // its own auto ResizeObserver on `document.documentElement`, but that
  // observer's contentRect doesn't reliably reflect scrollHeight growth
  // from overflowing children the way it reflects an element's own
  // box resizing — it never re-fired here even 2.5s after the height
  // had clearly changed. A single manual `resize()` call right at the
  // pathname change has the same problem: it just captures whichever
  // in-between height happens to exist at that instant.
  //
  // Fix: run our OWN ResizeObserver on `document.body` for the
  // lifetime of each route, syncing Lenis on every change — not a
  // one-shot call timed to guess when things have "settled."
  useEffect(() => {
    const lenis = getLenisInstance();
    if (!lenis) return;

    const wasPopNav = isPopNav.current;
    isPopNav.current = false;
    const restoreY = wasPopNav ? getScrollPosition(pathname) : undefined;
    // Only re-apply the restore target for a short settle window, not
    // the observer's whole lifetime — otherwise a real user scroll right
    // after landing would keep getting yanked back on every subsequent
    // body-height change for as long as this route stays mounted.
    const restoreDeadline = Date.now() + 1500;

    lenis.resize();
    lenis.scrollTo(restoreY ?? 0, { immediate: true });
    ScrollTrigger.refresh();

    const sync = () => {
      lenis.resize();
      ScrollTrigger.refresh();
      // The restore target above was computed against whatever height
      // existed at that instant — this same settle-driven resync (the
      // fix for the stuck-scroll bug) also re-applies it as the page's
      // real height comes in, so a restore into a not-yet-fully-laid-out
      // page doesn't get silently clamped short and left there.
      if (restoreY != null && Date.now() < restoreDeadline) {
        lenis.scrollTo(restoreY, { immediate: true });
      }
    };
    const observer = new ResizeObserver(sync);
    observer.observe(document.body);

    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Belt-and-suspenders with the inline <head> script in layout.tsx
    // (which already runs earlier and covers the common case) — cheap
    // insurance for this being the one place every scroll-driven entrance
    // animation on the page ultimately depends on already being correct
    // before Lenis takes over.
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    window.scrollTo(0, 0);

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
      touchMultiplier: 1.15,
    });

    lenis.on("scroll", ScrollTrigger.update);
    setLenisInstance(lenis);

    const tick = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      setLenisInstance(null);
      lenis.destroy();
    };
  }, []);

  return children;
}
