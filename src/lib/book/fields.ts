/**
 * The Book a Call form's shape and its rules.
 *
 * Deliberately shared by the client wheel and the server route. The
 * brief lists server-side validation as required, and the fastest way
 * for a server rule to drift away from the client rule that mirrors it
 * is to write them twice — so there is exactly one copy, and the server
 * is the one that enforces it.
 */

export type FieldKind = "text" | "email" | "url" | "textarea" | "chips";

export type FieldId = "name" | "email" | "website" | "goal" | "interest" | "budget" | "notes";

export type Field = {
  id: FieldId;
  /** The 01-07 rail number, so the label reads the same as the brief. */
  index: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  placeholder?: string;
  helper?: string;
  maxLength: number;
  /** chips only. */
  options?: string[];
  autoComplete?: string;
};

/**
 * §7 — budget is present but never required. At this stage a good lead
 * who genuinely does not know their number yet is worth more than a
 * clean dataset, so the field takes free text ("Around 3 lakh", "Not
 * fixed yet") instead of forcing a bracket.
 */
export const FIELDS: Field[] = [
  {
    id: "name",
    index: "01",
    label: "Your name",
    kind: "text",
    required: true,
    placeholder: "Who we'll be talking to",
    maxLength: 120,
    autoComplete: "name",
  },
  {
    id: "email",
    index: "02",
    label: "Work email",
    kind: "email",
    required: true,
    placeholder: "you@company.com",
    maxLength: 200,
    autoComplete: "email",
  },
  {
    id: "website",
    index: "03",
    label: "Brand / Website URL",
    kind: "url",
    required: false,
    placeholder: "yourbrand.com",
    helper: "Optional",
    maxLength: 300,
    autoComplete: "url",
  },
  {
    id: "goal",
    index: "04",
    label: "What are you trying to improve?",
    kind: "textarea",
    required: true,
    placeholder: "The outcome you want to move — in your own words.",
    maxLength: 2000,
  },
  {
    id: "interest",
    index: "05",
    label: "Primary interest",
    kind: "chips",
    required: false,
    helper: "Optional — pick any",
    maxLength: 200,
    options: ["AI Films", "Website / Conversion", "Connected Growth", "Not sure yet"],
  },
  {
    id: "budget",
    index: "06",
    label: "Estimated budget",
    kind: "text",
    required: false,
    placeholder: "₹ / $ / rough range",
    helper: "Optional — a rough range is enough",
    maxLength: 120,
  },
  {
    id: "notes",
    index: "07",
    label: "Anything useful before the call?",
    kind: "textarea",
    required: false,
    placeholder: "Existing creative, campaigns, assets, deadlines…",
    helper: "Optional",
    maxLength: 2000,
  },
];

export type BookFormValues = Record<FieldId, string>;

export const EMPTY_VALUES: BookFormValues = {
  name: "",
  email: "",
  website: "",
  goal: "",
  interest: "",
  budget: "",
  notes: "",
};

/**
 * Intentionally permissive. A stricter pattern rejects real addresses
 * (new TLDs, plus-addressing, unicode locals) far more often than it
 * catches a typo, and the only thing that actually proves an address is
 * sending to it.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Tidies a typed hostname into a URL when it clearly is one, and returns
 * null when it is not. Callers treat null as "leave it as the person
 * typed it", NOT as an error — see validate().
 *
 * Never fetches it, whatever it turns out to be. A server that requests
 * whatever URL a stranger typed is an SSRF probe with a form in front of
 * it.
 */
export function normaliseWebsite(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  // Anything other than plain web protocols — javascript:, data:, file:
  // — is rejected outright rather than sanitised.
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname.includes(".")) return null;
  return url.toString();
}

export type ValidationResult = { ok: true; values: BookFormValues } | { ok: false; errors: Partial<Record<FieldId, string>> };

/** The single rule set. Run on the client for feedback, on the server for real. */
export function validate(input: Partial<Record<FieldId, unknown>>): ValidationResult {
  const errors: Partial<Record<FieldId, string>> = {};
  const values = { ...EMPTY_VALUES };

  for (const field of FIELDS) {
    const raw = input[field.id];
    const value = typeof raw === "string" ? raw.trim() : "";

    if (value.length > field.maxLength) {
      errors[field.id] = `Keep this under ${field.maxLength} characters`;
      continue;
    }
    if (field.required && !value) {
      errors[field.id] = "This one we do need";
      continue;
    }
    if (field.id === "email" && value && !EMAIL_RE.test(value)) {
      errors[field.id] = "That address doesn't look right";
      continue;
    }
    if (field.id === "website" && value) {
      // Deliberately NOT validated. This field asks for "Brand / Website
      // URL" and plenty of honest answers are neither — a brand name, an
      // Instagram handle, "we don't have one yet". Rejecting those turns
      // an optional field into a wall in front of someone who was about
      // to book, which is a far worse outcome than an untidy string.
      //
      // So: tidy it into a URL when it plainly is one, and otherwise keep
      // exactly what they typed. The value is only ever carried as text,
      // never rendered as a link and never requested, so an unparseable
      // one is harmless.
      values[field.id] = normaliseWebsite(value) ?? value;
      continue;
    }
    values[field.id] = value;
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}

/** Which fields must be answered before Step 02 can open. */
export const REQUIRED_FIELDS = FIELDS.filter((f) => f.required).map((f) => f.id);
