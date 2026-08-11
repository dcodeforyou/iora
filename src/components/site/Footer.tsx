"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * TODO before launch: real Instagram/LinkedIn URLs (hrefs are "#"
 * placeholders below) — and swap SOCIAL_ICONS' paths for the exact SVGs
 * once shared, these are the standard/generic glyph versions in the
 * meantime, sized and colored to match this footer already.
 *
 * Mobile gets its own compact layout: Email and Menu sit side by side in
 * one row (not three stacked full-height columns — reads too tall/loose
 * at 390px), with the copyright line on its own beneath, centered, text
 * only — no "iora" heading repeating what the line already says.
 * Desktop keeps the original three-column layout.
 */
const SOCIAL_LINKS = [
  {
    label: "Instagram",
    href: "#",
    // Standard/generic Instagram glyph (camera outline + lens ring + flash
    // dot) — the widely-used simplified monoline version, not the exact
    // brand asset. currentColor fill, same as every other icon on this
    // site, so it inherits ink/accent via the wrapping link's own classes.
    path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z",
  },
  {
    label: "LinkedIn",
    href: "#",
    // Standard/generic LinkedIn "in" glyph, same caveat as Instagram above.
    path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  },
];

export default function Footer() {
  const pathname = usePathname();
  const onWorkRoute = pathname.startsWith("/work");

  return (
    <footer id="contact" data-cursor-bg="light" className="mt-8 w-full bg-chalk px-6 pb-6 pt-8 text-ink sm:px-10 sm:pb-8 sm:pt-8">
      <div className="mx-auto max-w-5xl">
        {/* Big static mark, ahead of the contact details below — variant
            A geometry this time (same shape Nav shows on hover, and
            ResolutionSection shows statically), non-interactive, same
            size/color as before. Accent/amber is safe to use this far
            into the scroll: Impact already earned the color wash long
            before Footer. Mobile-only — desktop never had this. */}
        <svg
          viewBox="6 52 1374 516"
          fill="currentColor"
          aria-hidden="true"
          className="mx-auto mb-4 block h-16 w-auto text-accent sm:hidden"
        >
          <g fillRule="evenodd">
            <path d="M64 184 H152 Q156 184 156 188 V564 Q156 568 152 568 H64 Q60 568 60 564 V188 Q60 184 64 184 Z" />
            <path d="M324 184 H564 A80 80 0 0 1 644 264 V488 A80 80 0 0 1 564 568 H324 A80 80 0 0 1 244 488 V264 A80 80 0 0 1 324 184 Z M368 272 H520 A36 36 0 0 1 556 308 V440 A36 36 0 0 1 520 476 H368 A36 36 0 0 1 332 440 V308 A36 36 0 0 1 368 272 Z" />
            <path d="M980 184 H812 A92 92 0 0 0 720 276 V568 H800 V312 A48 48 0 0 1 848 264 H984 V184 Z" />
            <path d="M1040 184 H1316 A64 64 0 0 1 1380 248 V568 H1056 A60 60 0 0 1 996 508 V384 A60 60 0 0 1 1056 324 H1288 V264 A16 16 0 0 0 1272 248 H1036 V188 Q1036 184 1040 184 Z M1104 400 H1288 V480 H1092 A8 8 0 0 1 1084 472 V428 A28 28 0 0 1 1104 400 Z" />
          </g>
          <path d="M12 52 H88 Q94 52 94 58 V130 Q94 136 88 136 H12 Q6 136 6 130 V58 Q6 52 12 52 Z" />
          <path d="M132 52 H208 Q214 52 214 58 V130 Q214 136 208 136 H132 Q126 136 126 130 V58 Q126 52 132 52 Z" />
        </svg>
      </div>
      <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:justify-between sm:gap-8">
        {/* `sm:contents` unwraps this row on desktop so Email and Menu
            become direct flex items alongside the iora column below,
            restoring the original three-column layout there without
            duplicating markup for the two breakpoints. */}
        <div className="flex justify-between gap-8 sm:contents">
          {/* mb-8 (mobile only) — SoundToggle is a fixed bottom-6 left-6
              pill on every page, and this column sits in that same
              bottom-left corner once the footer (the true end of the
              page) is scrolled into view. Without SOME clearance here the
              social icon row below sat right underneath/behind that
              floating button, confirmed directly as a real report — this
              lifts the whole column clear of it instead of guessing at a
              tighter margin on just the icons. Trimmed from mb-14 (56px)
              now that the footer's overall mobile height is intentionally
              much shorter (see ResolutionSection + the outer gap above),
              which already puts real distance between this column and the
              true viewport bottom on its own. Desktop resets to mb-0:
              this column becomes a row-aligned flex item there (via the
              sm:contents unwrap above), where a lone bottom margin would
              throw off its baseline against the Menu/iora columns next
              to it, and the row-based layout doesn't sit as close to the
              true bottom edge anyway. */}
          <div className="mb-8 flex flex-col gap-2 sm:mb-0">
            <p className="font-mono-kicker text-[11px] uppercase tracking-[0.2em] text-ink/50">Email</p>
            <a
              href="mailto:theiorateam@gmail.com"
              className="font-display text-lg font-medium text-ink transition-colors hover:text-accent sm:text-xl"
            >
              theiorateam@gmail.com
            </a>
            {/* Social row — real URLs and exact brand SVGs still pending
                (see this file's own TODO at the top); these are the
                standard/generic glyph versions in the meantime, in the
                site's own ink/accent hover language. */}
            <div className="mt-1 flex items-center gap-4">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="text-ink/50 transition-colors hover:text-accent"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-5 w-5">
                    <path d={social.path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 text-right sm:items-start sm:text-left">
            <p className="font-mono-kicker text-[11px] uppercase tracking-[0.2em] text-ink/50">Menu</p>
            <Link
              href="/work"
              // Same reasoning as Nav.tsx's own "Work" link — new tab only
              // from the main site, same-tab if this Footer is already
              // rendered on a /work page itself (it's included by both
              // work pages directly, not just the homepage).
              target={onWorkRoute ? undefined : "_blank"}
              rel={onWorkRoute ? undefined : "noopener noreferrer"}
              className="text-sm text-ink/80 transition-[color,letter-spacing] duration-300 ease-out hover:tracking-[0.05em] hover:text-accent"
            >
              Work
            </Link>
            <a
              href="https://calendly.com/dcodeforyou"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-ink/80 transition-[color,letter-spacing] duration-300 ease-out hover:tracking-[0.05em] hover:text-accent"
            >
              Book a call
            </a>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <p className="hidden font-mono-kicker text-[11px] uppercase tracking-[0.2em] text-ink/50 sm:block">
            iora
          </p>
          <p className="text-center text-xs text-ink/60 sm:text-left sm:text-sm sm:text-ink/80">
            &copy; {new Date().getFullYear()} iora.
          </p>
        </div>
      </div>
    </footer>
  );
}
