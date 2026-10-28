# Plan: Issue #1: Vitest, FormSchema, nagpurhomes schema, flow engine

## Context
formchat replaces nagpurhomes.com's 4-step listing form with a chat. Per CLAUDE.md rule 1, a pure engine walks the schema and decides what to ask next. The LLM never decides. This issue adds the generic schema type, the first tenant schema, the engine, and tests. There is no UI and no LLM. Work stays on the current branch `feat/flow-engine`. I won't touch the uncommitted BUILD_LOG.md, CLAUDE.md or docs/ changes, and I won't commit unless you ask.

## 1. Vitest + scripts
- **New dev dependency: `vitest`**, the test runner CLAUDE.md names. It is the only new dependency. I'll resolve the `@/*` alias with `resolve.alias` in the config instead of adding `vite-tsconfig-paths`.
- `vitest.config.ts`: `environment: "node"`, `include: ["src/**/*.test.ts"]`, alias `@` → `./src`.
- `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"typecheck": "tsc --noEmit"`.

## 2. `src/forms/types.ts`: generic schema
```ts
type InputKind = "buttons"|"text"|"number"|"price"|"location"|"longtext"|"upload"|"contact";
type Option = { value: string; label: string };
type Condition =                         // declarative and serializable (no functions)
  | { key: string; in: readonly string[] }
  | { key: string; notIn: readonly string[] };
type Question = {
  key: string; label: string; kind: InputKind;
  options?: readonly Option[];           // required when kind === "buttons"
  required: boolean;
  showIf?: Condition;                    // may only reference keys of EARLIER questions
  submit?: boolean;                      // default true; false = UI-only (acceptTerms)
  defaultValue?: string;                 // optional only: value stored when the user skips
};
type Section = { id: string; title: string; questions: readonly Question[] };
type FormSchema = { id: string; sections: readonly Section[] };
type ContactValue = { name: string; email: string; phone: string };
type AnswerValue = string | number | string[] | ContactValue | null;   // null = skipped (optional only)
type Answers = Readonly<Record<string, AnswerValue>>;
```

## 3. `src/forms/nagpurhomes.ts`
| Section | Questions (key: kind, req) |
|---|---|
| 1 `property` Property Details | usertype: buttons owner/builder/broker, req · listingtype: buttons sell/rent, req · ptype: buttons residential/commercial/plot ("Plot/Land"), req |
| 2 `location-price` Location & Price | loc: location, req · beds: buttons 1–5, opt, `showIf ptype in [residential]` · bath: buttons 1–4, opt, `showIf ptype in [residential, commercial]` · areatype: buttons unknown/area/builtup/superbuiltup, opt, `defaultValue: "unknown"` · areatxt: number, opt, `showIf areatype notIn [unknown]` · amount: price, req |
| 3 `description-images` Description & Images | pdesc: longtext, req · **title**: text, req (moved here, right after pdesc) · images: upload, opt |
| 4 `contact` Contact Info | contact: contact (prefilled card → `{name,email,phone}`), req · acceptTerms: buttons [accept], req, `submit: false` |

Dropdowns become buttons (rule 2). `areatxt` has no unit field. Skipping areatype stores `"unknown"`, so `areatxt` stays hidden and the payload includes `areatype: "unknown"`, just like the current site. The mocked user prefill is UI work and isn't part of this issue.

## 4. `src/lib/flow/`: pure engine
- `conditions.ts`: `isVisible(question, answers)`. No showIf means visible. `in`/`notIn` compare only when the referenced answer is a string. A missing or null answer makes the question hidden.
- `engine.ts`:
  - `skipValue(question)`: returns `defaultValue ?? null`. This is the value to store when the user skips.
  - `pruneAnswers(schema, answers): Answers`. A `null` answer to a question that has a `defaultValue` is normalized to that default first, so a raw null can never get around the default. Then walk questions in schema order, using the answers kept so far, and keep only answers to visible questions. Order matters: because conditions look only at earlier questions, a single pass also handles cascades (if areatype is dropped, areatxt goes with it). Keys that aren't in the schema are dropped. Input is never mutated.
  - `isAnswered(q, answers)`: the key is present. A `null` value counts only when `!q.required`. A required question set to null counts as unanswered and is asked again.
  - `getNextStep(schema, answers)` returns:
    - `{ status: "question", question, section: {id, title, index, number, total}, progress: {answered, total}, answers }`. Example section: `number: 2, total: 4`, i.e. "section 2 of 4". Progress counts visible questions only.
    - `{ status: "complete", progress, answers }`.
    - `answers` is always the **pruned** set, so the caller can't keep stale data.
  - `validateSchema(schema)`: checks for duplicate keys, a showIf that references an unknown or later key, buttons questions with no options, and a `defaultValue` that is on a required question or isn't one of the question's options. It throws an error with a clear message. Used in tests, and callable at startup.
- `payload.ts`: `toSubmission(schema, answers): Record<string, string|number|string[]>`. Prunes first, then drops `submit: false` questions and null values, and flattens a `contact` answer into separate `name`/`email`/`phone` keys so the output matches the site's existing form data exactly.
- `index.ts` re-exports.

## 5. Tests (Vitest)
- `src/lib/flow/engine.test.ts`, using a small inline test schema for the generic branches:
  - empty answers → first question, section 1 of N, progress 0/N
  - walks questions in order within a section, then moves to the next section
  - optional question answered with null → skipped and moves on; required question set to null → asked again
  - showIf `in` / `notIn` true/false; referenced answer missing → hidden
  - all answered → complete
  - **stale answer**: ptype residential→plot drops beds and bath; residential→commercial drops beds and keeps bath; areatype area→unknown drops areatxt; cascade (an upstream drop removes the dependent answer); unknown keys dropped; input object not mutated
  - progress total shrinks or grows as visibility changes
  - validateSchema: each of the 3 error cases, plus nagpurhomes passes
- `src/lib/flow/payload.test.ts`: contact flattening, acceptTerms excluded, stale answers excluded, and:
  - skipping areatype → payload contains `areatype: "unknown"` and no `areatxt`
  - optional questions without a default (beds, bath, images) are omitted when skipped
- engine tests also cover `skipValue` with and without a default, and null normalized to the default inside `pruneAnswers`.
- `src/forms/nagpurhomes.test.ts`: section and question order matches the doc (title right after pdesc), and full walk-throughs for residential, commercial and plot that show the expected question sequence.

## Verification
`npm run test`, `npm run typecheck` and `npm run lint` must all pass. I'll report the actual output.

## Commits (after everything passes)
Only my files get staged, never the pre-existing BUILD_LOG.md, CLAUDE.md or docs/ changes. Commits are conventional and reference #1:
1. `chore: set up vitest and typecheck script (#1)`
2. `feat: add FormSchema types and nagpurhomes schema (#1)`
3. `feat: add deterministic flow engine and submission payload (#1)` (tests included)
