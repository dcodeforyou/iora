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

const WHEEL_COOLDOWN_MS = 420;
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
  const wheelLockedUntil = useRef(0);
  /** Set while a click/scroll moves the wheel, so focus lands after the
   *  card has arrived rather than while it is still travelling. */
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goTo = useCallback((index: number, focusAfter = true) => {
    const clamped = Math.max(0, Math.min(FIELDS.length - 1, index));
    setActive(clamped);
    if (!focusAfter) return;
    if (focusTimer.current) clearTimeout(focusTimer.current);
    // Matches --wheel-move. Focusing before the card lands puts a
    // caret in something still sliding across the screen.
    focusTimer.current = setTimeout(() => inputRefs.current[clamped]?.focus(), 400);
  }, []);

  useEffect(
    () => () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
    },
    [],
  );

  // ── Scroll over the form moves one field per gesture ──────────────
  //
  // A manual, non-passive listener rather than React's onWheel: React
  // attaches wheel handlers passively, which makes preventDefault a
  // silent no-op, and without it the page scrolls away underneath the
  // form instead of the form advancing.
  //
  // Re-attached whenever the active field changes. That is seven
  // listener swaps over a whole form fill — cheaper than the ref-mirror
  // alternative, and it cannot go stale.
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const next = active + (e.deltaY > 0 ? 1 : -1);
      // At either end the gesture is released to the page, so the form
      // is never a scroll trap — the same rule the Ecosystem section
      // follows.
      if (next < 0 || next >= FIELDS.length) return;
      e.preventDefault();
      const now = performance.now();
      if (now < wheelLockedUntil.current) return;
      wheelLockedUntil.current = now + WHEEL_COOLDOWN_MS;
      goTo(next);
    };
    node.addEventListener("wheel", handler, { passive: false });
    return () => node.removeEventListener("wheel", handler);
  }, [active, goTo]);

  // ── Touch: vertical swipe between fields ──────────────────────────
  const touchY = useRef(0);
  const onTouchStart = (e: React.TouchEvent) => {
    touchY.current = e.touches[0]?.clientY ?? 0;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dy = (e.changedTouches[0]?.clientY ?? touchY.current) - touchY.current;
    if (Math.abs(dy) < 40) return;
    goTo(active + (dy < 0 ? 1 : -1));
  };

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

      <div
        ref={hostRef}
        className="focusWheel"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          className="focusWheel__nudge focusWheel__nudge--up"
          onClick={() => goTo(active - 1)}
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
                  onChange={(e) => onChange(field.id, e.target.value)}
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
          onClick={() => goTo(active + 1)}
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
