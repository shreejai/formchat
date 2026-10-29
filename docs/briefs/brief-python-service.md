# Brief: issue #16, Python webhook receiver (FastAPI)

Read CLAUDE.md and `docs/contracts/lead-webhook-v1.md`. Implement issue #16 in `/service` only. Another branch is building the Next.js sender at the same time: don't touch anything outside `/service`, except adding one job to `.github/workflows/ci.yml`.

**I have never written Python.** I'm a TypeScript developer. Teach as you build:

- Keep the code small and plain. No clever tricks.
- In the plan, explain the Python tooling in TypeScript terms (e.g. uv ≈ npm, pyproject.toml ≈ package.json, pydantic ≈ zod, pytest ≈ vitest).
- Write `service/README.md` with: how to run it, how to test it, and a short "Python for a TypeScript dev" section covering only what this service uses.
- After building, pick the one function you think matters most and explain it to me line by line.

## Stack

- Python 3.12, managed with **uv** (project, virtual env and lockfile).
- FastAPI + uvicorn. pydantic v2 for the body schema. `pydantic-settings` for config. psycopg 3 for Postgres.
- pytest for tests, ruff for lint and format.

## Endpoints

- `GET /health` → `{"ok": true}`. Must **not** touch the database (it's pinged every 10 minutes to keep the free host awake, and must not keep Neon awake too).
- `POST /webhooks/leads`, implementing the receiver rules in the contract exactly: raw-body signature check (constant-time), 300 s timestamp window, schema validation (422), header/body event_id match, idempotent insert by `event_id` (`stored` / `duplicate`), and no contact details in logs.

## Database

- `service/migrations/0001_leads.sql`: a `leads` table (event_id uuid pk, tenant, schema_version, occurred_at, received_at, lead jsonb, needs_review bool, ai_cost_usd numeric). Plus a tiny `uv run migrate` command that applies it and records it in a `service_schema_migrations` table (separate from the Next.js one, so the two branches never clash).
- Insert with `INSERT … ON CONFLICT (event_id) DO NOTHING`, and decide `stored` vs `duplicate` from the row count.
- Read `DATABASE_URL` and `WEBHOOK_SECRET` from env (`service/.env`, git-ignored). Add `service/.env.example` with dummy values.

## Tests (pytest, no network, no real database)

- Put the database behind a small repository interface, and use an in-memory fake in tests.
- Cover: valid signature → stored; same event twice → duplicate; bad signature, missing signature, stale timestamp → 401; malformed body or mismatched event_id → 422; optional fields absent → accepted; `/health` never calls the repository; contact details never appear in captured logs.
- Include one test using the **exact JSON example from the contract**, signed with a fixed secret and timestamp, so both sides are tested against the same bytes.

## CI

- Add a `service` job to `.github/workflows/ci.yml`: install uv, `uv sync`, `uv run ruff check`, `uv run pytest`, run from `/service`.

## Deploy notes (I'll do the clicking)

- In the README: Render settings (root directory `service`, build `uv sync --frozen`, start `uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health check path `/health`, env vars).

Never make real network or database calls without asking. Commit messages reference #16. Show me the plan first.
