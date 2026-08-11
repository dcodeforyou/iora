"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { gsap } from "@/lib/scroll/gsapSetup";
import type { Project } from "@/lib/work/projects";
import { applyCardGlassFrame } from "@/lib/work/cardGlass";
import { createGrowingLens } from "@/components/pitch/liquidGlassLens";

/**
 * The grid unit for /work. Genuine chromatic-refraction glass frame (see
 * cardGlass.ts — the same real SVG feDisplacementMap technique as Pitch's
 * lens, just a static rect instead of a growing circle, so it costs one
 * canvas draw total for the whole page, not per card and not per frame).
 * Black + accent-orange, matching the site's actual palette — the
 * previous pass used none of it, which read as generic rather than this
 * studio's own.
 */
export default function ProjectCard({ project }: { project: Project }) {
  const glassRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const navigatingRef = useRef(false);

  useEffect(() => {
    const el = glassRef.current;
    if (!el) return;
    return applyCardGlassFrame(el);
  }, []);

  const href = `/work/${project.slug}`;

  // A transparent liquid-glass spread from the click point — reusing
  // Pitch's own proven `createGrowingLens` (real backdrop-filter +
  // per-channel SVG displacement, not a faked overlay) rather than
  // building a second implementation of the same thing. Navigation is
  // held until the spread has actually finished growing — firing
  // `router.push` immediately (the default for any click) would swap
  // the page before the animation had a chance to play at all, which is
  // the exact bug being avoided here.
  const handleClick = (e: React.MouseEvent) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // let the plain <Link> navigate normally
    if (navigatingRef.current) return;
    e.preventDefault();
    navigatingRef.current = true;

    const clickX = e.clientX;
    const clickY = e.clientY;

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:200;pointer-events:none;";
    const lensEl = document.createElement("div");
    lensEl.style.cssText = `position:fixed;left:${clickX}px;top:${clickY}px;transform:translate(-50%,-50%);border-radius:9999px;width:0;height:0;background:rgba(11,12,16,0.94);`;
    overlay.appendChild(lensEl);
    document.body.appendChild(overlay);

    const lens = createGrowingLens(lensEl, {
      scale: -110,
      aberration: [0, 30, 60],
      border: 0.12,
      blur: 9,
      fallbackFilter: "blur(18px)",
    });

    // Farthest viewport corner from the click point — guarantees full
    // coverage regardless of where on the card was actually clicked, not
    // just from a centered origin.
    const corners = [
      [0, 0],
      [window.innerWidth, 0],
      [0, window.innerHeight],
      [window.innerWidth, window.innerHeight],
    ];
    const maxRadius = Math.max(...corners.map(([x, y]) => Math.hypot(x - clickX, y - clickY))) + 40;

    const state = { r: 0 };
    gsap.to(state, {
      r: maxRadius,
      duration: 0.5,
      ease: "power2.inOut",
      onUpdate: () => lens.setDiameter(state.r * 2),
      onComplete: () => {
        router.push(href);
        // The overlay is appended to document.body directly (outside
        // this component's own React tree) specifically so it SURVIVES
        // the navigation — it keeps covering the screen through the
        // route swap, then fades out over the new page rather than
        // vanishing the instant the old page unmounts.
        gsap.to(lensEl, {
          opacity: 0,
          duration: 0.5,
          delay: 0.15,
          onComplete: () => {
            lens.destroy();
            overlay.remove();
          },
        });
      },
    });
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
      data-cursor="lens"
      className="group relative block overflow-hidden rounded-[2.75rem] bg-ink transition-transform duration-500 hover:-translate-y-1"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[2.75rem]">
        <Image
          src={project.cardImage}
          alt={project.title}
          fill
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
        />
        {/* Scrim exists purely so the title stays legible over whatever
            photo sits underneath — the image itself stays full strength,
            not dimmed as a substitute for it. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/95 via-ink/10 to-transparent" />

        {/* The refracting frame — thick, chromatic-fringed edges, clear
            in the middle so the title stays sharp. Sits above the image
            and scrim, below the text. */}
        <div
          ref={glassRef}
          className="pointer-events-none absolute inset-0 rounded-[2.75rem] border border-accent/25 [will-change:backdrop-filter]"
        />

        <span className="absolute right-5 top-5 rounded-full border border-accent/60 bg-ink/60 px-3 py-1 font-mono-kicker text-[10px] uppercase tracking-[0.25em] text-accent backdrop-blur-sm">
          Case Study
        </span>

        <div className="absolute inset-x-6 bottom-6 flex flex-col gap-3">
          <h3 className="font-display text-2xl font-medium leading-[1.05] text-chalk [text-shadow:0_2px_16px_rgba(11,12,16,0.8)] sm:text-3xl">
            {project.title}
          </h3>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="font-mono-kicker text-[11px] uppercase tracking-[0.2em] text-chalk-muted transition-colors duration-300 group-hover:text-accent"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
}
