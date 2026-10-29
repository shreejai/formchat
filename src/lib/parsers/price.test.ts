import { describe, expect, it } from "vitest";
import { parsePrice, type PriceFailure } from "./price";

const accepted: [input: string, value: number, display: string][] = [
  // Lakh spellings
  ["45 lakh", 4_500_000, "₹45,00,000"],
  ["45L", 4_500_000, "₹45,00,000"],
  ["45l", 4_500_000, "₹45,00,000"],
  ["45 lac", 4_500_000, "₹45,00,000"],
  ["45 lacs", 4_500_000, "₹45,00,000"],
  ["45 lakhs", 4_500_000, "₹45,00,000"],
  ["45 LAKH", 4_500_000, "₹45,00,000"],
  ["12.5 lakh", 1_250_000, "₹12,50,000"],
  // Crore spellings
  ["1.2 cr", 12_000_000, "₹1,20,00,000"],
  ["1.2 crore", 12_000_000, "₹1,20,00,000"],
  ["2 crores", 20_000_000, "₹2,00,00,000"],
  ["1.2Cr", 12_000_000, "₹1,20,00,000"],
  // Thousands
  ["25k", 25_000, "₹25,000"],
  ["25K", 25_000, "₹25,000"],
  // Plain rupees, with and without currency prefix
  ["4500000", 4_500_000, "₹45,00,000"],
  ["₹45,00,000", 4_500_000, "₹45,00,000"],
  ["₹ 45,00,000", 4_500_000, "₹45,00,000"],
  ["Rs 45 lakh", 4_500_000, "₹45,00,000"],
  ["Rs. 45 lakh", 4_500_000, "₹45,00,000"],
  ["INR 4500000", 4_500_000, "₹45,00,000"],
  ["999", 999, "₹999"],
  // Valid comma grouping: Indian and Western
  ["1,23,45,678", 12_345_678, "₹1,23,45,678"],
  ["4,500,000", 4_500_000, "₹45,00,000"],
  ["1,000", 1_000, "₹1,000"],
  ["12,345.50", 12_346, "₹12,346"],
  // Monthly suffix is accepted and dropped
  ["25,000 per month", 25_000, "₹25,000"],
  ["₹ 25k/month", 25_000, "₹25,000"],
  ["25k / month", 25_000, "₹25,000"],
  ["25000/mo", 25_000, "₹25,000"],
  ["25000 pm", 25_000, "₹25,000"],
  // Whitespace and rounding to whole rupees
  ["  45   lakh  ", 4_500_000, "₹45,00,000"],
  ["1.234567 lakh", 123_457, "₹1,23,457"],
  // Upper bound is inclusive
  ["1000 cr", 10_000_000_000, "₹10,00,00,00,000"],
];

const rejected: [input: string, reason: PriceFailure][] = [
  ["", "empty"],
  ["   ", "empty"],
  ["lakh", "no_number"],
  ["around fifty lakh", "no_number"],
  ["₹", "no_number"],
  ["0", "not_positive"],
  ["0 lakh", "not_positive"],
  ["0.00 cr", "not_positive"],
  ["0.4", "not_positive"],
  ["-45 lakh", "not_positive"],
  ["₹ -45,00,000", "not_positive"],
  ["40-45 lakh", "range"],
  ["40 - 45 lakh", "range"],
  ["40–45 lakh", "range"],
  ["40 to 45 lakh", "range"],
  ["40 lakh to 45 lakh", "range"],
  ["40 lakh - 45 lakh", "range"],
  ["between 40 and 45 lakh", "range"],
  ["1001 cr", "too_large"],
  ["10,00,00,00,001", "too_large"],
  // Invalid comma grouping must not silently merge digits
  ["1,5 cr", "unrecognized"],
  ["45,00", "unrecognized"],
  ["4,50,0000", "unrecognized"],
  ["100,00,000", "unrecognized"],
  ["45,,000", "unrecognized"],
  [",45,000", "unrecognized"],
  ["45,000,", "unrecognized"],
  ["4,50,000,000", "unrecognized"],
  // Strict grammar: extra words or unknown units
  ["around 45 lakh", "unrecognized"],
  ["45 lakh negotiable", "unrecognized"],
  ["45 million", "unrecognized"],
  ["45 lakh per year", "unrecognized"],
  ["45.5.5 lakh", "unrecognized"],
  [".5 cr", "unrecognized"],
  ["45 lakh 20k", "unrecognized"],
];

describe("parsePrice", () => {
  it.each(accepted)("%j → %d (%s)", (input, value, display) => {
    expect(parsePrice(input)).toEqual({ ok: true, value, display });
  });

  it.each(rejected)("%j → %s", (input, reason) => {
    expect(parsePrice(input)).toEqual({ ok: false, reason });
  });
});
