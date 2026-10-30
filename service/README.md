# formchat-service

A small FastAPI service that receives signed `lead.submitted` webhooks from the Next.js app
and stores each lead once in Postgres (Neon). The wire format is defined in
[`docs/contracts/lead-webhook-v1.md`](../docs/contracts/lead-webhook-v1.md).

| Endpoint | What it does |
|---|---|
| `GET /health` | `{"ok": true}`. Never touches the database. |
| `POST /webhooks/leads` | Checks the signature (401), validates the body (422), stores it: `{"status": "stored"}` or `{"status": "duplicate"}`. |

## Run it locally

You need [uv](https://docs.astral.sh/uv/). It installs Python 3.12 for you.

```sh
cd service
uv sync                      # install deps into .venv (like npm install)
cp .env.example .env         # then fill in DATABASE_URL and WEBHOOK_SECRET
uv run migrate               # create the leads table (needs a real DATABASE_URL)
uv run uvicorn app.main:app --reload   # http://localhost:8000, reloads on save
```

`/health` works without a database or a `.env`. Interactive API docs are at `/docs`.

## Test and lint

```sh
uv run pytest                # tests (no network, no database)
uv run pytest -k duplicate   # only tests whose name matches
uv run ruff check            # lint
uv run ruff format           # format (CI runs `ruff format --check`)
```

Tests swap the Postgres repository for an in-memory fake (`tests/conftest.py`), the same idea
as mocking a module in vitest.

## Layout

```
app/main.py        routes; the webhook handler
app/signature.py   HMAC sign/verify + 300 s window
app/schema.py      pydantic models for the body
app/repository.py  LeadRepository interface + Postgres implementation
app/settings.py    env config
app/migrate.py     `uv run migrate`
migrations/        plain SQL, applied in name order, tracked in service_schema_migrations
tests/             pytest
```

## Python for a TypeScript dev

Only what this service uses.

| Python | TypeScript equivalent |
|---|---|
| `uv` | npm, plus nvm (it installs Python too) |
| `pyproject.toml` | `package.json` (deps, scripts, tool config) |
| `uv.lock` | `package-lock.json`. Commit it. `uv sync --frozen` ≈ `npm ci` |
| `.venv/` | `node_modules/` (git-ignored) |
| `uv run X` | `npx X` |
| FastAPI | Next.js route handlers |
| uvicorn | the Node HTTP server behind `next start` |
| pydantic | zod. `Model.model_validate_json(bytes)` ≈ `schema.parse(JSON.parse(text))` |
| pydantic-settings | a zod schema over `process.env` |
| psycopg | `pg` |
| pytest | vitest. A plain `assert x == y` replaces `expect(x).toBe(y)` |
| ruff | eslint + prettier |

**Syntax you'll see here**

- **Indentation is syntax.** No braces: a block is whatever is indented under a line ending in `:`.
- **Type hints** go after the name: `def sign(secret: str, timestamp: int) -> str:` ≈
  `function sign(secret: string, timestamp: number): string`. `str | None` ≈ `string | undefined`.
  Python doesn't check them at runtime. Pydantic does read them to build its validators.
- **`class Lead(BaseModel):`** with typed attributes is a pydantic schema, like `z.object({...})`.
  `Literal["lead.submitted"]` ≈ `z.literal("lead.submitted")`.
- **`Protocol`** (`app/repository.py`) is a structural interface, like a TS `interface`. Any class
  with a matching `insert` method satisfies it. No `implements` needed.
- **Decorators**: `@app.post("/webhooks/leads")` registers the function below it as a route handler.
- **`async def` / `await`** work like in JS. Sync work (psycopg) is pushed to a thread with
  `run_in_threadpool` so it doesn't block other requests.
- **`Annotated[str, Depends(get_secret)]`**: FastAPI calls `get_secret()` and passes the result in.
  Tests replace it via `app.dependency_overrides`, which is how the fake repository gets in.
- **`with x as y:`** runs cleanup when the block ends (closes the DB connection), like
  `try/finally` or TS's `using`.
- **pytest fixtures**: a test parameter named `client` or `repo` is filled in by the function of
  that name in `conftest.py`, like a `beforeEach` that hands you values.
- **Logging**: `logger.info("x=%s", value)` ≈ `console.info`. Never log the body (contact details).

## Deploy on Render

New **Web Service** from this repo:

| Setting | Value |
|---|---|
| Root directory | `service` |
| Runtime | Python |
| Build command | `uv sync --frozen` |
| Start command | `uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health check path | `/health` |

Environment variables:

| Name | Value |
|---|---|
| `DATABASE_URL` | Neon connection string (with `?sslmode=require`) |
| `WEBHOOK_SECRET` | Same value as the Next.js app's `WEBHOOK_SECRET` |
| `PYTHON_VERSION` | `3.12` |

Before the first webhook arrives, create the table once by running
`uv run migrate` locally with `DATABASE_URL` pointing at Neon (or from a Render shell).
It's safe to run again: applied files are skipped.
