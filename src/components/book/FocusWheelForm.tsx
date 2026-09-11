"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { FIELDS, validate, type BookFormValues, type FieldId } from "@/lib/book/fields";

/**
 * Step 01 — the signature vertical focus form.
 *
 * One field is fully active at a time, in the visual centre. Its
 * neighbours stay visible as progressively smaller, fainter rails, so
 * the visitor can always see how much is left and what they already
 * said, without seven live inputs competing for attention.
 *
 * Every field's real input stays in the DOM, including the dimmed
 * rails. That is what makes Tab follow the actual field order — a wheel
 * that only renders the centred input has nothing for Tab to move to,
 * and the brief is explicit that Tab must keep working. Focusing any
 * input brings its card to the centre, so tabbing through the form and
 * scrolling through it behave identically.
 *
 * The chips field is the one exception: buttons cannot double as a
 * dimmed preview without putting four tab stops on every rail, so when
 * it is not centred it collapses to a single focusable summary that
 * hands focus on to the chips once it arrives.
 */

/*
  Wheel / trackpad gesture model: ONE GESTURE = ONE FIELD.

  The old version stepped on a 420ms cooldown, which is fine for a mouse
  notch and wrong for a trackpad: a Mac flick keeps emitting momentum
  events for about a second after the fingers lift, so one flick walked
  two or three fields. Now a step locks until the event stream goes
  quiet, and only two things break the lock early: a fresh push (deltas
  jump up again, which momentum never does) or a genuinely held stream
  (a mouse wheel spun continuously, constant force, not decaying).
*/
/** Silence after which the next event is a new gesture. */
const WHEEL_QUIET_MS = 160;
/** Accumulated travel needed before a gesture counts. One mouse notch
 *  clears it alone; a trackpad needs a deliberate push, not a brush. */
const WHEEL_STEP_PX = 30;
/** A continuous stream at real force may step again after this long. */
const WHEEL_RELOCK_MS = 500;
const WHEEL_RELOCK_MIN_PX = 12;
/** Vertical travel for a touch swipe to change field. */
const SWIPE_PX = 30;
/** Cumulative offsets by distance from centre; index 0 is the centre. */
const GAP_VARS = ["0px", "var(--gap-1)", "var(--gap-2)", "var(--gap-3)"];

type Props = {
  values: BookFormValues;
  onChange: (id: FieldId, value: string | ((prev: string) => string)) => void;
  onComplete: () => void;
};

