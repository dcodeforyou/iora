import type { Metadata } from "next";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import FilmsVideoBackground from "@/components/films/FilmsVideoBackground";
import { FILMS_BG_SOURCES } from "@/lib/work/filmsBackgroundSources";
import FilmGrid from "@/components/films/FilmGrid";
import FilmsHeroEdgeMicrocopy from "@/components/films/FilmsHeroEdgeMicrocopy";

export const metadata: Metadata = {
  title: "AI Films — ïora",
  description:
    "AI commercials, brand films & cinematic walkthroughs — concepted, directed and finished by ïora.",
};

export default function FilmsIndexPage() {
  return (
    <div className="film-world">
      {/* The atmosphere is bounded to the film content, NOT wrapped around
          the footer. The footer is opaque chalk, so anything painted behind
          it is invisible work — and the particle canvas would have been
          sized to include it. */}
      <section className="relative min-h-screen overflow-hidden">
        {/* Real footage now carries the arc, flare, fumes and dust.
            priority: this IS the page, so it loads at once. */}
        <FilmsVideoBackground priority sources={FILMS_BG_SOURCES} />
        {/* Existing global nav, reused rather than reinvented — the spec is
          explicit that Films should not introduce its own header. */}
        <Nav />

        <main className="relative z-10 px-[18px] pb-24 sm:px-[22px] lg:px-[56px]">
        {/* Edge microcopy, restored. Removed in an earlier pass as
            decorative slogans, brought back as deliberate screen-edge
            annotation — see the component for why those are different
            things. Desktop only, and deliberately NOT on the compact /work
            banner, which is too short to carry it without crowding. */}
        <FilmsHeroEdgeMicrocopy />

        <header className="mx-auto flex max-w-[980px] flex-col items-center pt-[123px] text-center">
            <p className="font-mono-kicker text-[14px] uppercase tracking-[0.26em] text-[var(--film-paper-48)]">
              [ AI Films ]
            </p>
            {/* Two deliberate lines — the spec's acceptance criteria call out
              that this must not wrap to three. */}
            <h1 className="mt-6 max-w-[980px] font-display text-[clamp(40px,4.9vw,82px)] font-semibold leading-[0.96] tracking-[-0.045em] text-[var(--film-paper)]">
              Films built beyond
              <br />
              <span className="text-[var(--film-coral)]">
                the limits of a shoot.
              </span>
            </h1>
            <p className="mt-7 max-w-[760px] font-body text-[clamp(16px,1.32vw,22px)] leading-[1.35] tracking-[-0.015em] text-[var(--film-paper-78)]">
              AI commercials, brand films &amp; cinematic walkthroughs —
              concepted, directed and finished by ïora.
            </p>
          </header>

          <FilmGrid />
        </main>
      </section>
      <Footer />
    </div>
  );
}
