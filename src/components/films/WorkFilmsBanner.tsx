import Link from "next/link";
import Image from "next/image";
import FilmsVideoBackground from "./FilmsVideoBackground";
import { FILMS_BG_SOURCES } from "@/lib/work/filmsBackgroundSources";
import { RESOLVED_FILMS } from "@/lib/work/films";

/*
  The films stylesheet travels with this component rather than being added
  to the root layout, so /work picks it up only because the banner is on
  it. Every selector inside is `.film-*`-namespaced, so the existing Work
  page keeps its own tokens and presentation untouched.
*/
import "@/styles/film-world.css";

/**
 * The /work → /work/films chapter transition.
 *
 * Position and scale both corrected. It now sits between the Work intro
 * copy and the existing website grid, not after the cards near the footer:
 * as a gateway it has to be seen on the way in, and buried at the bottom
 * it was something you reached only after the page had already ended.
 *
 * Height came down hard — from a 520px hero-sized block to a
 * clamp(320px, 25vw, 390px) strip. At the old size it read as a second
 * hero competing with the Work page's own, which is the opposite of a
 * transition. It should feel like a wide cinematic band you pass through.
 *
 * Poster-only previews here. Three thumbnails of stepped cards on a page
 * that already carries its own project imagery is not worth a single
 * autoplaying video, and the spec is explicit that nothing previews before
 * a deliberate hover on a pointer device.
 */
export default function WorkFilmsBanner() {
  // The negative top margin is deliberate and is the least invasive way to
  // hit the required rhythm. The Work intro block above carries pb-16/pb-24
  // (64/96px) of its own, which was sized when the card grid followed it
  // directly; with the banner inserted that reads as dead air — reported as
  // "large empty area, banner, another awkward gap". Pulling back 24/56px
  // lands the gap at 40px above, with 52px below.
  //
  // 40, not the stated preferred 36, because the brief's own numbers do not
  // reconcile: it asks for ~36 above, ~52 below, AND a below:above ratio of
  // 1.15-1.35 — but 52/36 is 1.44. 40/52 sits inside all three ranges
  // (32-44, 44-60, ratio 1.30), so it satisfies every constraint rather
  // than hitting two preferred numbers and breaking the third.
  //
  // Done here rather than by editing the intro block's padding, because
  // that block is existing site code and its spacing is not this
  // component's to change.
  const previews = RESOLVED_FILMS.slice(0, 3);

  return (
    <section className="film-world mx-auto -mt-6 mb-[52px] w-full max-w-[1530px] px-6 sm:-mt-[56px] sm:px-10">
      <Link
        href="/work/films"
        aria-label="Explore AI Films"
        className="film-banner-glow group relative block h-[clamp(320px,25vw,390px)] overflow-hidden rounded-[20px] border border-[rgba(255,90,60,.38)] bg-[var(--film-bg)] transition-colors duration-[280ms] hover:border-[rgba(255,126,91,.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--film-coral)] sm:rounded-[28px]"
      >
        {/* Lazy: the teaser sits below the fold on /work, so the loop
            waits until the banner is within 350px of the viewport. */}
        <FilmsVideoBackground priority={false} className="filmsVideoBg--banner" sources={FILMS_BG_SOURCES} />

        <div className="relative z-10 grid h-full grid-cols-1 items-center gap-8 p-7 sm:p-9 lg:grid-cols-[minmax(0,0.46fr)_minmax(0,0.54fr)] lg:p-10">
          <div className="flex flex-col items-start">
            <p className="font-mono-kicker text-[12px] uppercase tracking-[0.26em] text-[var(--film-paper-48)]">
              [ AI Films ]
            </p>
            <h2 className="mt-4 max-w-[16ch] font-display text-[clamp(26px,2.6vw,40px)] font-semibold leading-[1.02] tracking-[-0.04em] text-[var(--film-paper)]">
              Films built beyond the limits of a shoot.
            </h2>
            <p className="mt-3 max-w-[44ch] font-body text-[14px] leading-[1.45] text-[var(--film-paper-78)] sm:text-[15px]">
              AI commercials, brand films &amp; cinematic walkthroughs — concepted, directed and finished by ïora.
            </p>
            {/* Styled as a control but rendered as a span: the whole banner
                is already one link, and nesting a second interactive
                element inside it would be invalid and give keyboard users
                two stops for one destination. */}
            <span className="mt-6 inline-flex items-center gap-3 rounded-[var(--film-radius-pill)] border border-[rgba(255,90,60,.72)] bg-[rgba(255,90,60,.07)] px-6 py-[12px] font-mono-kicker text-[11px] uppercase tracking-[0.2em] text-[var(--film-paper)] transition-colors duration-[280ms] group-hover:bg-[rgba(255,90,60,.14)]">
              Explore AI Films
              <span aria-hidden="true" className="transition-transform duration-[280ms] group-hover:translate-x-1">
                →
              </span>
            </span>
          </div>

          {/* Stepped, overlapping thumbnails — a stack of films rather than
              a tidy row, which is what signals "there is more inside". */}
          {/* overflow-hidden and PERCENTAGE offsets, both load-bearing.
              Fixed pixel offsets (0 / 300 / 560) were wider than this grid
              cell at anything under ~1500px, so the back cards escaped the
              column and sat on top of the headline and body copy —
              caught on screen, not in the markup. Percentages scale with
              the cell, and the clip guarantees nothing can cross into the
              text column even if a future width proves them wrong. */}
          <div aria-hidden="true" className="relative hidden h-full overflow-hidden lg:block">
            {previews.map((film, i) => (
              <div
                key={film.slug}
                className="absolute top-1/2 aspect-video overflow-hidden rounded-[14px] border border-[var(--film-line)] shadow-[0_20px_60px_rgba(0,0,0,.42)]"
                style={{
                  width: i === 0 ? "min(390px, 62%)" : "min(300px, 48%)",
                  right: i === 0 ? 0 : i === 1 ? "26%" : "48%",
                  transform: `translateY(-50%) translateY(${i === 0 ? 0 : i === 1 ? -18 : -34}px)`,
                  zIndex: 3 - i,
                  opacity: i === 0 ? 1 : i === 1 ? 0.7 : 0.42,
                }}
              >
                <Image
                  src={film.poster}
                  alt=""
                  fill
                  sizes="390px"
                  className="object-cover transition-transform duration-700 ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.02]"
                />
              </div>
            ))}
          </div>
        </div>
      </Link>
    </section>
  );
}
