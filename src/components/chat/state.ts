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
import { parseArea, parsePrice } from "@/lib/parsers";
import { areaRetry, priceChange, priceConfirm, priceRetry, type PriceSanity } from "./messages";

/** A parsed price waiting for Yes or Change. Nothing is stored until Yes. */
export type PendingPrice = {
  key: string;
  /** What the user typed. */
  input: string;
  value: number;
  display: string;
  sanity: PriceSanity | null;
  /** The bot's confirm question. */
  message: string;
};

/** A bot follow-up for the current question, e.g. a re-ask after a parse failure. */
export type Notice = {
  key: string;
  message: string;
  /** What the user typed, shown before the message when it wasn't stored. */
  input?: string;
};

/** A value suggested for questions with `suggestedBy: from`, e.g. a title from the description. */
export type Suggestion = { from: string; value: string };

/**
 * Chat UI state. The flow engine decides what to ask; this only records answers,
 * which question (if any) is being edited, whether the user has submitted, a
 * price waiting to be confirmed or a re-ask message, and AI suggestions.
 */
export type ChatState = {
  answers: Answers;
  editingKey: string | null;
  submitted: boolean;
  pendingPrice: PendingPrice | null;
  notice: Notice | null;
  suggestion: Suggestion | null;
  /**
   * The description was accepted without an AI check (token budget used up). Chat state
   * only, never in the site payload; it goes on the lead record later.
   */
  needsReview: boolean;
};

export type ChatAction =
  | { type: "answer"; key: string; value: AnswerValue }
  | { type: "skip"; key: string }
  | { type: "startEdit"; key: string }
  | { type: "confirmPrice" }
  /** A longtext answer the describe API accepted. `html` is the user's escaped text. */
  | {
      type: "describeAccepted";
      key: string;
      html: string;
      suggestedTitle: string | null;
      needsReview: boolean;
    }
  /** A longtext answer the describe API didn't accept (re-ask, blocked or unreachable). */
  | { type: "describeRejected"; key: string; input: string; message: string }
  | { type: "changePrice" }
  | { type: "cancelEdit" }
  | { type: "submit" }
  | { type: "reopen" };

export const initialChatState: ChatState = {
  answers: {},
  editingKey: null,
  submitted: false,
  pendingPrice: null,
  notice: null,
  suggestion: null,
  needsReview: false,
};

/** Rent above this (per month) or a sale below the floor gets a warning in the confirm. */
const RENT_HIGH = 1_000_000;
const SELL_LOW = 100_000;

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

function priceSanity(listingtype: AnswerValue | undefined, value: number): PriceSanity | null {
  if (listingtype === "rent" && value > RENT_HIGH) return "rent_high";
  if (listingtype === "sell" && value < SELL_LOW) return "sell_low";
  return null;
}

function store(schema: FormSchema, state: ChatState, q: Question, value: AnswerValue): ChatState {
  // A required question can't be skipped or answered with nothing.
  if (q.required && value === null) return state;
  return {
    ...state,
    answers: pruneAnswers(schema, { ...state.answers, [q.key]: value }),
    editingKey: null,
    submitted: false,
    pendingPrice: null,
    notice: null,
  };
}

/** Price and area answers are typed text, parsed here. Prices wait for confirmation. */
function answerParsed(
  schema: FormSchema,
  state: ChatState,
  q: Question,
  input: string,
): ChatState {
  if (q.kind === "number") {
    const area = parseArea(input);
    if (area.ok) return store(schema, state, q, String(area.value));
    return { ...state, pendingPrice: null, notice: { key: q.key, message: areaRetry[area.reason] } };
  }
  const price = parsePrice(input);
  if (!price.ok) {
    return { ...state, pendingPrice: null, notice: { key: q.key, message: priceRetry[price.reason] } };
  }
  const listingtype = state.answers.listingtype;
  const sanity = priceSanity(listingtype, price.value);
  return {
    ...state,
    notice: null,
    pendingPrice: {
      key: q.key,
      input,
      value: price.value,
      display: price.display,
      sanity,
      message: priceConfirm(
        price.display,
        typeof listingtype === "string" ? listingtype : undefined,
        sanity,
      ),
    },
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
      if (action.type === "skip") return store(schema, state, q, skipValue(q));
      if (q.kind === "price" || q.kind === "number") {
        // Only typed text is accepted, so every stored price and area went through a parser.
        if (typeof action.value !== "string") return state;
        return answerParsed(schema, state, q, action.value);
      }
      // Descriptions are only stored through describeAccepted, after the AI check.
      if (q.kind === "longtext") return state;
      return store(schema, state, q, action.value);
    }
    case "describeAccepted": {
      const q = visibleQuestion(schema, state.answers, action.key);
      if (!q || q.kind !== "longtext") return state;
      return {
        ...store(schema, state, q, action.html),
        suggestion: action.suggestedTitle ? { from: q.key, value: action.suggestedTitle } : null,
        needsReview: action.needsReview,
      };
    }
    case "describeRejected":
      return {
        ...state,
        pendingPrice: null,
        notice: { key: action.key, message: action.message, input: action.input },
      };
    case "confirmPrice": {
      const pending = state.pendingPrice;
      if (!pending) return state;
      const q = visibleQuestion(schema, state.answers, pending.key);
      if (!q) return { ...state, pendingPrice: null };
      return store(schema, state, q, String(pending.value));
    }
    case "changePrice": {
      const pending = state.pendingPrice;
      if (!pending) return state;
      return { ...state, pendingPrice: null, notice: { key: pending.key, message: priceChange } };
    }
    case "startEdit": {
      const answered = Object.hasOwn(state.answers, action.key);
      if (!answered || !visibleQuestion(schema, state.answers, action.key)) return state;
      return {
        ...state,
        editingKey: action.key,
        submitted: false,
        pendingPrice: null,
        notice: null,
      };
    }
    case "cancelEdit":
      return { ...state, editingKey: null, pendingPrice: null, notice: null };
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
      /** A parsed price for this question, waiting for Yes or Change. */
      pendingPrice?: PendingPrice;
      /** A bot follow-up for this question, e.g. a re-ask, and what the user typed. */
      notice?: { message: string; input?: string };
      /** An AI-suggested answer the user can accept, e.g. a title. */
      suggestion?: string;
    }
  | { mode: "review"; progress: Progress }
  | { mode: "submitted"; progress: Progress; payload: Submission };

/** What the screen should show for this state. */
export function chatView(schema: FormSchema, state: ChatState): ChatView {
  const step = getNextStep(schema, state.answers);
  const prompts = (key: string) => {
    const question = findQuestion(schema, key);
    // Only while unanswered: editing a title the user wrote shows their title, not the old suggestion.
    const suggested =
      question?.suggestedBy !== undefined &&
      state.suggestion?.from === question.suggestedBy &&
      !Object.hasOwn(step.answers, key);
    return {
      ...(state.pendingPrice?.key === key && { pendingPrice: state.pendingPrice }),
      ...(state.notice?.key === key && {
        notice: { message: state.notice.message, input: state.notice.input },
      }),
      ...(suggested && { suggestion: state.suggestion?.value }),
    };
  };
  if (state.editingKey) {
    const question = visibleQuestion(schema, step.answers, state.editingKey);
    if (question) {
      return {
        mode: "edit",
        question,
        section: sectionPosition(schema, question.key),
        progress: step.progress,
        current: step.answers[question.key],
        ...prompts(question.key),
      };
    }
  }
  if (step.status === "question") {
    return {
      mode: "ask",
      question: step.question,
      section: step.section,
      progress: step.progress,
      ...prompts(step.question.key),
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
