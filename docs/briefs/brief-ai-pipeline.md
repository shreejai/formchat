# Brief: issue #9, AI pipeline for the property description

Read CLAUDE.md. Implement issue #9: the AI pipeline that handles the free-text property description (`pdesc`), plus a suggested title. Follow the architecture and safety rules in CLAUDE.md exactly.

## Server-only modules in `src/lib/ai/`

1. **`client.ts`**: one wrapper for every OpenAI call. It:
   - takes a zod schema and returns validated, typed output (use OpenAI structured outputs). If validation fails, it returns a typed "could_not_understand" result, never raw model text.
   - reads model names from env (`OPENAI_MODEL_SMALL`, `OPENAI_MODEL_LARGE`). Never hard-code model names.
   - records input/output tokens and estimated cost per call (price per 1M tokens from env, so pricing isn't baked into code).
   - If the model supports a reasoning-effort setting, use the lowest for the classifier and extractor, and record reasoning tokens in the cost tracking.
   - enforces a per-conversation token cap (`AI_MAX_TOKENS_PER_CONVERSATION`, default 6000) and a timeout. Over the cap → a typed "budget_exceeded" result.
   - never logs raw user text.
2. **`prefilter.ts`** (no LLM, free): trims; rejects empty, too short (< 20 chars), too long (> 2000 chars), or no letters. **Detects phone numbers and email addresses in the description** and asks the user to remove them, because contact details belong in the contact step and listing sites don't allow them in public descriptions.
3. **`classify.ts`**: small model, one call. Returns `{ label, confidence }` where label is `answer | partial_answer | off_topic | question_about_process | abuse_or_injection`. If confidence < 0.6, retry once with the large model. User text goes in the user message only, wrapped in delimiters, and is described to the model as data, never instructions.
4. **`extract.ts`**: small model. From an accepted description, returns `{ suggestedTitle (max 70 chars), highlights: string[] (max 6) }`. It must not invent facts that aren't in the text.
5. **`moderate.ts`**: OpenAI moderation endpoint on the description, since it will be public.
6. **`pipeline.ts`**: prefilter → classify → (if answer/partial) moderate → extract. Returns one of `accepted { html, suggestedTitle, highlights, cost }` | `reask { message }` | `blocked { message }`. `html` is the user's own text, HTML-escaped and wrapped in `<p>` per paragraph. Re-ask messages live in one file keyed by reason, like `src/components/chat/messages.ts`.

## API and UI

- `src/app/api/describe/route.ts` (POST): validates the request with zod, runs the pipeline, returns the result. Add a simple in-memory rate limit per IP.
- In the chat, the `longtext` question calls this route. Show a typing indicator while waiting. `reask` / `blocked` → bot message, ask again. `accepted` → store `pdesc` as the html, then at the `title` question show the suggested title with **Use this** / **Write my own** chips.
- The flow engine still decides what comes next. The LLM never does.

## Tests and evals

- `npm run test` must **not** call the network: mock the OpenAI client. Unit-test the prefilter, the HTML escaping (including `<script>` in the input), the pipeline branches, and the budget cap.
- `evals/classifier.jsonl` with ~30 labelled cases: genuine descriptions, partial ones, off-topic chat, process questions, prompt-injection attempts, abuse, and **Hinglish** descriptions (e.g. "2bhk flat hai Dharampeth me, fully furnished, parking bhi hai"), since that's how many Nagpur users write.
- `evals/extractor.jsonl` with ~10 cases checking titles and highlights don't contain facts absent from the input.
- `npm run eval` runs both with the real API, prints pass rate per set plus total cost, writes `evals/results/latest.json`, and exits non-zero if the classifier is below 90%.
- Add every new env variable to `.env.example` with a dummy value.

New dependencies: the `openai` SDK, and `zod` if not already installed. Say which you add.
Commit messages reference #9. Show me the plan first.
