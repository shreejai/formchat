import type { AnswerValue, ContactValue, Question } from "@/forms/types";

/** A short, human-readable version of an answer for chat bubbles and the review screen. */
export function formatAnswer(question: Question, value: AnswerValue): string {
  if (value === null) return "Skipped";
  if (Array.isArray(value)) {
    return value.length === 1 ? "1 image" : `${value.length} images`;
  }
  if (typeof value === "object") {
    const { name, phone, email } = value as ContactValue;
    return [name, phone, email].join(" · ");
  }
  const option = question.options?.find((o) => o.value === value);
  return option ? option.label : String(value);
}
