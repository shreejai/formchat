import type { Answers, ContactValue, FormSchema } from "@/forms/types";
import { pruneAnswers } from "./engine";

export type Submission = Record<string, string | number | string[]>;

/**
 * Builds the payload in the site's existing form-data shape. Stale answers, UI-only
 * questions and skipped (null) answers are left out, and a contact answer is flattened
 * into name / email / phone.
 */
export function toSubmission(schema: FormSchema, answers: Answers): Submission {
  const pruned = pruneAnswers(schema, answers);
  const out: Submission = {};
  for (const q of schema.sections.flatMap((s) => s.questions)) {
    const value = pruned[q.key];
    if (q.submit === false || value === undefined || value === null) continue;
    if (q.kind === "contact") {
      const { name, email, phone } = value as ContactValue;
      Object.assign(out, { name, email, phone });
    } else {
      out[q.key] = value as string | number | string[];
    }
  }
  return out;
}
