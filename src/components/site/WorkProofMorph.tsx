"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type RefObject } from "react";
import "@/styles/work-proof-morph.css";

/**
 * The nav's WORK label, which briefly reads PROOF and returns.
 *
 * The point is the sentence "the work is the proof" — said without
 * adding a second nav item, a second route, or a section the site does
 * not yet have enough verified proof to fill.
 *
 * Both words share one fixed five-cell slot, so nothing in the nav can
 * reflow between a four-letter word and a five-letter one. Each cell
 * animates independently, staggered in CSS rather than by a chain of
 * timers: one state update per morph, and the browser handles the
 * offsets.
 *
 * It recurs on its own every five seconds or so, with a little variance
 * so it never settles into a blink rate, and hover or focus can call it
 * at any time. It skips background tabs, and reduced motion gets no
 * automatic passes at all.
 *
 * No intermediate glyph pass. §1.4 of the brief allows at most one, and
 * then describes the travel-and-blur version as the better one — a
 * character storm is the hacker effect §1.2 explicitly rules out.
 */

const WORD_WORK = ["W", "O", "R", "K", ""] as const;
const WORD_PROOF = ["P", "R", "O", "O", "F"] as const;

/** Must match --wp-stagger and --wp-char in work-proof-morph.css. */
const STAGGER_MS = 52;
const CHAR_MS = 110;
/** Last cell starts at 4 * stagger, so the whole word settles here. */
const MORPH_MS = STAGGER_MS * 4 + CHAR_MS;

const INITIAL_HOLD_MS = 2000;
const PROOF_HOLD_MS = 750;
/** One full WORK -> PROOF -> WORK pass, start to settled. */
const CYCLE_MS = MORPH_MS * 2 + PROOF_HOLD_MS;
/**
 * How long WORK rests between passes. A range, not a constant: a fixed
 * interval turns the reveal into a metronome — something the eye learns
 * to tune out within three beats. A little variance keeps it reading as
 * a signal that surfaces, rather than a light that blinks.
 */
const REST_MIN_MS = 4200;
const REST_MAX_MS = 5800;
/** Hover can start a pass at any moment; an automatic one landing right
 *  after it would read as a stutter, so auto passes keep this much clear
 *  space after ANY pass began. */
const MIN_GAP_MS = 3000;

type Slot = {
  cur: string;
  prev: string | null;
  /** Bumped on every change so React remounts the glyph layers and the
   *  CSS animations actually re-run. 0 means "never animated" — the
   *  first paint is static, not an entrance. */
  gen: number;
};

const initialSlots = (): Slot[] => WORD_WORK.map((ch) => ({ cur: ch, prev: null, gen: 0 }));

/** Lets the nav link — the real hover/focus target — replay the morph
 *  without this component having to know anything about routing. */
export type WorkProofMorphHandle = { play: () => void };

export default function WorkProofMorph({ handleRef }: { handleRef?: RefObject<WorkProofMorphHandle | null> }) {
  const [slots, setSlots] = useState<Slot[]>(initialSlots);
  const [word, setWord] = useState<"work" | "proof">("work");

  // Every pending timeout, so a route change or a fast unmount can never
  // leave one firing into a component that no longer exists.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const running = useRef(false);
  const lastPassAt = useRef(0);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  }, []);

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const setWordTo = useCallback(
    (next: "work" | "proof") => {
      const target = next === "proof" ? WORD_PROOF : WORD_WORK;
      setWord(next);
      let settledGen = 0;
      setSlots((current) => {
        settledGen = (current[0]?.gen ?? 0) + 1;
        return target.map((ch, i) => ({
          cur: ch,
          // A cell whose glyph is unchanged still re-runs, because the
          // alternative is one letter sitting perfectly still while its
          // neighbours move — which reads as a rendering fault rather
          // than a deliberate hold.
          prev: current[i]?.cur || null,
          gen: (current[i]?.gen ?? 0) + 1,
        }));
      });
      // The faded-out glyph is invisible but still real: left in place it
      // accumulates, so selecting the nav word copies "PWROOROKF" instead
      // of "WORK". Dropping it once its animation has finished keeps the
      // element's text content honest. The gen check means a morph that
      // started in the meantime is not stripped mid-flight.
      after(MORPH_MS, () =>
        setSlots((current) =>
          current[0]?.gen === settledGen ? current.map((s) => ({ ...s, prev: null })) : current,
        ),
      );
    },
    [after],
  );

  /** WORK -> PROOF -> WORK, once. Ignored while one is already running. */
  const play = useCallback(() => {
    if (running.current) return;
    running.current = true;
    lastPassAt.current = performance.now();
    setWordTo("proof");
    after(MORPH_MS + PROOF_HOLD_MS, () => {
      setWordTo("work");
      after(MORPH_MS, () => {
        running.current = false;
      });
    });
  }, [after, setWordTo]);

  useImperativeHandle(handleRef, () => ({ play }), [play]);

  useEffect(() => {
    // Reduced motion gets no unprompted animation at all — the word is
    // simply WORK until the visitor asks for it by hovering or focusing.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Its own timer rather than `after()`, because it is rescheduled on
    // every tick and only ever needs the one pending handle.
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      // A background tab gets nothing. Browsers throttle hidden timers to
      // roughly once a second anyway, so without this the passes queue up
      // and fire in a burst the moment the tab comes back.
      if (document.hidden) {
        timer = setTimeout(tick, 1000);
        return;
      }
      const sinceLast = performance.now() - lastPassAt.current;
      if (sinceLast < MIN_GAP_MS) {
        timer = setTimeout(tick, MIN_GAP_MS - sinceLast);
        return;
      }
      play();
      const rest = REST_MIN_MS + Math.random() * (REST_MAX_MS - REST_MIN_MS);
      timer = setTimeout(tick, CYCLE_MS + rest);
    };
    timer = setTimeout(tick, INITIAL_HOLD_MS);
    return () => clearTimeout(timer);
  }, [play]);

  // Separate from the effect above because that one bails early under
  // reduced motion, and hover can still start timers on that path.
  useEffect(() => clearTimers, [clearTimers]);

  return (
    <span className="workProofMorph" data-word={word} aria-hidden="true">
      {slots.map((slot, i) => (
        <span
          // Index is the correct key here: these are five fixed
          // positions in a grid, not a reorderable list.
          key={i}
          className="workProofMorph__slot"
          style={{ "--wp-delay": `${i * STAGGER_MS}ms` } as React.CSSProperties}
        >
          {slot.gen === 0 ? (
            slot.cur && <span className="workProofMorph__char">{slot.cur}</span>
          ) : (
            <>
              {slot.prev && (
                <span key={`o${slot.gen}`} className="workProofMorph__char workProofMorph__char--out">
                  {slot.prev}
                </span>
              )}
              {slot.cur && (
                <span key={`i${slot.gen}`} className="workProofMorph__char workProofMorph__char--in">
                  {slot.cur}
                </span>
              )}
            </>
          )}
        </span>
      ))}
      {/* Absolutely positioned, so it is out of flow and never claims one
          of the five grid cells. */}
      <span className="workProofMorph__rule" />
    </span>
  );
}
