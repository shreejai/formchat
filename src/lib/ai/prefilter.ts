import "server-only";

export const MIN_DESCRIPTION_LENGTH = 20;
export const MAX_DESCRIPTION_LENGTH = 2000;

export type PrefilterFailure = "empty" | "too_short" | "too_long" | "no_letters" | "contact_details";

export type PrefilterResult = { ok: true; text: string } | { ok: false; reason: PrefilterFailure };

/** Digit runs that may be split by spaces, dashes, dots or brackets, e.g. "+91 98765-43210". */
const DIGIT_RUN = /\+?\d[\d\s\-.()]*\d/g;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;

/**
 * Indian phone numbers: a 10-digit mobile (starts 6–9), optionally after 0 or 91, and
 * landlines written with a leading 0 (e.g. 0712 2345678). Commas aren't separators, so
 * prices like 45,00,000 never join into one run.
 */
function isPhone(run: string): boolean {
  const digits = run.replace(/\D/g, "");
  if (digits.length === 10) return /^[6-9]/.test(digits);
  if (digits.length === 11) return digits.startsWith("0");
  if (digits.length === 12) return digits.startsWith("91");
  return false;
}

export function hasContactDetails(text: string): boolean {
  if (EMAIL.test(text)) return true;
  return (text.match(DIGIT_RUN) ?? []).some(isPhone);
}

/** Free checks before any model call. Length is counted in characters, not UTF-16 units. */
export function prefilter(input: string): PrefilterResult {
  const text = input.trim();
  const length = [...text].length;
  if (length === 0) return { ok: false, reason: "empty" };
  if (length < MIN_DESCRIPTION_LENGTH) return { ok: false, reason: "too_short" };
  if (length > MAX_DESCRIPTION_LENGTH) return { ok: false, reason: "too_long" };
  if (!/\p{L}/u.test(text)) return { ok: false, reason: "no_letters" };
  if (hasContactDetails(text)) return { ok: false, reason: "contact_details" };
  return { ok: true, text };
}
