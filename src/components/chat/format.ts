import type { AnswerValue, ContactValue, Question } from "@/forms/types";
import { paragraphHtmlToText } from "@/lib/html";
import { formatINR } from "@/lib/parsers";

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
  // Prices and areas are stored as plain number strings, e.g. "4500000" and "1200".
  if (question.kind === "price" && /^\d+$/.test(String(value))) return formatINR(Number(value));
  if (question.kind === "number") return `${value} sq ft`;
  // Descriptions are stored as escaped paragraph HTML; show them as plain text.
  if (question.kind === "longtext") return paragraphHtmlToText(String(value));
  const option = question.options?.find((o) => o.value === value);
  return option ? option.label : String(value);
}
