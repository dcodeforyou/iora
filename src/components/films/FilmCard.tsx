"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useRef } from "react";
import type { ResolvedFilm } from "@/lib/work/films";

/**
 * One film in the grid.
 *
 * The whole card is a single <a>, not a div with onClick and a nested
 * button. The play circle is deliberately decorative (aria-hidden): adding
 * a second interactive layer inside a link that already navigates gives
 * keyboard users two stops for one destination and screen readers an
 * unlabelled control.
 *
 * Preview video is an enhancement that never affects layout. The poster is
 * always rendered and always sized; the clip's `src` is attached only on
 * pointer enter, and only on devices that qualify. That ordering matters —
 * `preload="none"` alone still lets the browser fetch once a src exists,
 * so withholding the src is the actual guarantee that four cards do not
 * quietly pull four videos on page load.
 */

// Module-scoped so it is shared across every card: starting one preview
// stops whichever was playing. Without this, moving quickly across a row
// leaves several videos decoding at once.
let currentPreview: HTMLVideoElement | null = null;

export default function FilmCard({ film }: { film: ResolvedFilm }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const canPreview = useCallback(() => {
    if (typeof window === "undefined") return false;
    // Touch devices never hover-preview; reduced-motion users never get
    // unrequested playback.
    return (
      !window.matchMedia("(pointer: coarse)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  const onEnter = useCallback(() => {
    const v = videoRef.current;
    if (!v || !film.preview || !canPreview()) return;
    if (currentPreview && currentPreview !== v) {
      currentPreview.pause();
      currentPreview.currentTime = 0;
    }
    if (!v.src) v.src = film.preview;
    currentPreview = v;
    void v.play().catch(() => {
      // Autoplay refusal is not an error worth surfacing — the poster is
      // already showing and the card is still fully usable.
    });
  }, [film.preview, canPreview]);

  const onLeave = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
    if (currentPreview === v) currentPreview = null;
  }, []);

  return (
    <Link
      href={`/work/films/${film.slug}`}
      className="film-card group relative flex flex-col rounded-[var(--film-radius-card)] border border-[var(--film-line)] bg-[var(--film-glass)] p-3 shadow-[0_20px_60px_rgba(0,0,0,.28),inset_0_1px_rgba(255,255,255,.04)] transition-[border-color,transform,box-shadow] duration-[280ms] ease-out hover:-translate-y-[3px] hover:border-[rgba(255,126,91,.34)] hover:shadow-[0_26px_72px_rgba(0,0,0,.34),0_0_26px_rgba(255,90,60,.055)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--film-coral)]"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="film-card__media relative aspect-video w-full overflow-hidden rounded-[var(--film-radius-media)] bg-black">
        <Image
          src={film.poster}
          alt=""
          fill
          sizes="(max-width: 767px) 92vw, (max-width: 1099px) 46vw, (max-width: 1439px) 31vw, 378px"
          className="object-cover transition-transform duration-700 ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.018]"
        />
        {film.preview && (
          <video
            ref={videoRef}
            muted
            playsInline
            loop
            preload="none"
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
        )}
        {/* Decorative: the card itself is the link. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 flex h-[48px] w-[48px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[rgba(255,255,255,.45)] bg-[rgba(8,8,10,.20)] backdrop-blur-[4px] transition-[background-color,border-color,transform] duration-[280ms] group-hover:scale-[1.04] group-hover:border-[rgba(255,255,255,.75)] group-hover:bg-[rgba(8,8,10,.30)] sm:h-[50px] sm:w-[50px] lg:h-[54px] lg:w-[54px]"
        >
          {/* Nudged +2px right: a triangle's optical centre is not its
              bounding box centre. */}
          <svg
            viewBox="0 0 14 16"
            width="14"
            height="16"
            className="ml-[2px] fill-white"
          >
            <path d="M0 0l14 8-14 8z" />
          </svg>
        </span>
        {/* Badge only for self-initiated work. Commissioned films get no
            badge at all rather than a "client" one — labelling real work as
            client work on every card reads as protesting too much, and the
            absence of SPEC already carries the meaning. */}
        {film.status === "spec" && (
          <span className="absolute left-3 top-3 rounded-full border border-[var(--film-line-strong)] bg-[rgba(8,8,10,.55)] px-2 py-[3px] font-mono-kicker text-[9px] uppercase tracking-[0.2em] text-[var(--film-paper-78)] backdrop-blur-[4px]">
            Spec
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-[7px] px-1 pb-[14px] pt-3">
        <p className="font-mono-kicker text-[10.5px] uppercase tracking-[0.17em] text-[rgba(243,241,237,.72)]">
          {film.metaLine}
        </p>
        <h3 className="font-display text-[20px] font-medium leading-[1.08] tracking-[-0.02em] text-[var(--film-paper)]">
          {film.title}
        </h3>
        <p className="font-mono-kicker text-[10.5px] uppercase tracking-[0.2em] text-[var(--film-paper-58)]">
          {film.subtitle}
        </p>
        <span
          aria-hidden="true"
          className="mt-auto flex h-9 w-9 items-center justify-center self-end rounded-full border border-[var(--film-line)] text-[var(--film-paper-78)] transition-colors duration-[280ms] group-hover:border-[rgba(255,126,91,.5)] group-hover:text-[var(--film-coral)]"
        >
          <svg
            viewBox="0 0 14 14"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          >
            <path d="M2 7h10M8 3l4 4-4 4" />
          </svg>
        </span>
      </div>
    </Link>
  );
}
