import type { AreaFailure, PriceFailure } from "@/lib/parsers";

/** Bot replies for parsed answers. Every parser failure reason has a re-ask with an example. */

export const priceRetry: Record<PriceFailure, string> = {
  empty: "Please type the price, like 45 lakh.",
  no_number: "I need a number for the price, like 45 lakh or 25,000.",
  range: "Please give one number, like 45 lakh.",
  not_positive: "The price has to be more than zero, like 45 lakh.",
  too_large: "That looks too high. Please check it, like 45 lakh or 1.2 crore.",
  unrecognized: "I couldn't read that price. Try something like 45 lakh, 1.2 crore or 25,000.",
};

export const areaRetry: Record<AreaFailure, string> = {
  empty: "Please type the area, like 1200 sq ft.",
  not_positive: "The area has to be more than zero, like 1200 sq ft.",
  unrecognized: "Please type just the number in sq ft, without commas, like 1200 or 1200 sq ft.",
};

/** rent_high: rent over ₹10 lakh a month. sell_low: sale price under ₹1 lakh. */
export type PriceSanity = "rent_high" | "sell_low";

/** The confirm question for a parsed price. Rent amounts are monthly. */
export function priceConfirm(
  display: string,
  listingtype: string | undefined,
  sanity: PriceSanity | null,
): string {
  if (sanity === "sell_low") return `That’s ${display} for a sale. Is that right?`;
  if (sanity === "rent_high") return `That’s ${display} a month for rent. Is that right?`;
  return listingtype === "rent"
    ? `That’s ${display} a month, correct?`
    : `That’s ${display}, correct?`;
}

export const priceChange = "No problem. What should the price be?";
