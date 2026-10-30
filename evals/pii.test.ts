import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ContactValue } from "@/forms/types";
import { redact } from "@/lib/pii";
import { parseJsonl } from "./score";

/** Deterministic, so it runs in `npm run test` (no model calls). The target is 100%. */
type PiiCase = { id: string; text: string; known?: ContactValue; expected: string };

const cases = parseJsonl<PiiCase>(readFileSync(new URL("./pii.jsonl", import.meta.url), "utf8"));

describe("pii eval set", () => {
  it("has about 20 cases", () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  it.each(cases.map((c) => [c.id, c] as const))("%s", (_, c) => {
    expect(redact(c.text, c.known)).toBe(c.expected);
  });
});
