import type { AnswerValue, Answers, FormSchema, Question } from "@/forms/types";
import { isVisible } from "./conditions";

export type SectionPosition = {
  id: string;
  title: string;
  /** 0-based index. */
  index: number;
  /** 1-based, for "section 2 of 4". */
  number: number;
  total: number;
};

/** Counts visible questions only. */
export type Progress = { answered: number; total: number };

export type NextStep =
  | {
      status: "question";
      question: Question;
      section: SectionPosition;
      progress: Progress;
      answers: Answers;
    }
  | { status: "complete"; progress: Progress; answers: Answers };

function allQuestions(schema: FormSchema): Question[] {
  return schema.sections.flatMap((s) => s.questions);
}

/** The value to store when the user skips a question. */
export function skipValue(question: Question): AnswerValue {
  return question.defaultValue ?? null;
}

/**
 * Keeps only answers to questions that are currently visible, walking in schema
 * order. Conditions only look at earlier questions, so one pass also handles
 * cascades: if an upstream answer is dropped, answers that depend on it are dropped too.
 * A null answer to a question with a default becomes that default. Keys
 * that aren't in the schema are dropped. The input is not mutated.
 */
export function pruneAnswers(schema: FormSchema, answers: Answers): Answers {
  const kept: Record<string, AnswerValue> = {};
  for (const q of allQuestions(schema)) {
    if (!Object.hasOwn(answers, q.key) || !isVisible(q, kept)) continue;
    const value = answers[q.key];
    kept[q.key] = value === null ? skipValue(q) : value;
  }
  return kept;
}

/** A required question with a null answer has not been answered. */
export function isAnswered(question: Question, answers: Answers): boolean {
  if (!Object.hasOwn(answers, question.key)) return false;
  return answers[question.key] !== null || !question.required;
}

export function getNextStep(schema: FormSchema, rawAnswers: Answers): NextStep {
  const answers = pruneAnswers(schema, rawAnswers);
  const visible = allQuestions(schema).filter((q) => isVisible(q, answers));
  const progress: Progress = {
    answered: visible.filter((q) => isAnswered(q, answers)).length,
    total: visible.length,
  };

  for (const [index, section] of schema.sections.entries()) {
    for (const question of section.questions) {
      if (!isVisible(question, answers) || isAnswered(question, answers)) continue;
      return {
        status: "question",
        question,
        section: {
          id: section.id,
          title: section.title,
          index,
          number: index + 1,
          total: schema.sections.length,
        },
        progress,
        answers,
      };
    }
  }
  return { status: "complete", progress, answers };
}

/** Throws if the schema breaks an invariant the engine relies on. */
export function validateSchema(schema: FormSchema): void {
  const seen = new Set<string>();
  for (const q of allQuestions(schema)) {
    if (seen.has(q.key)) throw new Error(`Duplicate question key "${q.key}"`);
    if (q.showIf && !seen.has(q.showIf.key)) {
      throw new Error(
        `Question "${q.key}" showIf references "${q.showIf.key}", which is not an earlier question`,
      );
    }
    if (q.kind === "buttons" && !q.options?.length) {
      throw new Error(`Buttons question "${q.key}" has no options`);
    }
    if (q.defaultValue !== undefined) {
      if (q.required) {
        throw new Error(`Required question "${q.key}" cannot have a defaultValue`);
      }
      if (q.options && !q.options.some((o) => o.value === q.defaultValue)) {
        throw new Error(
          `defaultValue "${q.defaultValue}" of "${q.key}" is not one of its options`,
        );
      }
    }
    seen.add(q.key);
  }
}
