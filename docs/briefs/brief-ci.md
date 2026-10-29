# Brief: issue #<M>, CI and secret scanning

Read CLAUDE.md. Implement issue #<M>: continuous integration and secret scanning.

1. **Fix typecheck in fresh checkouts:** change the `typecheck` script to run `next typegen` before `tsc --noEmit`, so it works in CI and new worktrees without a prior build. Only change that one script line in `package.json`; another branch is adding an `eval` script and dependencies at the same time.
2. **`.github/workflows/ci.yml`:** runs on pull requests and on pushes to `main`. Node version from `.nvmrc` (create it with the version we use). Steps: `npm ci`, typecheck, lint, test, `next build`. Cache npm. If `npm ci` needs `--legacy-peer-deps` (we hit an npm crash earlier), document why in a comment.
3. **Secret scanning job:** gitleaks over the full git history on every PR and push to main. Fails the build on any finding.
4. **Evals are not run on every PR** (they cost money). Add a separate workflow `evals.yml` that runs `npm run eval` only on manual trigger (`workflow_dispatch`) or when a PR has the label `run-evals`, using the `OPENAI_API_KEY` repo secret. If `npm run eval` doesn't exist yet on this branch, the workflow can still be added; it will work once that branch merges.
5. **`.env.example`:** create it if missing, with dummy values for every variable the app reads. Never real values.
6. Add a short "CI" section to the README explaining what runs and when.

No app code changes. Commit messages reference #<M>. Show me the plan first.
