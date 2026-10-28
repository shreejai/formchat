import type { Answers, Question } from "@/forms/types";

/**
 * A question with no showIf is always visible. A condition only matches a string
 * answer, so a missing or null referenced answer hides the question.
 */
export function isVisible(question: Question, answers: Answers): boolean {
  const cond = question.showIf;
  if (!cond) return true;
  const value = answers[cond.key];
  if (typeof value !== "string") return false;
  return "in" in cond ? cond.in.includes(value) : !cond.notIn.includes(value);
}
