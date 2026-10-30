import "server-only";

/** Digit runs that may be split by spaces, dashes, dots or brackets, e.g. "+91 98765-43210". */
export const DIGIT_RUN = /\+?\d[\d\s\-.()]*\d/g;
export const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
/**
 * Two round amounts joined by a dash or spaces, e.g. a rent range "75000-80000". Their digits
 * would otherwise read as a 10-digit mobile. A phone split 5-5 with both halves ending in 00 is
 * missed; that's rare, and the listing is still moderated.
 */
const AMOUNT_RANGE = /^(\d{3,6}00)\s*-?\s*(\d{3,6}00)$/;

/**
 * Indian phone numbers: a 10-digit mobile (starts 6–9), optionally after 0 or 91, and
 * landlines written with a leading 0 (e.g. 0712 2345678). Commas aren't separators, so
 * prices like 45,00,000 never join into one run.
 */
export function isPhone(run: string): boolean {
  if (AMOUNT_RANGE.test(run.trim())) return false;
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
