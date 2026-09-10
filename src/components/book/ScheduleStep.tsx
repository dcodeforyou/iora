"use client";

import { useEffect, useRef, useState } from "react";
import type { BookFormValues } from "@/lib/book/fields";

/**
 * Step 02 — choose a time.
 *
 * This is Calendly's own inline widget inside an ïora shell, which is a
 * deliberate choice rather than a shortcut. Calendly's calendar renders
 * in an iframe, so its internal DOM cannot be restyled from this site at
 * any depth that would make it look like the mockup. Reproducing the
 * mockup's calendar exactly means building the calendar here and using
 * Calendly purely as scheduling infrastructure — which needs the
 * Scheduling API's invitee-creation endpoint, and that is a paid plan.
 * Until that is in place, the honest version is a beautiful shell around
 * a calendar that looks like Calendly, not a calendar that looks custom
 * and silently fails to book anything.
 *
 * The widget script is loaded HERE rather than in the page shell, so a
 * visitor who never finishes Step 01 never downloads it.
 */

const CALENDLY_URL = "https://calendly.com/dcodeforyou";
const SCRIPT_SRC = "https://assets.calendly.com/assets/external/widget.js";

type CalendlyGlobal = {
  initInlineWidget: (opts: {
    url: string;
    parentElement: HTMLElement;
    prefill?: Record<string, unknown>;
    utm?: Record<string, string>;
  }) => void;
};

export default function ScheduleStep({
  values,
  onBooked,
  onBack,
}: {
  values: BookFormValues;
  onBooked: () => void;
  onBack: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const init = () => {
      const calendly = (window as unknown as { Calendly?: CalendlyGlobal }).Calendly;
      if (!calendly || !hostRef.current) return;
      calendly.initInlineWidget({
        // hide_event_type_details keeps the duplicate title/description
        // out — the ïora page above already said all of it.
        url: `${CALENDLY_URL}?hide_event_type_details=1`,
        parentElement: hostRef.current,
        // The visitor already answered these. Asking twice is the
        // fastest way to lose someone who has already decided to book.
        //
        // customAnswers keys are positional (a1 is the first invitee
        // question configured on the event type). Any key with no
        // matching question is ignored by Calendly rather than erroring
        // — which means these only arrive if the questions exist. See
        // the setup note in the handoff summary.
        prefill: {
          name: values.name,
          email: values.email,
          customAnswers: {
            a1: values.goal,
            a2: values.interest,
            a3: values.budget,
            a4: [values.website, values.notes].filter(Boolean).join("\n\n"),
          },
        },
      });
    };

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      init();
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = init;
    script.onerror = () => setFailed(true);
    document.body.appendChild(script);
  }, [values]);

  useEffect(() => {
    // Calendly reports back by postMessage. Origin is checked because a
    // message handler that trusts any sender is a message handler any
    // page in an iframe can drive.
    const onMessage = (e: MessageEvent) => {
      if (!e.origin.endsWith("calendly.com")) return;
      const data = e.data as { event?: string } | null;
      if (data?.event === "calendly.event_scheduled") onBooked();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onBooked]);

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex w-full max-w-[760px] items-center justify-between font-mono-kicker text-[10px] uppercase tracking-[0.2em] text-[rgba(243,241,237,0.42)]">
        <button
          type="button"
          onClick={onBack}
          className="transition-colors hover:text-chalk"
        >
          ← Step 01 / Project context
        </button>
        <span>
          <span className="text-chalk">02</span> / 02
        </span>
      </div>

      <div className="max-w-[760px] text-center">
        <h2 className="font-display text-[clamp(2rem,5vw,3rem)] leading-[1.05] tracking-[-0.02em] text-chalk">
          Looks good.
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-[rgba(243,241,237,0.72)]">
          Pick a time for a focused conversation. We already have your context — you will not be
          asked for it again.
        </p>
      </div>

      <div className="bookSchedule">
        {failed ? (
          // The scheduler is a third-party script on someone else's
          // domain. When it does not arrive, a dead grey box is the
          // worst outcome — a working link is not.
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="text-[15px] text-[rgba(243,241,237,0.72)]">
              The scheduler could not load here.
            </p>
            <a
              href={CALENDLY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-chalk/25 px-6 py-3 font-mono-kicker text-[11px] uppercase tracking-[0.2em] text-chalk transition-colors hover:border-accent hover:text-accent"
            >
              Open the calendar →
            </a>
          </div>
        ) : (
          <div ref={hostRef} className="bookSchedule__embed" />
        )}
      </div>
    </div>
  );
}
