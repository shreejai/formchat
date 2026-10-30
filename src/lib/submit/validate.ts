import "server-only";
import { validateContact } from "@/components/chat/contact";
import type { AnswerValue, Answers, ContactValue, FormSchema, Question } from "@/forms/types";
import { getNextStep, pruneAnswers } from "@/lib/flow";
import { parseArea, parsePrice } from "@/lib/parsers";

const MAX_TEXT = 200;
const MAX_HTML = 20_000;
const MAX_IMAGES = 20;

export type AnswersCheck =
  | { ok: true; answers: Answers }
  | { ok: false; reason: "incomplete" | `invalid:${string}` };

const isString = (v: unknown): v is string => typeof v === "string";
const shortText = (v: unknown, max = MAX_TEXT) => isString(v) && v.trim() !== "" && v.length <= max;

function isContact(v: unknown): v is ContactValue {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const c = v as Record<string, unknown>;
  return (
    shortText(c.name) &&
    shortText(c.email) &&
    shortText(c.phone) &&
    Object.keys(validateContact(c as ContactValue)).length === 0
  );
}

/**
 * Prices and areas are stored as the parser's own output (a plain number string), so anything
 * the parser wouldn't have produced, like "012", "4.5e6" or a number, is rejected.
 */
function isCanonical(v: unknown, parse: typeof parsePrice | typeof parseArea): boolean {
  if (!isString(v)) return false;
  const parsed = parse(v);
  return parsed.ok && String(parsed.value) === v;
}

function isValidValue(q: Question, v: AnswerValue): boolean {
  // pruneAnswers already turned a skip into the default; a null is only allowed when optional.
  if (v === null) return !q.required;
  switch (q.kind) {
    case "buttons":
      return isString(v) && (q.options ?? []).some((o) => o.value === v);
    case "text":
    case "location":
      return shortText(v);
    case "price":
      return isCanonical(v, parsePrice);
    case "number":
      return isCanonical(v, parseArea);
    case "longtext":
      return shortText(v, MAX_HTML);
    case "upload":
      return Array.isArray(v) && v.length <= MAX_IMAGES && v.every((f) => shortText(f));
    case "contact":
      return isContact(v);
  }
}

/**
 * Never trusts the client: the flow engine re-runs here, so hidden or unknown answers are
 * dropped, every required question must be answered, and each kept value must be one the
 * chat could have produced.
 */
export function validateAnswers(schema: FormSchema, raw: Record<string, unknown>): AnswersCheck {
  const answers = pruneAnswers(schema, raw as Answers);
  for (const q of schema.sections.flatMap((s) => s.questions)) {
    if (Object.hasOwn(answers, q.key) && !isValidValue(q, answers[q.key])) {
      return { ok: false, reason: `invalid:${q.key}` };
    }
  }
  if (getNextStep(schema, answers).status !== "complete") return { ok: false, reason: "incomplete" };
  return { ok: true, answers };
}
