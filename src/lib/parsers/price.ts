import { formatINR } from "./format";

export type PriceFailure =
  | "empty"
  | "no_number"
  | "range"
  | "not_positive"
  | "too_large"
  | "unrecognized";

export type PriceResult =
  | { ok: true; value: number; display: string }
  | { ok: false; reason: PriceFailure };

const LAKH = 100_000;
const CRORE = 10_000_000;
/** Anything above ₹1,000 crore is treated as a typo. */
export const MAX_PRICE = 1_000 * CRORE;

const UNIT_MULTIPLIER: Record<string, number> = {
  k: 1_000,
  l: LAKH,
  lac: LAKH,
  lacs: LAKH,
  lakh: LAKH,
  lakhs: LAKH,
  cr: CRORE,
  crore: CRORE,
  crores: CRORE,
};

const CURRENCY = String.raw`(?:₹|rs\.?|inr)`;
const PRICE = new RegExp(
  String.raw`^${CURRENCY}?\s*(-)?\s*(\d[\d,]*)(?:\.(\d+))?\s*` +
    String.raw`(k|lakhs?|lacs?|l|crores?|cr)?\s*` +
    String.raw`(?:\/\s*(?:month|mo)|per\s+month|pm)?$`,
);
// A number, an optional unit word, a separator, then another number.
const RANGE = new RegExp(
  String.raw`\d\s*(?:[a-z]+\s*)?(?:-|–|—|\bto\b|\band\b)\s*${CURRENCY}?\s*\d`,
);
// Indian: 1,23,45,678. Western: 12,345,678. The last group is always 3 digits.
const INDIAN_GROUPING = /^\d{1,2}(?:,\d{2})*,\d{3}$/;
const WESTERN_GROUPING = /^\d{1,3}(?:,\d{3})+$/;

function hasValidGrouping(integer: string): boolean {
  if (!integer.includes(",")) return true;
  return INDIAN_GROUPING.test(integer) || WESTERN_GROUPING.test(integer);
}

/**
 * Parses a single rupee amount such as "45 lakh", "1.2 cr", "₹45,00,000" or
 * "25k/month". The value is rounded to whole rupees; a monthly suffix is dropped.
 */
export function parsePrice(input: string): PriceResult {
  const text = input.trim().toLowerCase();
  if (text === "") return { ok: false, reason: "empty" };
  if (!/\d/.test(text)) return { ok: false, reason: "no_number" };
  if (RANGE.test(text)) return { ok: false, reason: "range" };

  const match = PRICE.exec(text);
  if (!match) return { ok: false, reason: "unrecognized" };
  const [, minus, integer, fraction, unit] = match;
  if (!hasValidGrouping(integer)) return { ok: false, reason: "unrecognized" };

  const amount = Number(`${integer.replaceAll(",", "")}.${fraction ?? "0"}`);
  const value = Math.round(amount * (unit ? UNIT_MULTIPLIER[unit] : 1));
  if (minus || value <= 0) return { ok: false, reason: "not_positive" };
  if (value > MAX_PRICE) return { ok: false, reason: "too_large" };

  return { ok: true, value, display: formatINR(value) };
}
