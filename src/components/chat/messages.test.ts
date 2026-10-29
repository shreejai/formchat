import { describe, expect, it } from "vitest";
import { areaRetry, priceRetry } from "./messages";

describe("re-ask messages", () => {
  it.each(Object.entries(priceRetry))("price %s has an example", (_, message) => {
    expect(message).toMatch(/like \d/);
  });

  it.each(Object.entries(areaRetry))("area %s has an example", (_, message) => {
    expect(message).toMatch(/like \d/);
  });
});
