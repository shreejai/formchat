import { describe, expect, it } from "vitest";
import type { Answers, FormSchema, Question } from "@/forms/types";
import { nagpurhomes } from "@/forms/nagpurhomes";
import { isVisible } from "./conditions";
import {
  getNextStep,
  isAnswered,
  pruneAnswers,
  skipValue,
  validateSchema,
} from "./engine";

const yesNo = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

// Small generic schema: 2 sections, an `in` rule, a `notIn` rule and a default.
const schema: FormSchema = {
  id: "test",
  sections: [
    {
      id: "a",
      title: "A",
      questions: [
        { key: "kind", label: "Kind", kind: "buttons", required: true, options: yesNo },
        {
          key: "detail",
          label: "Detail",
          kind: "text",
          required: false,
          showIf: { key: "kind", in: ["yes"] },
        },
      ],
    },
    {
      id: "b",
      title: "B",
      questions: [
        {
          key: "mode",
          label: "Mode",
          kind: "buttons",
          required: false,
          defaultValue: "no",
          options: yesNo,
        },
        {
          key: "extra",
          label: "Extra",
          kind: "number",
          required: false,
          showIf: { key: "mode", notIn: ["no"] },
        },
        { key: "name", label: "Name", kind: "text", required: true },
      ],
    },
  ],
};

function nextKey(answers: Answers): string | undefined {
  const step = getNextStep(schema, answers);
  return step.status === "question" ? step.question.key : undefined;
}

describe("isVisible", () => {
  const q = (showIf: Question["showIf"]): Question => ({
    key: "x",
    label: "X",
    kind: "text",
    required: false,
    showIf,
  });

  it("is visible with no showIf", () => {
    expect(isVisible(q(undefined), {})).toBe(true);
  });
  it("matches `in`", () => {
    expect(isVisible(q({ key: "k", in: ["a"] }), { k: "a" })).toBe(true);
    expect(isVisible(q({ key: "k", in: ["a"] }), { k: "b" })).toBe(false);
  });
  it("matches `notIn`", () => {
    expect(isVisible(q({ key: "k", notIn: ["a"] }), { k: "b" })).toBe(true);
    expect(isVisible(q({ key: "k", notIn: ["a"] }), { k: "a" })).toBe(false);
  });
  it("hides when the referenced answer is missing, null or not a string", () => {
    expect(isVisible(q({ key: "k", notIn: ["a"] }), {})).toBe(false);
    expect(isVisible(q({ key: "k", notIn: ["a"] }), { k: null })).toBe(false);
    expect(isVisible(q({ key: "k", notIn: ["a"] }), { k: 3 })).toBe(false);
  });
});

describe("skipValue / isAnswered", () => {
  const [kind, detail] = schema.sections[0].questions;
  const mode = schema.sections[1].questions[0];

  it("skipValue returns the default, or null when there is none", () => {
    expect(skipValue(mode)).toBe("no");
    expect(skipValue(detail)).toBeNull();
  });
  it("a missing key is unanswered", () => {
    expect(isAnswered(kind, {})).toBe(false);
  });
  it("null answers an optional question but not a required one", () => {
    expect(isAnswered(detail, { detail: null })).toBe(true);
    expect(isAnswered(kind, { kind: null })).toBe(false);
  });
});

describe("getNextStep", () => {
  it("starts at the first question of section 1", () => {
    const step = getNextStep(schema, {});
    expect(step.status).toBe("question");
    if (step.status !== "question") return;
    expect(step.question.key).toBe("kind");
    expect(step.section).toEqual({ id: "a", title: "A", index: 0, number: 1, total: 2 });
    // detail and extra are hidden while their conditions are unmet
    expect(step.progress).toEqual({ answered: 0, total: 3 });
  });

  it("walks questions in order, then moves to the next section", () => {
    expect(nextKey({ kind: "yes" })).toBe("detail");
    const step = getNextStep(schema, { kind: "yes", detail: "d" });
    expect(step.status === "question" && step.question.key).toBe("mode");
    expect(step.status === "question" && step.section.number).toBe(2);
  });

  it("skips hidden questions", () => {
    expect(nextKey({ kind: "no" })).toBe("mode");
  });

  it("moves past an optional question skipped with null", () => {
    expect(nextKey({ kind: "yes", detail: null })).toBe("mode");
  });

  it("asks a required question again when its answer is null", () => {
    expect(nextKey({ kind: null })).toBe("kind");
  });

  it("a skipped question with a default stores the default and hides its dependants", () => {
    const step = getNextStep(schema, { kind: "no", mode: null });
    expect(step.answers.mode).toBe("no");
    expect(step.status === "question" && step.question.key).toBe("name");
  });

  it("asks the notIn-dependent question when the condition holds", () => {
    expect(nextKey({ kind: "no", mode: "yes" })).toBe("extra");
  });

  it("returns complete when every visible question is answered", () => {
    const step = getNextStep(schema, { kind: "no", mode: "no", name: "N" });
    expect(step).toEqual({
      status: "complete",
      progress: { answered: 3, total: 3 },
      answers: { kind: "no", mode: "no", name: "N" },
    });
  });

  it("progress total grows and shrinks with visibility", () => {
    expect(getNextStep(schema, { kind: "no" }).progress.total).toBe(3);
    expect(getNextStep(schema, { kind: "yes" }).progress.total).toBe(4);
    expect(getNextStep(schema, { kind: "yes", mode: "yes" }).progress.total).toBe(5);
  });

  it("returns pruned answers", () => {
    const step = getNextStep(schema, { kind: "no", detail: "stale" });
    expect(step.answers).toEqual({ kind: "no" });
  });
});

