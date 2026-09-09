import { Fragment } from "react";

/**
 * Inline emphasis for case-study copy.
 *
 * The copy framework asks for two things to stand out inside otherwise
 * plain prose: the word "ecosystem" wherever it appears, and the load-
 * bearing phrase of a paragraph (the three connected functions, the
 * attention → retention movement, a documented result). Both render as
 * bold AND italic together.
 *
 * Marked in the data with `**...**` rather than by storing JSX, so
 * projects.ts stays a plain `.ts` data file that can be read, diffed and
 * eventually fed from a CMS without carrying React nodes around.
 *
 * Deliberately NOT a markdown library. This needs exactly one rule, and a
 * parser dependency for one rule is a dependency to keep updated, audit
 * and ship. `split` on a capturing regex keeps the delimiters in the
 * output array, so odd indices are the emphasised runs — no state machine
 * to get wrong.
 *
 * The emphasis lifts colour as well as weight: surrounding prose is
 * chalk-muted, so bolding alone barely reads against it. Stepping up to
 * full chalk is what actually makes the phrase land, and it keeps the
 * accent reserved for the places that have earned it.
 */
export default function Emphasis({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-chalk italic">
            {part}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
