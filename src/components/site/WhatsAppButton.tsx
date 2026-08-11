// Fixed floating circle, opposite corner from SoundToggle (bottom-left
// is already claimed — see that component's own comment) so the two
// never collide. Same chrome language as the rest of the site's fixed
// UI: ink/60 + backdrop-blur at rest, border-chalk/20. A pure icon
// circle rather than a labeled pill (SoundToggle's shape) since the
// WhatsApp glyph alone is universally recognizable — no label needed.
// Hover: lift + color inversion to accent, matching this site's
// established CTA hover vocabulary (2-4px lift, subtle color inversion)
// rather than inventing a new hover language for one button.
const WHATSAPP_NUMBER = "919302463057";
const PREFILLED_MESSAGE = "Hi, I'm interested in working with iora.";

export default function WhatsAppButton() {
  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(PREFILLED_MESSAGE)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Message us on WhatsApp"
      className="fixed bottom-6 right-6 z-[80] flex h-12 w-12 items-center justify-center rounded-full border border-chalk/20 bg-ink/60 text-chalk backdrop-blur-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-accent hover:bg-accent hover:text-ink"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-[22px] w-[22px]">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2ZM12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 15 3.79 13.47 3.79 11.91C3.79 7.37 7.5 3.66 12.05 3.66C14.25 3.66 16.31 4.51 17.87 6.07C19.42 7.63 20.28 9.69 20.28 11.92C20.27 16.46 16.56 20.15 12.04 20.15ZM16.56 13.99C16.32 13.87 15.15 13.29 14.93 13.21C14.71 13.13 14.55 13.09 14.39 13.34C14.23 13.58 13.77 14.13 13.63 14.29C13.49 14.45 13.35 14.47 13.11 14.35C12.87 14.23 12.1 13.98 11.19 13.17C10.48 12.54 10 11.76 9.86 11.52C9.72 11.28 9.84 11.15 9.96 11.03C10.07 10.92 10.2 10.74 10.32 10.6C10.44 10.46 10.48 10.36 10.56 10.2C10.64 10.04 10.6 9.9 10.54 9.78C10.48 9.66 10 8.49 9.8 8.01C9.6 7.55 9.4 7.61 9.25 7.6C9.11 7.6 8.95 7.6 8.79 7.6C8.63 7.6 8.37 7.66 8.15 7.9C7.93 8.14 7.31 8.72 7.31 9.89C7.31 11.06 8.17 12.19 8.29 12.35C8.41 12.51 10 14.93 12.4 15.96C12.97 16.2 13.42 16.35 13.77 16.46C14.34 16.64 14.86 16.61 15.27 16.55C15.73 16.48 16.68 15.98 16.88 15.42C17.08 14.86 17.08 14.38 17.02 14.28C16.96 14.18 16.8 14.11 16.56 13.99Z" />
      </svg>
    </a>
  );
}
