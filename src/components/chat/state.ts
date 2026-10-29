import type { AnswerValue, Answers, FormSchema, Question, Section } from "@/forms/types";
import {
  getNextStep,
  isVisible,
  pruneAnswers,
  skipValue,
  toSubmission,
  type Progress,
  type SectionPosition,
  type Submission,
} from "@/lib/flow";

/**
 * Chat UI state. The flow engine decides what to ask; this only records answers,
 * which question (if any) is being edited, and whether the user has submitted.
 */
export type ChatState = {
  answers: Answers;
  editingKey: string | null;
  submitted: boolean;
};

export type ChatAction =
  | { type: "answer"; key: string; value: AnswerValue }
  | { type: "skip"; key: string }
  | { type: "startEdit"; key: string }
  | { type: "cancelEdit" }
  | { type: "submit" }
  | { type: "reopen" };

export const initialChatState: ChatState = {
  answers: {},
  editingKey: null,
  submitted: false,
};

function findQuestion(schema: FormSchema, key: string): Question | undefined {
  return schema.sections.flatMap((s) => s.questions).find((q) => q.key === key);
}

/** The question that would be shown for `key` right now, or undefined if hidden. */
function visibleQuestion(schema: FormSchema, answers: Answers, key: string) {
  const q = findQuestion(schema, key);
  return q && isVisible(q, answers) ? q : undefined;
}

function sectionPosition(schema: FormSchema, key: string): SectionPosition {
  const index = schema.sections.findIndex((s) => s.questions.some((q) => q.key === key));
  const section = schema.sections[index];
  return {
    id: section.id,
    title: section.title,
    index,
    number: index + 1,
    total: schema.sections.length,
  };
}

export function chatReducer(
  schema: FormSchema,
  state: ChatState,
  action: ChatAction,
): ChatState {
  switch (action.type) {
    case "answer":
    case "skip": {
      const q = visibleQuestion(schema, state.answers, action.key);
      if (!q) return state;
      const value = action.type === "skip" ? skipValue(q) : action.value;
      // A required question can't be skipped or answered with nothing.
      if (q.required && value === null) return state;
      return {
        answers: pruneAnswers(schema, { ...state.answers, [q.key]: value }),
        editingKey: null,
        submitted: false,
      };
    }
    case "startEdit": {
      const answered = Object.hasOwn(state.answers, action.key);
      if (!answered || !visibleQuestion(schema, state.answers, action.key)) return state;
      return { ...state, editingKey: action.key, submitted: false };
    }
    case "cancelEdit":
      return { ...state, editingKey: null };
    case "submit":
      if (state.editingKey || getNextStep(schema, state.answers).status !== "complete") {
        return state;
      }
      return { ...state, submitted: true };
    case "reopen":
      return { ...state, submitted: false };
  }
}

export type ChatView =
  | {
      mode: "ask" | "edit";
      question: Question;
      section: SectionPosition;
      progress: Progress;
      /** The current answer when editing. */
      current?: AnswerValue;
    }
  | { mode: "review"; progress: Progress }
  | { mode: "submitted"; progress: Progress; payload: Submission };

/** What the screen should show for this state. */
export function chatView(schema: FormSchema, state: ChatState): ChatView {
  const step = getNextStep(schema, state.answers);
  if (state.editingKey) {
    const question = visibleQuestion(schema, step.answers, state.editingKey);
    if (question) {
      return {
        mode: "edit",
        question,
        section: sectionPosition(schema, question.key),
        progress: step.progress,
        current: step.answers[question.key],
      };
    }
  }
  if (step.status === "question") {
    return {
      mode: "ask",
      question: step.question,
      section: step.section,
      progress: step.progress,
    };
  }
  if (state.submitted) {
    return {
      mode: "submitted",
      progress: step.progress,
      payload: toSubmission(schema, step.answers),
    };
  }
  return { mode: "review", progress: step.progress };
}

export type AnsweredItem = { question: Question; value: AnswerValue };

/** Answered, visible questions grouped by section, in schema order. Empty sections are left out. */
export function answeredSections(
  schema: FormSchema,
  answers: Answers,
): { section: Section; items: AnsweredItem[] }[] {
  const pruned = pruneAnswers(schema, answers);
  return schema.sections
    .map((section) => ({
      section,
      items: section.questions
        .filter((q) => Object.hasOwn(pruned, q.key))
        .map((q) => ({ question: q, value: pruned[q.key] })),
    }))
    .filter((group) => group.items.length > 0);
}
