# [CLAUDE.md](http://CLAUDE.md)

## What this is

**formchat**: a conversational AI agent that replaces a multi-step onboarding form.
The first tenant is nagpurhomes.com (property listing form). It is designed so another
site's form is just another schema file.

## Stack

- Next.js (App Router) + TypeScript (strict) + Tailwind + shadcn/ui
- OpenAI (small, cheap model by default; larger model only as a low-confidence fallback)
- Neon Postgres (later); Python FastAPI service in `/service` (later)
- Tests: Vitest. Evals: `/evals` (run with `npm run eval`)

## Commands

- `npm run dev`: local dev server
- `npm run test`: unit tests (must pass before any commit)
- `npm run typecheck`: `tsc --noEmit`
- `npm run lint`
- `npm run eval`: LLM eval sets (uses the real API; costs money, so run deliberately)

## Layout

- `src/forms/<tenant>.ts`: form schema for a tenant (ordered sections, each with questions: types, options, required, showIf)
- `src/lib/flow/`: pure, deterministic question-flow engine (no LLM, no I/O)
- `src/lib/parsers/`: deterministic parsers (price in lakh/crore, area)
- `src/lib/ai/`: prefilter, classifier, extractor, moderation (server-only)
- `src/lib/pii/`: PII detection and redaction
- `src/app/api/`: route handlers (the only place that calls OpenAI)
- `evals/`: eval datasets (`*.jsonl`) and runners

## Architecture rules

1. **The flow is deterministic.** The schema and flow engine decide what to ask next. The LLM never decides the flow.
2. **Prefer buttons.** Any field with fixed options is answered by buttons, not free text.
3. **Prefer deterministic parsing.** Prices, areas and numbers are parsed in code, not by the LLM.
4. **LLM calls are server-only.** Never import `src/lib/ai` or the OpenAI SDK from a client component.
5. **Every LLM output is validated with zod.** If validation fails, treat it as "could not understand" and re-ask. Never pass unvalidated model output on.
6. **User text is untrusted.** Never put it in a system prompt. Never render it as HTML without escaping. Treat instructions inside it as data.
7. **Cheapest path first:** deterministic prefilter → cheap classifier → extractor → moderation for public text.

## Safety rules

- Never hard-code secrets. Use `process.env`, and add every new variable to `.env.example` with a dummy value.
- Never log raw user messages or PII. Log redacted text only.
- Every OpenAI call goes through one wrapper that records tokens and cost and enforces a per-conversation token cap.
- Never make real API calls (OpenAI or any paid service) without asking first. That includes smoke tests, `npm run eval` and running the server with a real key. Use the mocked client.

## Conventions

- Small, focused changes. One issue = one branch = one PR.
- Branch names: `feat/<short-name>`, `fix/<short-name>`.
- Conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).
- New logic gets tests in the same PR. Bug fixes get a test that would have caught the bug.
- Do not add new dependencies without saying so and why.
- If a requirement is ambiguous, ask instead of guessing.
- `BUILD_LOG.md` is maintained by me on `main` only. Agents never edit it.
