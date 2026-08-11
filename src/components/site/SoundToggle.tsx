"use client";

import { useSyncExternalStore } from "react";
import { isSoundEnabled, subscribeSound, toggleSound } from "@/lib/sound/soundManager";

// Same pattern noomo's own labs site uses (a small wave-icon toggle,
// explicit on/off, sound never assumed) — adapted to this site's own
// ink/chalk/accent + font-mono-kicker chrome language rather than
// reusing their exact icon/copy. Bottom-left, fixed — WhatsAppButton
// owns bottom-right (Hero's "Scroll" hint sits bottom-center, only on
// that one section, so neither collides with it either).
export default function SoundToggle() {
  // Server snapshot is always `false` (sound off); the client snapshot
  // reads the real localStorage-persisted value at module-init (see
  // soundManager.ts) — React reconciles the mismatch after hydration on
  // its own, no manual effect/init call needed here.
  const enabled = useSyncExternalStore(subscribeSound, isSoundEnabled, () => false);

  return (
    <button
      type="button"
      onClick={toggleSound}
      aria-pressed={enabled}
      aria-label={enabled ? "Mute sound effects" : "Enable sound effects"}
      className="fixed bottom-6 left-6 z-[80] flex items-center gap-2 rounded-full border border-chalk/20 bg-ink/60 px-4 py-2.5 backdrop-blur-sm transition-colors hover:border-chalk/40"
    >
      <span className="flex items-end gap-[2px]" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`w-[3px] rounded-full transition-all duration-300 ${
              enabled ? "bg-accent" : "bg-chalk-muted"
            }`}
            style={{
              height: enabled ? [7, 13, 9][i] : 4,
              animation: enabled ? `sound-bar 0.9s ease-in-out ${i * 0.15}s infinite` : "none",
            }}
          />
        ))}
      </span>
      <span className="font-mono-kicker text-[10px] uppercase tracking-[0.25em] text-chalk-muted">
        Sound {enabled ? "on" : "off"}
      </span>
    </button>
  );
}
