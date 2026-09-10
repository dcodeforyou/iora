"use client";

import { useMemo, useState } from "react";
import { RESOLVED_FILMS, FILM_TAGS, type FilmTag } from "@/lib/work/films";
import FilmCard from "./FilmCard";

/**
 * Filter bar + grid.
 *
 * "All" is a UI state, never a stored tag — so a film can never be
 * mislabelled and the tag union stays the single source of truth. A film
 * with two tags appears under both tabs from ONE record; filtering never
 * duplicates or re-ranks, it only hides.
 *
 * Filtering is local state, not navigation: changing a tab should not push
 * a history entry the back button then has to walk through.
 */

const FILTERS: readonly (FilmTag | "All")[] = ["All", ...FILM_TAGS];

export default function FilmGrid() {
  const [filter, setFilter] = useState<FilmTag | "All">("All");
  const visible = useMemo(
    () =>
      filter === "All"
        ? RESOLVED_FILMS
        : RESOLVED_FILMS.filter((f) => f.tags.includes(filter)),
    [filter],
  );

  return (
    <>
      {/* Horizontal scroll rather than wrapping below tablet — the spec is
          explicit that pill text must never squish, and a second pill row
          pushes the cards off a short viewport. */}
      <nav
        aria-label="Filter films"
        className="film-filters -mx-[18px] mt-10 flex gap-3 overflow-x-auto px-[18px] [scrollbar-width:none] sm:-mx-[22px] sm:px-[22px] lg:mx-0 lg:justify-center lg:overflow-visible lg:px-0"
      >
        {FILTERS.map((item) => {
          const active = filter === item;
          return (
            <button
              key={item}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(item)}
              className={[
                "h-10 shrink-0 whitespace-nowrap rounded-[var(--film-radius-pill)] border px-[18px] font-mono-kicker text-[11px] uppercase tracking-[0.18em] transition-colors duration-[240ms]",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--film-coral)]",
                item === "All" ? "min-w-[84px]" : "",
                active
                  ? // Active state is never colour alone: border weight and
                    // fill change too, so it survives a colour-blind read.
                    "border-[rgba(255,90,60,.72)] bg-[rgba(255,90,60,.07)] text-[var(--film-paper)] shadow-[0_0_18px_rgba(255,90,60,.12)]"
                  : "border-[rgba(255,255,255,.14)] bg-[rgba(255,255,255,.02)] text-[var(--film-paper-58)] hover:text-[var(--film-paper)]",
              ].join(" ")}
            >
              {item}
            </button>
          );
        })}
      </nav>

      {/* Column counts come from the spec's own breakpoints (768 / 1100 /
          1440), not Tailwind's defaults. Using xl/2xl here was wrong by a
          whole column: at 1135px it rendered 2 where the spec calls for 3,
          because Tailwind's xl is 1280. Written as arbitrary min-widths so
          the numbers in the class match the numbers in the spec. */}
      {/* Column counts live in film-world.css, not in utilities here.
          Tailwind's breakpoints are the wrong numbers (xl is 1280; the spec
          wants 1100), and the arbitrary `min-[1100px]:` form silently loses:
          Tailwind sorts arbitrary variants BEFORE named ones, so
          `md:grid-cols-2` landed later in the sheet and won at every width
          above 1100 — measured as 2 columns at 1251px where the spec calls
          for 3. Equal specificity, source order decides. Explicit media
          queries keep the spec's numbers literal and beyond a sorter's
          reach. */}
      <div className="films-grid mt-5">
        {visible.map((film) => (
          // Key by slug so React moves existing cards rather than
          // rebuilding them when the filter changes — which is what keeps
          // the poster from flashing on every tab switch.
          <FilmCard key={film.slug} film={film} />
        ))}
      </div>
    </>
  );
}
