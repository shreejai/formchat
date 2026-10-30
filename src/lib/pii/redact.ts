import "server-only";
import type { ContactValue } from "@/forms/types";
import { DIGIT_RUN, EMAIL, isPhone } from "./detect";

export const NAME = "[NAME]";
export const EMAIL_TOKEN = "[EMAIL]";
export const PHONE = "[PHONE]";

/** How a contact answer is stored in a transcript. */
export const REDACTED_CONTACT = `${NAME} · ${PHONE} · ${EMAIL_TOKEN}`;

const SEPARATORS = String.raw`[\s\-.()]*`;
/** Shorter known phones aren't matched, so a small number in the text isn't masked by accident. */
const MIN_KNOWN_PHONE_DIGITS = 6;
/** Name parts shorter than this ("S.", "Al") are only masked as part of the full name. */
const MIN_NAME_PART = 3;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole word by Unicode letters and digits, so "Rahul" doesn't match inside "Rahulnagar". */
function wholeWord(literal: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escapeRegExp(literal)}(?![\\p{L}\\p{M}\\p{N}])`, "giu");
}

/**
 * The user's own phone however it's written: any spaces, dashes, dots or brackets between
 * digits, with or without +91, (+91), 91 or 0 in front. Only the last 10 digits are needed.
 */
function knownPhonePattern(phone: string): RegExp | null {
  const digits = phone.replace(/\D/g, "").slice(-10);
  if (digits.length < MIN_KNOWN_PHONE_DIGITS) return null;
  const body = [...digits].join(SEPARATORS);
  return new RegExp(`(?<!\\d)(?:\\(?\\+?91\\)?${SEPARATORS}|0${SEPARATORS})?${body}(?!\\d)`, "g");
}

/**
 * The full name first, then each part of MIN_NAME_PART letters or more, longest first, so
 * "Rahul here" is caught when the name is "Rahul Deshmukh". This over-redacts on purpose: a
 * name part that's also a locality or an ordinary word ("Ram" in "Ram Nagar") is masked too.
 * Losing a locality in a transcript is cheaper than leaking a name.
 */
function nameParts(name: string): string[] {
  const full = name.trim();
  if (!full) return [];
  const parts = full.split(/[^\p{L}\p{M}]+/u).filter((p) => [...p].length >= MIN_NAME_PART);
  return [...new Set([full, ...parts])].sort((a, b) => b.length - a.length);
}

/**
 * Masks the user's own name, email and phone, plus any email or Indian phone number found by
 * pattern (the same detection the prefilter uses). Prices and areas are left alone.
 */
export function redact(text: string, known?: ContactValue): string {
  let out = text;
  const email = known?.email.trim();
  if (email) out = out.replace(new RegExp(escapeRegExp(email), "gi"), EMAIL_TOKEN);
  out = out.replace(new RegExp(EMAIL.source, "gi"), EMAIL_TOKEN);

  const phone = known && knownPhonePattern(known.phone);
  if (phone) out = out.replace(phone, PHONE);
  out = out.replace(DIGIT_RUN, (run) => (isPhone(run) ? PHONE : run));

  for (const part of nameParts(known?.name ?? "")) out = out.replace(wholeWord(part), NAME);
  return out;
}
