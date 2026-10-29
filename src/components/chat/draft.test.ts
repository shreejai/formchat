import { describe, expect, it } from "vitest";
import type { Question } from "@/forms/types";
import { nagpurhomes } from "@/forms/nagpurhomes";
import { initialDraft } from "./draft";

const q = (key: string): Question => {
  const found = nagpurhomes.sections.flatMap((s) => s.questions).find((x) => x.key === key);
  if (!found) throw new Error(key);
  return found;
};

describe("initialDraft", () => {
  it("puts a rejected description back in the box, not the old answer", () => {
    const typed = "2 BHK in Dharampeth, call 9876543210";
    expect(initialDraft(q("pdesc"), undefined, typed)).toBe(typed);
    expect(initialDraft(q("pdesc"), "<p>Old description</p>", typed)).toBe(typed);
  });

  it("otherwise starts from the current answer, descriptions as plain text", () => {
    expect(initialDraft(q("pdesc"), "<p>Nice &lt;b&gt;flat&lt;/b&gt;</p>")).toBe("Nice <b>flat</b>");
    expect(initialDraft(q("loc"), "Dharampeth")).toBe("Dharampeth");
    expect(initialDraft(q("pdesc"), undefined)).toBe("");
  });
});
