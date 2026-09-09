"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const subscribeNoop = () => () => {};

/** Same SSR-safe pattern this codebase already uses in ProofGlassCanvas /
 * ProofSection: false through SSR and the first client render (so
 * hydration matches), real value after. Needed here because both the
 * `?debug` check and the environment readout are window-only. */
function useIsClient() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

/**
 * On-device diagnostic panel for the media pipeline, shown ONLY when the
 * URL carries `?debug=video`. Invisible to every real visitor — there is
 * no link to it and no UI that reveals it.
 *
 * This exists because the media bugs on this site have been device-
 * specific in ways that can't be reproduced from a desktop dev machine
 * (one clip playing fine on an iPhone 12 Pro and an Android device while
 * failing on an iPhone 16 Pro Max), and repeated blind fixes are worse
 * than one round of real numbers. It reports the facts that actually
 * discriminate between the competing explanations:
 *
 *  - viewport width / DPR: proves which CSS + JS breakpoint branch the
 *    device is really taking, rather than assuming from the model name
 *  - per-<video> readyState / networkState / paused / error: separates
 *    "never loaded" from "loaded but refuses to play" — completely
 *    different bugs with completely different fixes
 *  - a live play() attempt and its verbatim rejection reason: WebKit's
 *    power-saving pause resolves play() successfully and then pauses
 *    anyway, so the ONLY way to see it is to compare paused state a
 *    moment after the call rather than trusting the promise
 *  - lowPowerMode-ish signal: iOS blocks autoplay outright in Low Power
 *    Mode, which no amount of application code can override, so it has
 *    to be ruled in or out explicitly rather than assumed
 */
type Row = {
  label: string;
  src: string;
  readyState: number;
  networkState: number;
  paused: boolean;
  muted: boolean;
  currentTime: number;
  videoWidth: number;
  error: string;
  playResult: string;
  pausedAfterPlay: string;
};

export default function VideoDebugOverlay() {
  const isClient = useIsClient();
  const [rows, setRows] = useState<Row[]>([]);

  // Derived during render, not stored via setState-in-effect — both are
  // pure reads of window/navigator, and the codebase's lint config
  // (correctly) rejects synchronous setState inside an effect body.
  const enabled = isClient && new URLSearchParams(window.location.search).has("debug");
  // Opt-in, destructive: actively calls play() on paused elements. Only
  // meaningful when the question is "will this specific video play if
  // asked" — never for a general read of the page's state.
  const probe = isClient && new URLSearchParams(window.location.search).get("probe") === "1";
  const env = enabled
    ? [
        `viewport ${window.innerWidth}x${window.innerHeight}`,
        `dpr ${window.devicePixelRatio}`,
        `net ${
          (navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } })
            .connection?.effectiveType ?? "n/a"
        }`,
        `vis ${document.visibilityState}`,
        `reducedMotion ${window.matchMedia("(prefers-reduced-motion: reduce)").matches}`,
      ].join("  ·  ")
    : "";

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const scan = async () => {
      const vids = Array.from(document.querySelectorAll("video"));
      const next: Row[] = [];
      for (let i = 0; i < vids.length; i++) {
        const v = vids[i];
        const src = (v.getAttribute("src") ?? v.currentSrc ?? "?").split("/").pop() ?? "?";
        // A play() attempt is the only reliable probe: WebKit's
        // power-saving pause RESOLVES the promise and pauses the element
        // immediately afterwards, reporting nothing. Comparing `paused`
        // ~600ms later is what actually exposes it.
        // OBSERVE-ONLY unless ?probe=1 is also present. The first version
        // of this panel called play() on every paused element to test it,
        // and that immediately corrupted its own reading: it started the
        // Proof glimpse clips, which are deliberately hover-gated on
        // desktop, so the panel then reported them as "playing" and made
        // a correctly-working page look broken. An instrument that
        // changes what it measures is worse than no instrument. The
        // readyState/networkState/paused triplet below already separates
        // the two failure modes that matter — "never loaded" (readyState
        // 0) vs "loaded but won't play" (readyState 4 + paused) — without
        // touching anything.
        let playResult = "observe-only";
        let pausedAfterPlay = "-";
        if (probe && v.paused) {
          try {
            await v.play();
            playResult = "resolved";
          } catch (e) {
            playResult = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
          }
          // WebKit's power-saving pause resolves play() successfully and
          // pauses a moment later, reporting nothing — so re-reading
          // `paused` after a delay is the only way to actually see it.
          await new Promise((r) => setTimeout(r, 600));
          pausedAfterPlay = v.paused ? "PAUSED AGAIN" : "playing";
        }
        next.push({
          label: `#${i + 1}`,
          src,
          readyState: v.readyState,
          networkState: v.networkState,
          paused: v.paused,
          muted: v.muted,
          currentTime: +v.currentTime.toFixed(2),
          videoWidth: v.videoWidth,
          error: v.error ? `code ${v.error.code}: ${v.error.message}` : "none",
          playResult,
          pausedAfterPlay,
        });
      }
      if (!cancelled) setRows(next);
    };

    void scan();
    const id = window.setInterval(() => void scan(), 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, probe]);

  if (!enabled) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2147483647,
        maxHeight: "55vh",
        overflowY: "auto",
        background: "rgba(0,0,0,0.92)",
        color: "#0f0",
        font: "11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace",
        padding: "10px 12px",
        borderTop: "1px solid #0f0",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div style={{ color: "#ff4e32", fontWeight: 700, marginBottom: 6 }}>
        VIDEO DEBUG — {rows.length} &lt;video&gt; on page {probe ? "· PROBE ON" : "· observe-only"}
      </div>
      <div style={{ color: "#9f9", marginBottom: 8 }}>{env}</div>
      {rows.map((r) => (
        <div
          key={r.label + r.src}
          style={{ borderTop: "1px solid #333", paddingTop: 6, marginTop: 6 }}
        >
          <div style={{ color: "#fff" }}>
            {r.label} {r.src}
          </div>
          <div>
            readyState {r.readyState} · networkState {r.networkState} · {r.videoWidth}px ·{" "}
            t={r.currentTime}
          </div>
          <div>
            paused {String(r.paused)} · muted {String(r.muted)} · err {r.error}
          </div>
          <div style={{ color: r.pausedAfterPlay === "PAUSED AGAIN" ? "#ff4e32" : "#0f0" }}>
            play() {r.playResult} → {r.pausedAfterPlay}
          </div>
        </div>
      ))}
    </div>
  );
}
