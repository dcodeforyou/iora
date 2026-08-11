import Link from "next/link";

/**
 * TODO before launch: add real social links if/when they exist — nothing
 * here should imply an established social presence that doesn't exist yet.
 *
 * Mobile gets its own compact layout: Email and Menu sit side by side in
 * one row (not three stacked full-height columns — reads too tall/loose
 * at 390px), with the copyright line on its own beneath, centered, text
 * only — no "iora" heading repeating what the line already says.
 * Desktop keeps the original three-column layout.
 */
export default function Footer() {
  return (
    <footer id="contact" data-cursor-bg="light" className="w-full bg-chalk px-6 pb-6 pt-14 text-ink sm:px-10 sm:pb-8 sm:pt-8">
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
      <div className="mx-auto flex max-w-5xl flex-col gap-8 sm:flex-row sm:justify-between">
        {/* `sm:contents` unwraps this row on desktop so Email and Menu
            become direct flex items alongside the iora column below,
            restoring the original three-column layout there without
            duplicating markup for the two breakpoints. */}
        <div className="flex justify-between gap-8 sm:contents">
          <div className="flex flex-col gap-2">
            <p className="font-mono-kicker text-[11px] uppercase tracking-[0.2em] text-ink/50">Email</p>
            <a
              href="mailto:theiorateam@gmail.com"
              className="font-display text-lg font-medium text-ink transition-colors hover:text-accent sm:text-xl"
            >
              theiorateam@gmail.com
            </a>
          </div>
          <div className="flex flex-col items-end gap-2 text-right sm:items-start sm:text-left">
            <p className="font-mono-kicker text-[11px] uppercase tracking-[0.2em] text-ink/50">Menu</p>
            <Link
              href="/work"
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
