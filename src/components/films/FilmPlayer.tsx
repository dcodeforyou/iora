"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import type { ResolvedFilm } from "@/lib/work/films";

/**
 * The detail-page player.
 *
 * Sized from the film's REAL dimensions, never from a fixed shell. The
 * previous version used a `clamp(360px, 43vh, 410px)` letterbox with
 * `object-fit: cover`, which is fine for the one 1920x1080 film and quietly
 * destroys the other three: they are 834x1112 portrait, so a wide fixed
 * shell was cropping the top and bottom off every frame.
 *
 * Two width constraints, both load-bearing:
 *   - `min(100%, 1240px)` keeps it inside the content column;
 *   - `calc(78vh * ratio)` is what makes a TALL film shrink its WIDTH
 *     rather than run off the screen. A plain `max-height` would clamp the
 *     height while the width stayed put, which breaks the ratio and
 *     letterboxes the film inside its own shell.
 *
 * `object-fit: contain` on top of that is belt and braces: if a source ever
 * disagrees with its probed metadata, the frame is shown whole rather than
 * cropped.
 */
export default function FilmPlayer({ film }: { film: ResolvedFilm }) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const start = () => {
    setPlaying(true);
    requestAnimationFrame(() => void videoRef.current?.play().catch(() => {}));
  };

  return (
    <div
      className="film-player-shell relative mx-auto mt-6 overflow-hidden rounded-[16px] border border-[rgba(255,255,255,.12)] bg-[#050609] shadow-[0_30px_90px_rgba(0,0,0,.38),inset_0_1px_0_rgba(255,255,255,.035)] sm:rounded-[22px]"
      style={{
        aspectRatio: `${film.width} / ${film.height}`,
        width: "min(100%, 1240px)",
        maxWidth: `min(1240px, calc(78vh * ${film.aspectRatio}))`,
      }}
    >
      {!playing ? (
        <>
          <Image
            src={film.poster}
            alt={`${film.title} — poster frame`}
            fill
            sizes="(max-width: 1099px) 100vw, 1240px"
            priority
            className="object-contain"
          />
          <button
            type="button"
            onClick={start}
            aria-label={`Play ${film.title} (${film.durationLabel})`}
            className="absolute inset-0 flex items-center justify-center focus-visible:outline focus-visible:-outline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--film-coral)]"
          >
            <span className="flex h-[64px] w-[64px] items-center justify-center rounded-full border border-[rgba(255,255,255,.5)] bg-[rgba(8,8,10,.28)] backdrop-blur-[4px] transition-transform duration-[280ms] hover:scale-[1.04]">
              <svg viewBox="0 0 14 16" width="18" height="20" className="ml-[3px] fill-white">
                <path d="M0 0l14 8-14 8z" />
              </svg>
            </span>
          </button>
          {/* Overlay labels sit on the poster only — once the film runs they
              would be covering it. Every value here is real: the duration
              comes from the file itself, not from a typed string. */}
          <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-[3px] font-mono-kicker text-[10px] uppercase tracking-[0.2em] text-[var(--film-paper-78)]">
            {/* Deliberately NOT the h1 again. With predictable format
                titles, repeating "Automotive Restoration Film" above
                "Restoration Film" says the same thing twice — so the
                overlay carries what the heading does not: the campaign
                name and the client. */}
            <span>{film.creativeTitle ?? film.title}</span>
            <span>{film.client ?? film.type}</span>
            <span>
              {film.durationLabel} · {film.status === "spec" ? "Spec" : film.year}
            </span>
          </div>
        </>
      ) : (
        <video
          ref={videoRef}
          src={film.videoSrc}
          poster={film.poster}
          controls
          playsInline
          preload="metadata"
          className="block h-full w-full bg-[#050609] object-contain"
        />
      )}
    </div>
  );
}