export default function FocusWheelForm({ values, onChange, onComplete }: Props) {
  const [active, setActive] = useState(0);
  const [errors, setErrors] = useState<Partial<Record<FieldId, string>>>({});
  const [attempted, setAttempted] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | HTMLTextAreaElement | null)[]>([]);
  /** Set while a click/scroll moves the wheel, so focus lands after the
   *  card has arrived rather than while it is still travelling. */
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback((index: number, focusAfter = true) => {
    const clamped = Math.max(0, Math.min(FIELDS.length - 1, index));
    setActive(clamped);
    if (!focusAfter) return;
    if (focusTimer.current) clearTimeout(focusTimer.current);
    // Matches --wheel-move. Focusing before the card lands puts a
    // caret in something still sliding across the screen.
    //
    // preventScroll is load-bearing. A bare focus() scrolls the PAGE to
    // bring the input into view — so every field change nudged the whole
    // page, which is exactly the movement this form is meant not to cause.
    focusTimer.current = setTimeout(
      () => inputRefs.current[clamped]?.focus({ preventScroll: true }),
      400,
    );
  }, []);

  useEffect(
    () => () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
    },
    [],
  );

  /**
   * Whether navigating should also move the caret. On a phone, focusing
   * an input opens the keyboard — so a swipe that merely browses the
   * fields must NOT focus one, or every swipe throws a keyboard up and
   * shoves the page around. Once the visitor is already typing, though,
   * focus follows the wheel, so their next keystroke lands in the field
   * they can see rather than the one that just slid off-centre.
   */
  const shouldFocusAfterNav = () => {
    if (!window.matchMedia("(pointer: coarse)").matches) return true;
    const el = document.activeElement;
    return Boolean(el && hostRef.current?.contains(el));
  };

  // Mirrors `active` for the listeners below, which attach ONCE. They
  // used to re-attach on every field change, and each re-attach reset
  // the gesture state — so a trackpad's momentum arriving just after a
  // step looked like a brand-new gesture and stepped again.
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // ── Nothing under the wheel scrolls the page ──────────────────────
  //
  // While the pointer or finger is on the fields, the fields are the
  // only thing that moves — including at the first and last field, where
  // the gesture simply does nothing. That is a deliberate change from
  // "release at the edges": with the page moving under a half-filled
  // form, the field being typed into slides away from under the cursor.
  // The page is still scrollable from everywhere else on it.
  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;

    const step = (direction: 1 | -1) => {
      const next = activeRef.current + direction;
      if (next < 0 || next >= FIELDS.length) return;
      // Written ahead of the re-render so two steps in one frame count
      // from the right place.
      activeRef.current = next;
      goTo(next, shouldFocusAfterNav());
    };

    /** A multiline field with room left to scroll that way keeps the
     *  gesture — a long note has to stay readable. Only at its end does
     *  the wheel take over. */
    const scrollableTextarea = (target: EventTarget | null, direction: 1 | -1) => {
      const ta = target instanceof Element ? target.closest("textarea") : null;
      if (!ta) return null;
      const room = direction > 0 ? ta.scrollHeight - ta.clientHeight - ta.scrollTop : ta.scrollTop;
      return room > 1 ? ta : null;
    };

    // ── Wheel / trackpad ─────────────────────────────────────────
    let acc = 0;
    let lastAt = 0;
    let lastAbs = 0;
    let locked = false;
    let lockedAt = 0;

    const onWheel = (e: WheelEvent) => {
      if (e.cancelable) e.preventDefault();
      // Firefox reports in lines or pages for some mice; normalise.
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * node.clientHeight : e.deltaY;
      if (Math.abs(dy) <= Math.abs(e.deltaX)) return;
      const direction = dy > 0 ? 1 : -1;

      const ta = scrollableTextarea(e.target, direction);
      if (ta) {
        ta.scrollTop += dy;
        return;
      }

      const now = performance.now();
      const abs = Math.abs(dy);
      if (now - lastAt > WHEEL_QUIET_MS) {
        locked = false;
        acc = 0;
      }
      lastAt = now;

      if (locked) {
        const freshPush = abs >= 20 && abs > lastAbs * 1.6 && now - lockedAt > 200;
        const heldStream = now - lockedAt > WHEEL_RELOCK_MS && abs >= WHEEL_RELOCK_MIN_PX && abs >= lastAbs;
        lastAbs = abs;
        if (!freshPush && !heldStream) return; // momentum tail of the same flick
        locked = false;
        acc = 0;
      }
      lastAbs = abs;

      acc += dy;
      if (Math.abs(acc) >= WHEEL_STEP_PX) {
        step(acc > 0 ? 1 : -1);
        locked = true;
        lockedAt = now;
        acc = 0;
      }
    };

    // ── Touch ────────────────────────────────────────────────────
    //
    // The page is kept still by CSS, not by preventDefault: the wheel is
    // `touch-action: none` (see book.css), which tells the browser a drag
    // here is not a scroll at all. That is the only reliable way on iOS —
    // a preventDefault in touchmove is ignored once the browser has
    // committed to a pan, which it does within the first few pixels.
    // So every listener here is passive and only reads positions.
    let startX = 0;
    let startY = 0;
    let inScrollableText = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      // A long note that overflows its box is allowed to pan itself
      // (book.css), so a drag that starts inside it is reading, not
      // navigating.
      inScrollableText =
        e.target instanceof Element && Boolean(e.target.closest('textarea[data-scrollable="true"]'));
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (inScrollableText) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dy = t.clientY - startY;
      const dx = t.clientX - startX;
      if (Math.abs(dy) < SWIPE_PX || Math.abs(dy) <= Math.abs(dx)) return;
      step(dy < 0 ? 1 : -1);
    };

    node.addEventListener("wheel", onWheel, { passive: false });
    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      node.removeEventListener("wheel", onWheel);
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchend", onTouchEnd);
    };
    // Attached once: `goTo` is stable and `active` is read through a ref.
  }, [goTo]);

  const submit = () => {
    setAttempted(true);
    const result = validate(values);
    if (result.ok) {
      setErrors({});
      onComplete();
      return;
    }
    setErrors(result.errors);
    // Land the visitor on the first thing that actually needs fixing
    // rather than telling them something is wrong somewhere above.
    const firstBad = FIELDS.findIndex((f) => result.errors[f.id]);
    if (firstBad >= 0) goTo(firstBad);
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const field = FIELDS[index];
    // Enter advances simple inputs. It is left alone in the two
    // multiline fields, where it means "new paragraph" — stealing it
    // there is how a form eats someone's sentence.
    if (e.key === "Enter" && field.kind !== "textarea") {
      e.preventDefault();
      if (index === FIELDS.length - 1) submit();
      else goTo(index + 1);
    }
    if (e.key === "ArrowDown" && field.kind !== "textarea") {
      e.preventDefault();
      goTo(index + 1);
    }
    if (e.key === "ArrowUp" && field.kind !== "textarea") {
      e.preventDefault();
      goTo(index - 1);
    }
  };

  // Computed from the value React is holding, not from the prop this
  // render closed over — otherwise two quick toggles both start from
  // the same empty list and the first selection disappears.
  const toggleChip = (option: string) => {
    onChange("interest", (prev) => {
      const current = prev ? prev.split(", ").filter(Boolean) : [];
      const next = current.includes(option)
        ? current.filter((c) => c !== option)
        : [...current, option];
      return next.join(", ");
    });
  };

  return (
    <div className="flex w-full max-w-[760px] flex-col items-center gap-4">
      <div className="flex w-full items-center justify-between font-mono-kicker text-[10px] uppercase tracking-[0.2em] text-[rgba(243,241,237,0.42)]">
        <span>Step 01 / Project context</span>
        <span>
          <span className="text-chalk">01</span> / 02
        </span>
      </div>

      {/* data-lenis-prevent: Lenis smooth-scrolls the page from its own
          window-level wheel listener and does not look at preventDefault,
          so without this every wheel step over the form ALSO scrolled the
          page by a notch — measured at ~100px per event. This attribute is
          Lenis's own opt-out for an element and everything inside it. */}
      <div ref={hostRef} className="focusWheel" data-lenis-prevent="">
        <button
          type="button"
          className="focusWheel__nudge focusWheel__nudge--up"
          onClick={() => goTo(active - 1, shouldFocusAfterNav())}
          disabled={active === 0}
          aria-label="Previous field"
        >
          <svg viewBox="0 0 12 8" width="11" height="7" aria-hidden="true">
            <path d="M1 7l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>

        {FIELDS.map((field, i) => {
          const offset = i - active;
          const distance = Math.min(4, Math.abs(offset));
          const isActive = offset === 0;
          const gap = GAP_VARS[Math.min(3, Math.abs(offset))];
          const y = offset === 0 ? "0px" : `calc(${gap} * ${Math.sign(offset)})`;
          const error = attempted ? errors[field.id] : undefined;

          return (
            <div
              key={field.id}
              className="focusWheel__card"
              data-distance={distance}
              data-invalid={Boolean(error)}
              style={{ "--card-y": y } as CSSProperties}
              // Clicking the card's padding centres it. Clicking the
              // input itself does the same thing via onFocus below —
              // this is only for the gaps in between.
              onClick={isActive ? undefined : () => goTo(i)}
            >
              <span className="focusWheel__label">
                {field.index} — {field.label}
                {field.required && (
                  <span className="focusWheel__required" aria-hidden="true">
                    *
                  </span>
                )}
                {field.kind === "chips" && field.helper && (
                  <span className="focusWheel__labelHint"> · {field.helper}</span>
                )}
              </span>

              {field.kind === "chips" ? (
                isActive ? (
                  <div className="focusWheel__chips">
                    {field.options?.map((option, chipIndex) => (
                      <button
                        key={option}
                        type="button"
                        ref={chipIndex === 0 ? (el) => {
                          inputRefs.current[i] = el as unknown as HTMLInputElement | null;
                        } : undefined}
                        className="focusWheel__chip"
                        aria-pressed={values.interest.split(", ").includes(option)}
                        onClick={() => toggleChip(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="focusWheel__preview text-left"
                    onFocus={() => goTo(i)}
                    onClick={() => goTo(i)}
                  >
                    {values.interest || field.helper}
                  </button>
                )
              ) : field.kind === "textarea" ? (
                <textarea
                  ref={(el) => {
                    inputRefs.current[i] = el;
                  }}
                  className="focusWheel__textarea"
                  placeholder={field.placeholder}
                  maxLength={field.maxLength}
                  value={values[field.id]}
                  onChange={(e) => {
                    // Flags a note that has outgrown its box, so book.css
                    // can let a finger pan inside it (and only it). The
                    // DOM already holds the new text when this fires.
                    const ta = e.currentTarget;
                    ta.dataset.scrollable = String(ta.scrollHeight > ta.clientHeight + 1);
                    onChange(field.id, e.target.value);
                  }}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  onFocus={() => setActive(i)}
                  aria-label={field.label}
                  aria-invalid={Boolean(error)}
                />
              ) : (
                <input
                  ref={(el) => {
                    inputRefs.current[i] = el;
                  }}
                  className="focusWheel__input"
                  type={field.kind === "email" ? "email" : "text"}
                  inputMode={field.kind === "email" ? "email" : undefined}
                  autoComplete={field.autoComplete}
                  placeholder={field.placeholder}
                  maxLength={field.maxLength}
                  value={values[field.id]}
                  onChange={(e) => onChange(field.id, e.target.value)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  onFocus={() => setActive(i)}
                  aria-label={field.label}
                  aria-invalid={Boolean(error)}
                />
              )}

              {isActive && (error ? (
                <span className="focusWheel__error">{error}</span>
              ) : field.helper && field.kind !== "chips" ? (
                <span className="focusWheel__helper">{field.helper}</span>
              ) : null)}
            </div>
          );
        })}

        <button
          type="button"
          className="focusWheel__nudge focusWheel__nudge--down"
          onClick={() => goTo(active + 1, shouldFocusAfterNav())}
          disabled={active === FIELDS.length - 1}
          aria-label="Next field"
        >
          <svg viewBox="0 0 12 8" width="11" height="7" aria-hidden="true">
            <path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      </div>

      <p className="text-center font-mono-kicker text-[10px] uppercase leading-[1.8] tracking-[0.18em] text-[rgba(243,241,237,0.34)]">
        Scroll or use arrows to navigate
        <br />
        Click to select a field
      </p>

      <button
        type="button"
        onClick={submit}
        className="w-full max-w-[280px] rounded-full border px-8 py-4 font-mono-kicker text-[11px] uppercase tracking-[0.24em] text-chalk transition-colors duration-300"
        style={{
          borderColor: "color-mix(in srgb, var(--color-accent) 82%, transparent)",
          boxShadow: "0 0 26px color-mix(in srgb, var(--color-accent) 12%, transparent)",
        }}
      >
        Next step →
      </button>

      <p className="font-mono-kicker text-[10px] uppercase tracking-[0.2em] text-[rgba(243,241,237,0.3)]">
        Takes less than a minute
      </p>
    </div>
  );
}
