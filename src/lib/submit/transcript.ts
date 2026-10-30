import "server-only";
import { formatAnswer } from "@/components/chat/format";
import type { Answers, ContactValue, FormSchema } from "@/forms/types";
import type { Turn } from "@/lib/db/outbox";
import { redact, REDACTED_CONTACT } from "@/lib/pii";
import { clip, MAX_ATTEMPT_TEXT, MAX_ATTEMPTS_STORED, type Attempt } from "./shared";

const MAX_KEY = 64;
/** e.g. "reask", "blocked", "reask:range". */
const OUTCOME = /^[a-z_]{1,32}(?::[a-z_]{1,32})?$/;

export function contactOf(schema: FormSchema, answers: Answers): ContactValue | undefined {
  const q = schema.sections.flatMap((s) => s.questions).find((x) => x.kind === "contact");
  const value = q && answers[q.key];
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

/**
 * The conversation as asked and answered, rebuilt from validated answers: the question label,
 * then the answer as the chat showed it, redacted. The contact turn is fixed placeholders.
 */
export function buildTurns(schema: FormSchema, answers: Answers): Turn[] {
  const contact = contactOf(schema, answers);
  return schema.sections
    .flatMap((s) => s.questions)
    .filter((q) => Object.hasOwn(answers, q.key))
    .flatMap((q): Turn[] => [
      { role: "bot", key: q.key, text: q.label },
      {
        role: "user",
        key: q.key,
        text: q.kind === "contact" ? REDACTED_CONTACT : redact(formatAnswer(q, answers[q.key]), contact),
      },
    ]);
}

function isAttempt(v: unknown): v is Attempt {
  if (typeof v !== "object" || v === null) return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.key === "string" &&
    a.key.length <= MAX_KEY &&
    typeof a.text === "string" &&
    typeof a.outcome === "string" &&
    OUTCOME.test(a.outcome)
  );
}

/**
 * Client-reported re-asked or rejected inputs. Untrusted and for analysis only: malformed
 * entries are dropped, the rest capped and redacted. Nothing in the app reads them back.
 */
export function cleanAttempts(raw: unknown, contact: ContactValue | undefined): Attempt[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isAttempt)
    .slice(0, MAX_ATTEMPTS_STORED)
    .map((a) => ({
      key: a.key,
      outcome: a.outcome,
      text: redact(clip(a.text, MAX_ATTEMPT_TEXT), contact),
    }));
}
