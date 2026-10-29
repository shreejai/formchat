# Brief: issue #15, submit, outbox and redacted transcripts (Next.js + Neon)

Read CLAUDE.md and `docs/contracts/lead-webhook-v1.md`. Implement issue #15. The Python receiver is being built on another branch at the same time: don't create anything under `/service`, and don't edit `.github/workflows/ci.yml`.

## Database (Neon Postgres)

- Use `@neondatabase/serverless`. Read `DATABASE_URL` only inside functions, never at import (CI builds without it).
- Plain SQL migration in `db/migrations/0001_outbox_transcripts.sql`, plus an `npm run db:migrate` script that applies `db/migrations/*.sql` in order and records them in a `schema_migrations` table. The Python branch owns the `leads` table; don't create it.
- Tables:
  - `outbox` (id uuid pk, event_type, payload jsonb, status `pending|delivered|failed`, attempts int, next_attempt_at, last_status_code, last_error, created_at, delivered_at)
  - `transcripts` (conversation_id uuid pk, tenant, turns jsonb, needs_review bool, ai_cost_usd numeric, created_at). Turns are `{role: "bot"|"user", key, text}` and are **already redacted**.

## Never trust the client

`POST /api/submit` receives `{ conversationId, answers, pdescToken }` and must:

1. Re-run the flow engine server-side: prune the answers and require `getNextStep(...).status === "complete"`. Re-validate price and area with the parsers. Anything off → `422`.
2. Verify `pdesc` really came from `/api/describe`. Change `/api/describe` to also return `pdescToken = HMAC-SHA256(DESCRIBE_TOKEN_SECRET, conversationId + "." + html)`; the client sends it back on submit. If it doesn't match, reject. Otherwise anyone could skip the AI checks and post raw HTML straight to `/api/submit`.
3. Build the payload with `toSubmission()`, exactly as the contract says.
4. In **one transaction**: insert the outbox row and the redacted transcript.
5. Respond to the user straight away. Then attempt delivery in the background with Next's `after()`.

## PII redaction (`src/lib/pii/`)

- `redact(text, known)`: replaces the user's own name, email and phone (from the contact answer) with `[NAME]`, `[EMAIL]`, `[PHONE]`, plus any email or Indian phone number found by pattern (reuse the prefilter's detection). Case-insensitive, whole words for the name, and phone numbers matched however they're spaced or dashed.
- The contact turn itself is stored as `[NAME] · [PHONE] · [EMAIL]`.
- Unit tests, plus an eval set `evals/pii.jsonl` (~20 cases: names inside sentences, emails, `+91 98765 43210`, `098765-43210`, numbers that are prices or areas and must **not** be redacted, Hinglish). It's deterministic, so it runs in `npm run test`, not the paid eval. Target 100%.

## Delivery and retries

- `deliver(row)`: signs and posts exactly per the contract; updates status, attempts and backoff per the sender rules.
- `POST /api/outbox/drain`: protected by `Authorization: Bearer ${CRON_SECRET}`; delivers due `pending` rows (max 20 per call); returns counts. It's called by a scheduled GitHub Action (next point), because Vercel's free cron is too infrequent.
- `.github/workflows/drain-outbox.yml`: every 10 minutes, `curl` the drain endpoint with the secret, and `curl` the Render service's `/health` to keep it warm. Secrets: `APP_URL`, `CRON_SECRET`, `LEADS_SERVICE_URL`.

## UI

- Replace the JSON preview after "Looks good, submit" with a success screen ("Thanks! Your listing has been sent for review."). Keep the JSON preview only behind `?debug=1`.

## Tests

- Mock the database and `fetch`. No network in `npm run test`.
- Cover: incomplete answers → 422; tampered pdesc → rejected; payload matches the contract example's shape; signature matches a known HMAC test vector; each sender rule (2xx, 5xx, 429, timeout, other 4xx, max attempts); drain auth; redaction cases.
- Add every new env variable to `.env.example` (`DATABASE_URL`, `WEBHOOK_SECRET`, `DESCRIBE_TOKEN_SECRET`, `CRON_SECRET`, `LEADS_SERVICE_URL`).

Never make real network or database calls without asking. Commit messages reference #15. Show me the plan first.
