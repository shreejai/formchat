import type { AnswerValue, Question } from "@/forms/types";
import { paragraphHtmlToText } from "@/lib/html";

/**
 * What a typed-answer box starts with. A description the server didn't accept comes back so
 * the user can fix it (e.g. remove a phone number) instead of retyping it; otherwise it's the
 * current answer when editing.
 */
export function initialDraft(question: Question, current: AnswerValue | undefined, rejected?: string): string {
  if (rejected !== undefined) return rejected;
  if (typeof current !== "string") return "";
  // Descriptions are stored as escaped paragraph HTML.
  return question.kind === "longtext" ? paragraphHtmlToText(current) : current;
}
