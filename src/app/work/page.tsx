import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import ProjectCard from "@/components/work/ProjectCard";
import { PROJECTS } from "@/lib/work/projects";

export default function WorkPage() {
  return (
    <>
      <Nav />
      <main className="bg-ink px-6 pb-24 pt-32 sm:px-10 sm:pt-40">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-16 sm:pb-24">
          <p className="font-mono-kicker text-xs uppercase tracking-[0.3em] text-accent">[ the work ]</p>
          {/* One bold statement, not stacked headlines (AGENTS.md) — the
              subhead below is body copy, not a second display line.
              Single-keyword accent emphasis, same convention as
              Attention's "Attention" and Impact's "the mark" — not a
              flooded background, one word carrying the color. */}
          <h1 className="max-w-3xl font-display text-4xl font-bold leading-[1.05] text-chalk sm:text-6xl">
            Proof of the <span className="text-accent">noise</span> we&apos;ve broken through.
          </h1>
          <p className="max-w-xl font-body text-base leading-relaxed text-chalk-muted sm:text-lg">
            Selected work — sites, apps, and the occasional obsession, built the same way every time: for real, not
            just to launch.
          </p>
        </div>

        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2">
          {PROJECTS.map((project) => (
            <ProjectCard key={project.slug} project={project} />
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
