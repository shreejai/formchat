# Plan: Issue #9: AI pipeline for the property description

## Context
The `pdesc` question takes free text that will be shown publicly on the listing. This issue adds a server-only pipeline that checks it (prefilter → classify → moderate → extract), returns the user's own text as escaped HTML, and suggests a title. The flow engine still decides what comes next (CLAUDE.md rule 1). Work is on `feat/ai-pipeline`.

## Dependencies
| Package | Why |
|---|---|
| `openai` | Structured outputs (`responses.parse` + `zodTextFormat`) and moderation |
| `zod` | Schemas for model output and the API request |
| `server-only` | Build fails if `src/lib/ai` is imported from a client component (rule 4). Vitest aliases it to an empty stub. |

No `tsx`: the eval runner is Vitest with its own config (`vitest.eval.config.mts`).

## `src/lib/ai/` (each file imports `server-only`)
- **No env reads or client construction at import time.** Everything is read inside functions, so `next build` works in CI without secrets.
- `client.ts`: `callStructured({ conversationId, tier, schema, name, system, user, maxOutputTokens })` → `{ ok: true, data, usage } | { ok: false, reason: "could_not_understand" | "budget_exceeded" | "timeout" | "error" }`.
  - Models from `OPENAI_MODEL_SMALL` / `OPENAI_MODEL_LARGE`; optional `OPENAI_REASONING_EFFORT` (sent only when set).
  - Records input / output / reasoning tokens and USD cost from `OPENAI_PRICE_{SMALL,LARGE}_{IN,OUT}` (per 1M tokens).
  - Per-conversation cap `AI_MAX_TOKENS_PER_CONVERSATION` (default 6000) in an in-memory map; at or over the cap the call isn't made. `max_output_tokens` bounds each call.
  - Timeout `AI_TIMEOUT_MS` (default 15000), `maxRetries: 1`.
  - Output is re-validated with `schema.safeParse`. Raw model text is never returned or logged. Logs only model, tokens, cost, hashed conversation id.
- `prefilter.ts`: trim; reject empty, < 20, > 2000, no letters, phone numbers or emails. Prices like `45,00,000` must not look like phones.
- `classify.ts`: small model → `{ label, confidence }`; confidence < 0.6 → one retry on the large model. User text only in the user message, inside delimiters, described as data.
- `extract.ts`: small model → `{ suggestedTitle ≤ 70, highlights ≤ 6 }`. At runtime the title is dropped if it contains a number not present in the input.
- `moderate.ts`: moderation endpoint (`OPENAI_MODEL_MODERATION`), through the wrapper (`callModeration`) so it's logged. Free, so not counted in the token cap.
- `html.ts`: escape and wrap paragraphs in `<p>`; inverse for display and edit prefill.
- `messages.ts`: re-ask and block messages keyed by reason.
- `pipeline.ts`: result is `accepted { html, suggestedTitle?, highlights, cost, needsReview }` | `reask { message }` | `blocked { message }`.
  - `off_topic` / `question_about_process` / could-not-understand / timeout → reask.
  - `abuse_or_injection` / moderation flagged → blocked.
  - Extract fails → accepted, no title.
  - **Budget exceeded** → skip classify and extract, still moderate, accept with no title and `needsReview: true`.

## API
`POST /api/describe`: zod body `{ conversationId: uuid, text }`; in-memory per-IP rate limit (`DESCRIBE_RATE_LIMIT_PER_MIN`, default 10). `conversationId` is client-generated, so the per-IP limit is the real abuse control. Both the limiter and the budget map are in-memory and unreliable across serverless instances until they move to Postgres (commented in code).

## Chat UI
- `chat-form.tsx` posts `longtext` answers, shows a typing indicator, and dispatches the result.
- `state.ts` gets `suggestedTitle` and `needsReview` (chat state only, never in the site payload; it goes on the lead record later).
- At `title`, a suggestion shows **Use this** / **Write my own** chips.

## Tests (no network)
Prefilter, HTML escaping (incl. `<script>`), pipeline branches, budget cap and cost maths, title number check, route validation and rate limit, new reducer actions.

## Evals
`evals/classifier.jsonl` (~30, incl. Hinglish and injection) and `evals/extractor.jsonl` (~10, with forbidden facts). `npm run eval` prints pass rate per set and total cost, writes `evals/results/latest.json`, and fails if the classifier is below 90% **or any injection case fails**.

## Env
All new variables go in `.env.example` with dummy values; `.gitignore` gets `!.env.example`.

## Known limitations
- **The token cap only counts successful calls.** Tokens are recorded after a response arrives, so a call that times out or errors (which OpenAI may still bill, up to twice with `maxRetries: 1`) adds nothing, and concurrent requests for one conversation can all pass the pre-call check. The per-IP rate limit is the real bound for now. A follow-up moves the cap to Postgres and reserves the estimate before each call, reconciling with actual usage afterwards.
