import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import FilmsVideoBackground from "@/components/films/FilmsVideoBackground";
import { FILMS_BG_SOURCES } from "@/lib/work/filmsBackgroundSources";
import FilmPlayer from "@/components/films/FilmPlayer";
import { RESOLVED_FILMS as FILMS, getFilm } from "@/lib/work/films";

export function generateStaticParams() {
  return FILMS.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/work/films/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const film = getFilm(slug);
  if (!film) return {};
  // Format titles are predictable by design, which means two films can
  // legitimately share one. The creative name is what keeps browser tabs
  // and search results telling them apart.
  const name = film.creativeTitle ? `${film.title} — ${film.creativeTitle}` : film.title;
  return {
    title: `${name} — AI Films — ïora`,
    description: film.subtitle,
  };
}

export default async function FilmDetailPage({
  params,
}: PageProps<"/work/films/[slug]">) {
  const { slug } = await params;
  const film = getFilm(slug);
  if (!film) notFound();

  // Wraps around, so the last film still offers somewhere to go.
  const next =
    FILMS[(FILMS.findIndex((f) => f.slug === film.slug) + 1) % FILMS.length];
  const meta = [
    { label: "Type", value: film.type },
    { label: "Runtime", value: film.durationLabel },
    { label: "Role", value: film.role },
    { label: "Goal", value: film.goal },
  ];

  return (
    <div className="film-world">
      <section className="relative overflow-hidden pb-28">
        {/* Quieter than the index on purpose: the film has to be the
            brightest object on this page, not the background. */}
        {/* Same world, held back with the banner damping so the film
            itself stays the brightest thing on a detail page. */}
        <FilmsVideoBackground priority sources={FILMS_BG_SOURCES} className="filmsVideoBg--banner" />
        <Nav />

        <main className="relative z-10 px-[18px] pt-[120px] sm:px-[22px] lg:px-[56px]">
          <header className="mx-auto flex max-w-[980px] flex-col items-center text-center">
            <p className="font-mono-kicker text-[11px] uppercase tracking-[0.22em] text-[var(--film-paper-48)]">
              [ AI Films / {film.type} ]
            </p>
            <h1 className="mt-5 font-display text-[clamp(38px,4.7vw,80px)] font-semibold leading-[0.98] tracking-[-0.04em] text-[var(--film-paper)]">
              {film.title.replace(film.titleAccent, "").trim()}{" "}
              <span className="text-[var(--film-coral)]">
                {film.titleAccent}
              </span>
            </h1>
            <p className="mt-5 max-w-[720px] font-body text-[clamp(16px,1.3vw,22px)] leading-[1.35] text-[var(--film-paper-78)]">
              {film.subtitle}
            </p>
            {/* The campaign name, demoted to a secondary line. It still
                carries the creative idea — it just no longer has to do the
                job of telling a visitor what they are looking at. */}
            {film.creativeTitle && (
              <p className="mt-4 font-mono-kicker text-[12px] uppercase tracking-[0.24em] text-[var(--film-paper-58)]">
                &ldquo;{film.creativeTitle}&rdquo;
              </p>
            )}
            {/* Only ever rendered when the name was actually confirmed.
                A commissioned film whose client has not been named to us
                shows nothing here rather than a placeholder — the absence
                is honest, an invented name would not be. */}
            {film.client && film.clientNameVerified && (
              <p className="mt-6 font-mono-kicker text-[11px] uppercase tracking-[0.22em] text-[var(--film-paper-48)]">
                For {film.client}
              </p>
            )}
          </header>

          <FilmPlayer film={film} />

          {/* Same total width as the player so the two read as one block. */}
          <div className="mx-auto mt-3 grid w-[min(1240px,calc(100vw-36px))] grid-cols-1 gap-3 sm:w-[min(1240px,calc(100vw-44px))] sm:grid-cols-2 lg:w-[min(1240px,calc(100vw-112px))] lg:grid-cols-4">
            {meta.map((m) => (
              <div
                key={m.label}
                className="flex min-h-[90px] flex-col gap-2 rounded-[14px] border border-[var(--film-line)] bg-[var(--film-glass)] p-4"
              >
                <p className="font-mono-kicker text-[10px] uppercase tracking-[0.22em] text-[var(--film-paper-48)]">
                  {m.label}
                </p>
                <p className="font-body text-[14px] leading-[1.4] text-[var(--film-paper)]">
                  {m.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mx-auto mt-20 grid w-[min(1240px,calc(100vw-36px))] grid-cols-1 gap-10 sm:w-[min(1240px,calc(100vw-44px))] lg:w-[min(1240px,calc(100vw-112px))] lg:grid-cols-[minmax(0,.9fr)_minmax(0,1fr)_minmax(0,.9fr)] lg:gap-12">
            <h2 className="font-display text-[clamp(26px,2.5vw,38px)] font-semibold leading-[1.1] tracking-[-0.03em] text-[var(--film-paper)]">
              {film.statement[0]}
              <br />
              <span className="text-[var(--film-coral)]">
                {film.statement[1]}
              </span>
            </h2>
            <div className="flex max-w-[48ch] flex-col gap-5">
              {film.body.map((p, i) => (
                <p
                  key={i}
                  className="font-body text-[15px] leading-[1.55] text-[var(--film-paper-78)] sm:text-[16px]"
                >
                  {p}
                </p>
              ))}
            </div>
            <div className="flex flex-col gap-[10px]">
              {film.gallery.map((frame, i) => (
                <div
                  key={i}
                  className="relative aspect-[16/10] w-full overflow-hidden rounded-[10px] border border-[var(--film-line)]"
                >
                  <Image
                    src={frame.src}
                    alt={`${film.title} — ${frame.purpose}`}
                    fill
                    sizes="(max-width: 1099px) 100vw, 340px"
                    className="object-cover"
                  />
                </div>
              ))}
              <p className="mt-1 text-center font-mono-kicker text-[10px] uppercase tracking-[0.22em] text-[var(--film-paper-48)]">
                01 / {String(film.gallery.length).padStart(2, "0")}
              </p>
            </div>
          </div>

          {/* A next film, not a services pitch. */}
          <div className="mx-auto mt-24 flex w-[min(1240px,calc(100vw-36px))] justify-center sm:w-[min(1240px,calc(100vw-44px))] lg:w-[min(1240px,calc(100vw-112px))]">
            <Link
              href={`/work/films/${next.slug}`}
              className="group flex items-center gap-4 rounded-[var(--film-radius-pill)] border border-[var(--film-line)] px-7 py-4 font-mono-kicker text-[11px] uppercase tracking-[0.22em] text-[var(--film-paper-78)] transition-colors duration-[280ms] hover:border-[rgba(255,126,91,.5)] hover:text-[var(--film-coral)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--film-coral)]"
            >
              Next film — {next.title}
              <span
                aria-hidden="true"
                className="transition-transform duration-[280ms] group-hover:translate-x-1"
              >
                →
              </span>
            </Link>
          </div>
        </main>
      </section>
      <Footer />
    </div>
  );
}