describe("pruneAnswers (stale answers)", () => {
  const base = {
    usertype: "owner",
    listingtype: "sell",
    loc: "Dharampeth",
    areatype: "area",
    areatxt: 1200,
    amount: "50 lakh",
  };

  it("drops beds and bath when ptype changes from residential to plot", () => {
    const before = { ...base, ptype: "residential", beds: "3", bath: "2" };
    const after = pruneAnswers(nagpurhomes, { ...before, ptype: "plot" });
    expect(after).not.toHaveProperty("beds");
    expect(after).not.toHaveProperty("bath");
    expect(after).toMatchObject({ ...base, ptype: "plot" });
  });

  it("drops beds but keeps bath when ptype changes from residential to commercial", () => {
    const after = pruneAnswers(nagpurhomes, {
      ...base,
      ptype: "commercial",
      beds: "3",
      bath: "2",
    });
    expect(after).not.toHaveProperty("beds");
    expect(after.bath).toBe("2");
  });

  it("asks beds again after switching back to residential", () => {
    const answers = pruneAnswers(nagpurhomes, { ...base, ptype: "plot", beds: "3" });
    const step = getNextStep(nagpurhomes, { ...answers, ptype: "residential" });
    expect(step.status === "question" && step.question.key).toBe("beds");
  });

  it("drops areatxt when areatype changes to unknown", () => {
    const after = pruneAnswers(nagpurhomes, { ...base, ptype: "plot", areatype: "unknown" });
    expect(after).not.toHaveProperty("areatxt");
  });

  it("cascades: dropping an upstream answer drops the answers that depend on it", () => {
    const after = pruneAnswers(schema, { kind: "yes", detail: "d", mode: "yes", extra: 5 });
    expect(after).toEqual({ kind: "yes", detail: "d", mode: "yes", extra: 5 });
    // Removing `mode` hides `extra`.
    expect(pruneAnswers(schema, { kind: "yes", extra: 5 })).toEqual({ kind: "yes" });
  });

  it("turns null into the default for questions that have one", () => {
    expect(pruneAnswers(schema, { mode: null, extra: 5 })).toEqual({ mode: "no" });
  });

  it("keeps null for optional questions without a default", () => {
    expect(pruneAnswers(schema, { kind: "yes", detail: null })).toEqual({
      kind: "yes",
      detail: null,
    });
  });

  it("drops keys that are not in the schema", () => {
    expect(pruneAnswers(schema, { kind: "no", bogus: "x" })).toEqual({ kind: "no" });
  });

  it("does not mutate its input", () => {
    const input = { kind: "no", detail: "stale", mode: null };
    const copy = structuredClone(input);
    pruneAnswers(schema, input);
    expect(input).toEqual(copy);
  });
});

describe("validateSchema", () => {
  const withQuestions = (...questions: Question[]): FormSchema => ({
    id: "v",
    sections: [{ id: "s", title: "S", questions }],
  });
  const text = (key: string, extra: Partial<Question> = {}): Question => ({
    key,
    label: key,
    kind: "text",
    required: false,
    ...extra,
  });

  it("accepts the test schema and nagpurhomes", () => {
    expect(() => validateSchema(schema)).not.toThrow();
    expect(() => validateSchema(nagpurhomes)).not.toThrow();
  });

  it("rejects duplicate keys", () => {
    expect(() => validateSchema(withQuestions(text("a"), text("a")))).toThrow(/Duplicate/);
  });

  it("rejects a showIf that references a later or unknown key", () => {
    const later = withQuestions(text("a", { showIf: { key: "b", in: ["x"] } }), text("b"));
    expect(() => validateSchema(later)).toThrow(/not an earlier question/);
    const unknown = withQuestions(text("a", { showIf: { key: "zzz", in: ["x"] } }));
    expect(() => validateSchema(unknown)).toThrow(/not an earlier question/);
  });

  it("rejects a buttons question with no options", () => {
    expect(() => validateSchema(withQuestions(text("a", { kind: "buttons" })))).toThrow(
      /no options/,
    );
    expect(() =>
      validateSchema(withQuestions(text("a", { kind: "buttons", options: [] }))),
    ).toThrow(/no options/);
  });

  it("rejects a defaultValue on a required question", () => {
    const q = text("a", { required: true, defaultValue: "x" });
    expect(() => validateSchema(withQuestions(q))).toThrow(/Required question "a"/);
  });

  it("rejects a defaultValue that is not one of the options", () => {
    const q = text("a", { kind: "buttons", options: yesNo, defaultValue: "maybe" });
    expect(() => validateSchema(withQuestions(q))).toThrow(/not one of its options/);
  });
});
