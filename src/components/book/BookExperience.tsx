"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FocusWheelForm from "./FocusWheelForm";
import ScheduleStep from "./ScheduleStep";
import { EMPTY_VALUES, type BookFormValues, type FieldId } from "@/lib/book/fields";
import { getLenisInstance } from "@/lib/scroll/lenisInstance";
import "@/styles/book.css";

/**
 * The two-step Book a Call experience.
 *
 * Both steps live on one route. Splitting them across /book and
 * /book/schedule would mean the answers either travel through the URL
 * (they are personal, and the brief forbids that) or get re-fetched, and
 * it would put a full navigation between "I have decided" and "let me
 * pick a time" — the exact moment where people leave.
 *
 * Answers stay in this component's state and nowhere else until a
 * booking actually happens. That is the brief's Option 1 for storage,
 * chosen over Option 2 because Option 2 needs a database this project
 * does not have; the trade is that a visitor who fills the form and
 * never books is not recoverable. See the handoff notes.
 */

type Step = "context" | "schedule" | "booked";

/** Fixed positions, so the composition is the same every load. */
const DUST = [
  { top: "18%", left: "12%", twinkle: false },
  { top: "31%", left: "78%", twinkle: true },
  { top: "62%", left: "88%", twinkle: false },
  { top: "74%", left: "22%", twinkle: true },
  { top: "12%", left: "58%", twinkle: false },
  { top: "48%", left: "6%", twinkle: false },
  { top: "86%", left: "62%", twinkle: true },
  { top: "26%", left: "40%", twinkle: false },
];

export default function BookExperience() {
  const [step, setStep] = useState<Step>("context");
  const [values, setValues] = useState<BookFormValues>(EMPTY_VALUES);

  // Accepts an updater as well as a plain value. The chips field needs
  // it: it toggles one option out of a joined list, and computing that
  // from a prop means two clicks in the same tick both read the
  // pre-render value and the first one is lost.
  // Each step is a new screen, so it starts at the top of that screen.
  // Without this the page keeps whatever scroll position the form left
  // it at, and someone who filled the last field near the bottom of the
  // page arrives at the scheduler already scrolled past its heading —
  // looking at a blank calendar with no explanation above it.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const lenis = getLenisInstance();
    if (lenis) lenis.scrollTo(0, { duration: 0.5 });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const onChange = useCallback((id: FieldId, value: string | ((prev: string) => string)) => {
    setValues((current) => ({
      ...current,
      [id]: typeof value === "function" ? value(current[id]) : value,
    }));
  }, []);

  return (
    <main className="bookPage">
      <div className="bookDust" aria-hidden="true">
        {DUST.map((d, i) => (
          <span
            key={i}
            data-twinkle={d.twinkle ? "1" : "0"}
            style={{
              top: d.top,
              left: d.left,
              // Staggered so the few that do twinkle never pulse in
              // unison, which reads as a blinking indicator rather than
              // atmosphere.
              ["--dust-dur" as string]: `${6 + i}s`,
              ["--dust-delay" as string]: `${i * 1.3}s`,
            }}
          />
        ))}
      </div>

      <div className="bookPage__content mx-auto flex min-h-svh w-full max-w-[1400px] flex-col px-6 pb-12 pt-24 sm:px-10 sm:pt-26">
        <p className="self-end font-mono-kicker text-[10px] uppercase tracking-[0.22em] text-[rgba(243,241,237,0.42)]">
          Secure · Private · No spam
        </p>

        {step === "booked" ? (
          <SuccessState />
        ) : (
          <div className="mt-8 flex flex-1 flex-col gap-14 lg:mt-0 lg:flex-row lg:items-start lg:gap-16">
            {/* lg:items-start, not items-center. Centred, the copy
                column's vertical position is dictated by the FORM
                column's height — the tallest thing on the page — so on a
                shorter window the copy gets pushed down onto the
                site-wide Sound toggle fixed in the bottom-left corner.
                Aligned to the top, its position comes from this
                container's own padding and is the same at every viewport
                height. */}
            {/* The copy column steps back once scheduling opens: at that
                point the visitor has one job, and a two-step explainer
                beside it is describing something they already did. */}
            {step === "context" && (
              <div className="lg:max-w-[440px] lg:pt-6 xl:max-w-[520px]">
                <p className="font-mono-kicker text-[10px] uppercase tracking-[0.24em] text-[rgba(243,241,237,0.5)]">
                  [ Let&rsquo;s build what&rsquo;s next ]
                </p>
                <h1 className="mt-6 font-display text-[clamp(2.6rem,7vw,4.4rem)] font-light leading-[1.02] tracking-[-0.03em] text-chalk">
                  Start a
                  <br />
                  conversation.
                </h1>
                <p className="mt-6 max-w-[420px] text-[15px] leading-relaxed text-[rgba(243,241,237,0.72)]">
                  Share a few details so we can come prepared and make our time together actually
                  useful.
                </p>

                <p className="mt-10 font-mono-kicker text-[10px] uppercase tracking-[0.22em] text-[rgba(243,241,237,0.4)]">
                  Two steps. A clearer direction.
                </p>
                <ol className="mt-5 space-y-4">
                  {[
                    ["01", "Tell us about your project", "A few quick details."],
                    ["02", "Choose a time", "Pick a slot that works for you."],
                  ].map(([n, title, sub]) => (
                    <li key={n} className="flex gap-5">
                      <span className="font-display text-[26px] font-light leading-none text-[rgba(243,241,237,0.28)]">
                        {n}
                      </span>
                      <span className="border-l border-chalk/12 pl-5">
                        <span className="block text-[14px] text-chalk">{title}</span>
                        <span className="block text-[13px] text-[rgba(243,241,237,0.5)]">{sub}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="flex flex-1 justify-center lg:justify-end">
              {step === "context" ? (
                <FocusWheelForm
                  values={values}
                  onChange={onChange}
                  onComplete={() => setStep("schedule")}
                />
              ) : (
                <ScheduleStep
                  values={values}
                  onBooked={() => setStep("booked")}
                  onBack={() => setStep("context")}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/** §31 — what happens after a real booking, in ïora's voice. */
function SuccessState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
      <p className="font-mono-kicker text-[10px] uppercase tracking-[0.24em] text-[rgba(243,241,237,0.5)]">
        [ You&rsquo;re in ]
      </p>
      <h1 className="mt-6 font-display text-[clamp(2.4rem,6vw,3.8rem)] font-light leading-[1.04] tracking-[-0.03em] text-chalk">
        We&rsquo;ll do our
        <br />
        homework first.
      </h1>
      <p className="mt-6 max-w-[480px] text-[15px] leading-relaxed text-[rgba(243,241,237,0.72)]">
        We&rsquo;ll review what you&rsquo;ve shared before the conversation so we can spend the call
        on decisions — not introductions.
      </p>
      <ol className="mt-14 flex flex-col gap-5 text-left sm:flex-row sm:gap-10">
        {[
          ["01", "We review"],
          ["02", "We talk"],
          ["03", "If there's a fit, we map what happens next"],
        ].map(([n, label]) => (
          <li key={n} className="flex max-w-[240px] gap-4">
            <span className="font-display text-[22px] font-light leading-none text-[rgba(243,241,237,0.28)]">
              {n}
            </span>
            <span className="font-mono-kicker text-[10px] uppercase leading-[1.7] tracking-[0.18em] text-[rgba(243,241,237,0.62)]">
              {label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
