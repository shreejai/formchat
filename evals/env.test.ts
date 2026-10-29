import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { missingEnv, REQUIRED_EVAL_ENV } from "./env";

describe("missingEnv", () => {
  it("names unset and empty variables", () => {
    expect(missingEnv({ A: "x", B: "", C: "  " }, ["A", "B", "C", "D"])).toEqual(["B", "C", "D"]);
    expect(missingEnv({ A: "x" }, ["A"])).toEqual([]);
  });
});

describe("evals workflow", () => {
  const workflow = readFileSync(new URL("../.github/workflows/evals.yml", import.meta.url), "utf8");

  // CI only had OPENAI_API_KEY, so every model call failed on a missing model name.
  it.each(REQUIRED_EVAL_ENV)("passes %s to the eval job", (name) => {
    const source = name === "OPENAI_API_KEY" ? "secrets" : "vars";
    expect(workflow).toContain(`${name}: \${{ ${source}.${name} }}`);
  });
});
