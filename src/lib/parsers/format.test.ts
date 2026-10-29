import { describe, expect, it } from "vitest";
import { formatINR } from "./format";

const cases: [input: number, expected: string][] = [
  [0, "₹0"],
  [5, "₹5"],
  [999, "₹999"],
  [1_000, "₹1,000"],
  [25_000, "₹25,000"],
  [100_000, "₹1,00,000"],
  [4_500_000, "₹45,00,000"],
  [12_345_678, "₹1,23,45,678"],
  [10_000_000_000, "₹10,00,00,00,000"],
];

describe("formatINR", () => {
  it.each(cases)("%d → %s", (input, expected) => {
    expect(formatINR(input)).toBe(expected);
  });
});
