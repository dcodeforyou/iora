import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import ScrollReveal from "@/components/work/ScrollReveal";
import { PROJECTS, getProject } from "@/lib/work/projects";

export function generateStaticParams() {
  return PROJECTS.map((p) => ({ slug: p.slug }));
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();

  const currentIndex = PROJECTS.findIndex((p) => p.slug === slug);
  const next = PROJECTS[(currentIndex + 1) % PROJECTS.length];

  return (
    <>
      <Nav />
      <main className="bg-ink px-6 pb-24 pt-32 sm:px-10 sm:pt-40">
        {/* Hero + structured meta block — noomo's own layout (CLIENT/
            DELIVERABLES, INVOLVEMENT, RESULTS as three real columns, not
            prose paragraphs stacked randomly), studied directly off their
            live project pages rather than guessed. */}
        {/* Grid, not flex — this wraps a ScrollReveal block below, and a
            flex ancestor of a `pin: true` section corrupts the
            pin-spacer's computed height (see AGENTS.md). `justify-items-
            center` + `text-center` gets the same centered read every
            homepage section uses (Attention/Impact: `items-center
            justify-center text-center` — read directly off those files,
            not touched) without needing flex here. */}
        <div className="mx-auto grid max-w-6xl grid-cols-1 justify-items-center gap-10 pb-16 text-center sm:pb-24">
          {/* The category/back-to-index nav — top-left, deliberately NOT
              centered with the rest (a breadcrumb reads as UI chrome, not
              part of the statement below it). */}
          <Link
            href="/work"
            className="self-start justify-self-start font-mono-kicker text-xs uppercase tracking-[0.3em] text-chalk-muted transition-[color,letter-spacing] duration-300 ease-out hover:tracking-[0.45em] hover:text-accent"
          >
            ← Work
          </Link>

          <div className="flex flex-col items-center gap-4">
            <p className="font-mono-kicker text-xs uppercase tracking-[0.3em] text-accent">[ case study ]</p>
            <h1 className="max-w-4xl font-display text-4xl font-bold leading-[1.05] text-chalk sm:text-6xl">
              {project.title}
            </h1>
          </div>

          <ScrollReveal className="grid w-full grid-cols-1 gap-x-10 gap-y-8 border-t border-chalk/10 pt-8 text-left sm:grid-cols-3">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <p className="font-mono-kicker text-[11px] uppercase tracking-[0.25em] text-chalk-muted">Client</p>
                <p className="font-body text-base text-chalk">{project.client}</p>
              </div>
              <div className="flex flex-col gap-2">
                <p className="font-mono-kicker text-[11px] uppercase tracking-[0.25em] text-chalk-muted">
                  Deliverables
                </p>
                <p className="font-body text-base text-chalk">{project.deliverables.join(", ")}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="font-mono-kicker text-[11px] uppercase tracking-[0.25em] text-chalk-muted">
                Involvement
              </p>
              <ul className="flex flex-col gap-1">
                {project.involvement.map((item) => (
                  <li key={item} className="font-body text-base text-chalk">
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-2">
              <p className="font-mono-kicker text-[11px] uppercase tracking-[0.25em] text-chalk-muted">Results</p>
              <p className="font-body text-base leading-relaxed text-chalk-muted">{project.results}</p>
            </div>
          </ScrollReveal>
        </div>

        {/* Challenge + Approach — the deeper narrative noomo's own case
            studies carry beyond the meta grid (their "MORE INFO"
            section: a challenge/context block, then a design-principles
            block). Optional — dedic.to ships without these rather than
            inventing them (see the TODO on that project's own entry). */}
        {(project.challenge || project.approach) && (
          <div className="mx-auto flex max-w-3xl flex-col gap-16 py-16 sm:gap-20 sm:py-24">
            {project.challenge && (
              <ScrollReveal className="flex flex-col gap-5">
                <h2 className="font-display text-2xl font-semibold leading-[1.15] text-chalk sm:text-3xl">
                  {project.challenge.heading}
                </h2>
                {project.challenge.paragraphs.map((p, i) => (
                  <p key={i} className="font-body text-base leading-relaxed text-chalk-muted sm:text-lg">
                    {p}
                  </p>
                ))}
              </ScrollReveal>
            )}
            {project.approach && (
              <ScrollReveal className="flex flex-col gap-5">
                <h2 className="font-display text-2xl font-semibold leading-[1.15] text-chalk sm:text-3xl">
                  {project.approach.heading}
                </h2>
                {project.approach.paragraphs.map((p, i) => (
                  <p key={i} className="font-body text-base leading-relaxed text-chalk-muted sm:text-lg">
                    {p}
                  </p>
                ))}
                {project.approach.bullets && (
                  <ul className="mt-2 flex flex-col gap-3 border-t border-chalk/10 pt-6">
                    {project.approach.bullets.map((b, i) => (
                      <li key={i} className="flex gap-3 font-body text-base leading-relaxed text-chalk-muted">
                        <span aria-hidden="true" className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-accent" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollReveal>
            )}
          </div>
        )}

        {/* Media sections — deliberately the least spectacle-heavy part
            of the whole site: the shard/glass motif is this studio's own
            signature, not something to layer onto a client's actual
            work. Plain, editorial, full-bleed — but each block still
            gets its own rise-in/recede scroll choreography (studied off
            noomo's own case-study pages), not a static stack; that
            motion is the point, not an extra flourish on top of it. */}
        {/* Grid, not flex — same pin-spacer reason as above; each child
            here is its own ScrollReveal pin. */}
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-16 sm:gap-24">
          {project.gallery.map((block, i) => (
            <ScrollReveal key={i}>
              {block.type === "image" ? (
                // Non-`fill` Image with the file's REAL intrinsic
                // width/height — renders a plain <img>, so the browser's
                // native max-width/max-height + height:auto sizing fits
                // it within the column and the 85vh cap while preserving
                // its own true aspect ratio. Rounded corners sit directly
                // on the image itself rather than a separate wrapper box,
                // so there's no container whose computed size can drift
                // from the image's actual rendered size — that mismatch
                // was the earlier version's grey letterboxing bug (a
                // `fill` image inside a box capped by maxHeight alone,
                // where the box's own aspect ratio stopped matching the
                // photo's once the cap kicked in).
                <Image
                  src={block.src}
                  alt={block.alt}
                  width={block.width}
                  height={block.height}
                  sizes="(min-width: 1024px) 1152px, 100vw"
                  className="mx-auto block h-auto max-h-[85vh] w-auto max-w-full rounded-[2rem] object-contain"
                />
              ) : (
                <video
                  src={block.src}
                  poster={block.poster}
                  controls
                  className="w-full rounded-[2rem] bg-ink-soft"
                />
              )}
            </ScrollReveal>
          ))}
        </div>

        {/* Named feature/chapter breakdowns — noomo's own "PATIENT
            PORTAL:", "PHYSICIAN PORTAL:" pattern: one heading + prose +
            a highlights list per distinct mechanism, not one
            undifferentiated paragraph about "the build." */}
        {project.deepDives && project.deepDives.length > 0 && (
          <div className="mx-auto flex max-w-3xl flex-col gap-16 py-16 sm:gap-20 sm:py-24">
            {project.deepDives.map((block, i) => (
              <ScrollReveal key={i} className="flex flex-col gap-5">
                <h2 className="font-display text-2xl font-semibold leading-[1.15] text-chalk sm:text-3xl">{block.heading}</h2>
                {block.paragraphs.map((p, j) => (
                  <p key={j} className="font-body text-base leading-relaxed text-chalk-muted sm:text-lg">
                    {p}
                  </p>
                ))}
                {block.bullets && (
                  <ul className="mt-2 flex flex-col gap-3 border-t border-chalk/10 pt-6">
                    {block.bullets.map((b, j) => (
                      <li key={j} className="flex gap-3 font-body text-base leading-relaxed text-chalk-muted">
                        <span aria-hidden="true" className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-accent" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollReveal>
            ))}
          </div>
        )}

        {/* Impact — noomo's own structured outcome-bullet close, each a
            short heading + one sentence, not a paragraph of vague
            marketing praise. */}
        {project.impact && project.impact.length > 0 && (
          <ScrollReveal className="mx-auto max-w-5xl border-t border-chalk/10 pt-16 sm:pt-20">
            <p className="mb-8 font-mono-kicker text-xs uppercase tracking-[0.3em] text-accent">[ the impact ]</p>
            <div className="grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-3">
              {project.impact.map((point, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <h3 className="font-display text-lg font-medium leading-snug text-chalk">{point.heading}</h3>
                  <p className="font-body text-sm leading-relaxed text-chalk-muted">{point.body}</p>
                </div>
              ))}
            </div>
          </ScrollReveal>
        )}

        {/* Next project — keeps the case-study sequence going rather
            than dead-ending back at the index every time. */}
        <ScrollReveal className="mx-auto mt-24 flex max-w-6xl flex-col gap-6 border-t border-chalk/10 pt-10 sm:mt-32">
          <p className="font-mono-kicker text-xs uppercase tracking-[0.3em] text-chalk-muted">[ next ]</p>
          <Link
            href={`/work/${next.slug}`}
            className="group flex items-baseline justify-between gap-6 font-display text-3xl font-semibold text-chalk transition-colors hover:text-accent sm:text-5xl"
          >
            <span>{next.title}</span>
            <span className="font-mono-kicker text-base transition-transform group-hover:translate-x-2">→</span>
          </Link>
        </ScrollReveal>
      </main>
      <Footer />
    </>
  );
}
