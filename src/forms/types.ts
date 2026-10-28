/**
 * Generic form schema. A tenant's form is an ordered list of sections, each
 * holding ordered questions. Everything here is plain data (no functions), so a
 * schema can be serialized, diffed and validated.
 */

export type InputKind =
  | "buttons"
  | "text"
  | "number"
  | "price"
  | "location"
  | "longtext"
  | "upload"
  | "contact";

export type Option = { value: string; label: string };

/** Visibility rule. It may only reference the key of an earlier question. */
export type Condition =
  | { key: string; in: readonly string[] }
  | { key: string; notIn: readonly string[] };

export type Question = {
  key: string;
  label: string;
  kind: InputKind;
  /** Required when kind is "buttons". */
  options?: readonly Option[];
  required: boolean;
  showIf?: Condition;
  /** Defaults to true. false marks UI-only state that is never submitted. */
  submit?: boolean;
  /** Optional questions only: the value stored when the user skips. */
  defaultValue?: string;
};

export type Section = {
  id: string;
  title: string;
  questions: readonly Question[];
};

export type FormSchema = {
  id: string;
  sections: readonly Section[];
};

export type ContactValue = { name: string; email: string; phone: string };

/** null means an optional question was skipped and has no default. */
export type AnswerValue = string | number | string[] | ContactValue | null;

export type Answers = Readonly<Record<string, AnswerValue>>;
