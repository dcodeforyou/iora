// Dev-only logo review page — never linked from the real site nav, same
// convention as the /lab scene routes (see AGENTS.md).
//
// Three full-width stripes, one per site background: black (ink),
// amber (accent), chalk white — each showing the logo in whichever
// color actually has contrast against it (chalk-on-ink, chalk-on-
// accent, ink-on-chalk). Each stripe is one flex row: A, D, then a
// wider gap, then B, C — the wider mid-gap is the only thing marking
// "these two are a pair" now, no separate half-width containers.
const STRIPES = [
  { bg: "#0b0c10", logoSuffix: "chalk" },
  { bg: "#ff4e32", logoSuffix: "chalk" },
  { bg: "#f4f4f2", logoSuffix: "ink" },
];

// Two groups, each its own little "table column": 1 = A/D, 2 = B/C.
const GROUPS = [
  { number: "1", designs: ["a", "d"] },
  { number: "2", designs: ["b", "c"] },
];

// Cache-buster — bump whenever the underlying SVGs are regenerated in
// place, since same-filename overwrites otherwise leave the browser
// serving a stale cached copy indefinitely.
const ASSET_VERSION = "5";

// Fixed box every logo renders into, regardless of its own SVG
// viewBox's aspect ratio — this is what actually keeps all 4 the same
// visual size; constraining only height (the previous attempt) still
// left wildly different widths since a/b/c/d each have a different
// intrinsic aspect ratio.
const BOX = 130;

function LogoImg({ design, suffix }: { design: string; suffix: string }) {
  return (
    <div className="flex shrink-0 items-center justify-center" style={{ width: BOX, height: BOX }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- dev-only review page, no next/image optimization needed */}
      <img
        src={`/logo/${design}-${suffix}.svg?v=${ASSET_VERSION}`}
        alt={`variant ${design}`}
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
}

export default function LogosPage() {
  return (
    <main className="flex min-h-svh w-full flex-col">
      {STRIPES.map((stripe) => (
        <section
          key={stripe.bg}
          className="flex min-h-[33.33svh] w-full flex-wrap items-center justify-center gap-x-16 gap-y-10 px-6 py-16"
          style={{ backgroundColor: stripe.bg }}
        >
          {GROUPS.map((group) => (
            <div key={group.number} className="flex items-center gap-6">
              <span
                className="font-mono text-sm opacity-40"
                style={{ color: stripe.logoSuffix === "ink" ? "#0b0c10" : "#f4f4f2" }}
              >
                {group.number}
              </span>
              <div className="flex items-center gap-x-10 gap-y-6">
                {group.designs.map((design) => (
                  <LogoImg key={design} design={design} suffix={stripe.logoSuffix} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
