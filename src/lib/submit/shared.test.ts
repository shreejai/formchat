import { describe, expect, it } from "vitest";
import { clip } from "./shared";

describe("clip", () => {
  it("returns text within the limit unchanged", () => {
    expect(clip("abc", 3)).toBe("abc");
  });

  it("cuts to the limit in UTF-16 units", () => {
    expect(clip("abcdef", 4)).toBe("abcd");
  });

  it("drops a surrogate pair that wouldn't fit instead of splitting it", () => {
    expect(clip("ab🏠", 3)).toBe("ab");
    expect(clip("ab🏠", 4)).toBe("ab🏠");
  });
});
