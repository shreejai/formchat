import { describe, expect, it } from "vitest";
import { parseArea, type AreaFailure } from "./area";

const accepted: [input: string, value: number][] = [
  ["1200", 1200],
  ["1200.5", 1200.5],
  ["0.5", 0.5],
  ["1200 sq ft", 1200],
  ["1200 sqft", 1200],
  ["1200sqft", 1200],
  ["1200 SQ FT", 1200],
  ["1200.75 Sqft", 1200.75],
  ["  1200  ", 1200],
];

const rejected: [input: string, reason: AreaFailure][] = [
  ["", "empty"],
  ["  ", "empty"],
  ["0", "not_positive"],
  ["0.0 sqft", "not_positive"],
  ["1,200", "unrecognized"],
  ["1200.5.5", "unrecognized"],
  [".5", "unrecognized"],
  ["5.", "unrecognized"],
  ["-1200", "unrecognized"],
  ["1200 sq m", "unrecognized"],
  ["1200 sq. ft", "unrecognized"],
  ["sqft", "unrecognized"],
  ["about 1200", "unrecognized"],
  ["1200 sqft approx", "unrecognized"],
  ["1200-1500", "unrecognized"],
  ["twelve hundred", "unrecognized"],
];

describe("parseArea", () => {
  it.each(accepted)("%j → %d", (input, value) => {
    expect(parseArea(input)).toEqual({ ok: true, value });
  });

  it.each(rejected)("%j → %s", (input, reason) => {
    expect(parseArea(input)).toEqual({ ok: false, reason });
  });
});
