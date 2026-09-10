/**
 * Screen-edge microcopy for the /work/films hero.
 *
 * These three groups were removed in an earlier pass and are being brought
 * back deliberately. The distinction that matters: what was wrong before
 * was decorative text scattered *into* the composition; this is edge
 * annotation that frames it. Same words, different job — so they sit hard
 * against the screen edges, outside the reading column, at the eyebrow's
 * type scale rather than the headline's.
 *
 * Positioned against a wrapper pinned to ONE viewport height rather than
 * to the section, which grows with the card grid. Percentages against the
 * section would put "67%" somewhere down among the cards; against the hero
 * viewport they land where the reference composition puts them.
 *
 * Never animated independently — no drift, no parallax, no repeated fade.
 * They are editorial marks on the frame, and anything moving here would
 * turn them back into the decoration they were removed for being.
 *
 * Desktop only: below 1024px the edges belong to the content, and these
 * would either collide with it or be squeezed into nonsense.
 */

const GROUPS = [
  { key: "left", lines: ["Ideas", "That", "Move", "People."] },
  { key: "rightTop", lines: ["More", "Than", "A Film."] },
  { key: "rightLower", lines: ["Beauty", "Builds", "Belonging."] },
] as const;

export default function FilmsHeroEdgeMicrocopy() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 z-[2] hidden h-screen select-none lg:block"
    >
      {GROUPS.map((g) => (
        <p
          key={g.key}
          className={[
            "absolute -translate-y-1/2 font-mono-kicker text-[11px] font-medium uppercase leading-[1.3] tracking-[0.22em] text-[rgba(243,241,237,.42)]",
            g.key === "left"
              ? "left-8 top-[47%] text-left xl:left-11"
              : g.key === "rightTop"
                ? "right-[34px] top-[29%] text-right"
                : // 44%, not the recommended 67%. That is a deliberate
                  // deviation and worth stating: at 67% this group lands in
                  // the band the filter row and card grid occupy, and the
                  // cards' 56px gutters are canonical while "BELONGING." is
                  // ~94px wide at this size — so a right-edge group at 34px
                  // ALWAYS crosses into the cards. Section 132 states
                  // no-overlap as a must; 131.3's coordinates are given as
                  // recommended. The must wins. 44% still reads as the
                  // filter/card transition it is described as sitting
                  // beside, just above the row rather than through it.
                  "right-[34px] top-[44%] text-right",
          ].join(" ")}
          style={{ width: "max-content" }}
        >
          {g.lines.map((line, i) => (
            <span key={i} className="block">
              {line}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
