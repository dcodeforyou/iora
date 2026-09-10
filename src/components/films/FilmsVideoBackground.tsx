"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import "@/styles/films-video-background.css";

/**
 * The films-world background, as real looping footage.
 *
 * Replaces the code-drawn SVG atmosphere (arc, flare, fume clusters,
 * canvas particles). The arc, its diffusion and the star field all live in
 * the video now; this component's only job is to get the right file on
 * screen safely and to never leave a blank rectangle behind.
 *
 * Two asset sets rather than one, because the composition is an arc: a
 * landscape loop letterboxed into a portrait phone would either crop the
 * arc away or distort it. Portrait phones get their own portrait cut.
 *
 * The poster is not a nicety — it is the load-bearing fallback for four
 * separate cases that all end the same way (no video): reduced motion,
 * data saver / 2G, autoplay refusal, and simply "the file has not arrived
 * yet". It sits UNDER the video permanently rather than being swapped out,
 * so none of those paths can produce an empty background.
 *
 * UI text, cards and metadata deliberately stay as HTML above this. Baking
 * copy into the loop would make it unreadable to search and impossible to
 * translate or restyle.
 */

type BackgroundSources = {
  desktopWebm: string;
  desktopMp4: string;
  desktopPoster: string;
  mobileWebm: string;
  mobileMp4: string;
  mobilePoster: string;
};

type Props = {
  sources: BackgroundSources;
  /** true on /work/films (load at once); false on the /work teaser, where
   *  it waits until the banner is near the viewport. */
  priority?: boolean;
  className?: string;
};

/**
 * useSyncExternalStore rather than useState + useEffect.
 *
 * matchMedia is an external store, and this is what that hook is for: the
 * server snapshot is `false` (no window), the client reads the real value
 * during render, and React reconciles the two without a hydration warning.
 * The setState-inside-an-effect version this replaces did the same job but
 * cost an extra render pass on every mount and is what the
 * react-hooks/set-state-in-effect rule exists to catch.
 */
function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Never changes during a session, so it subscribes to nothing. */
const noopSubscribe = () => () => {};

function connectionWantsLessData() {
  if (typeof navigator === "undefined") return false;
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  return Boolean(
    connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g",
  );
}

export default function FilmsVideoBackground({ sources, priority = true, className = "" }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const useMobileAsset = useMediaQuery("(max-width: 900px) and (orientation: portrait)");
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  const [nearViewport, setNearViewport] = useState(priority);
  // Which asset has actually produced a frame, rather than a boolean that
  // then has to be reset in an effect when the asset changes. Deriving
  // readiness from the value means rotating a phone can never leave the new
  // file faded in before it has anything to show.
  const [readyAsset, setReadyAsset] = useState<string | null>(null);
  const saveData = useSyncExternalStore(noopSubscribe, connectionWantsLessData, () => false);

  useEffect(() => {
    // No setState here when priority — the initial state is already
    // `priority`, so setting it again would only cost a render.
    if (priority) return;
    const node = hostRef.current;
    if (!node) return;
    // 350px of lead time, so the fade has started before the banner is
    // actually looked at rather than beginning as it arrives.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "350px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [priority]);

  const selected = useMemo(
    () =>
      useMobileAsset
        ? { webm: sources.mobileWebm, mp4: sources.mobileMp4, poster: sources.mobilePoster }
        : { webm: sources.desktopWebm, mp4: sources.desktopMp4, poster: sources.desktopPoster },
    [sources, useMobileAsset],
  );

  const shouldPlayVideo = nearViewport && !reducedMotion && !saveData;
  const videoReady = readyAsset === selected.webm;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onVisibility = () => {
      if (document.hidden) video.pause();
      else if (shouldPlayVideo) void video.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [shouldPlayVideo, selected.webm, selected.mp4]);

  return (
    <div
      ref={hostRef}
      className={`filmsVideoBg ${videoReady ? "is-ready" : ""} ${className}`.trim()}
      aria-hidden="true"
      style={{ "--films-bg-poster": `url("${selected.poster}")` } as CSSProperties}
    >
      <div className="filmsVideoBg__poster" />

      {shouldPlayVideo && (
        <video
          // Keyed so switching asset sets remounts the element. Changing
          // <source> children on a live <video> does nothing without an
          // explicit load(), which is a classic way to end up still playing
          // the landscape cut on a phone.
          key={useMobileAsset ? "mobile" : "desktop"}
          ref={videoRef}
          className="filmsVideoBg__video"
          autoPlay
          muted
          loop
          playsInline
          preload={priority ? "auto" : "metadata"}
          disablePictureInPicture
          controls={false}
          tabIndex={-1}
          onCanPlay={() => {
            setReadyAsset(selected.webm);
            // Belt and braces: some browsers ignore the autoplay attribute
            // but honour an explicit play() once there is data. A rejection
            // here is not an error — the poster is already showing.
            void videoRef.current?.play().catch(() => {});
          }}
        >
          <source src={selected.webm} type="video/webm" />
          <source src={selected.mp4} type="video/mp4" />
        </video>
      )}

      {/* Darkens the frame edges so the arc never fights the UI at the
          corners, and lifts contrast under the hero block specifically. */}
      <div className="filmsVideoBg__vignette" />
      <div className="filmsVideoBg__contentGuard" />
    </div>
  );
}
