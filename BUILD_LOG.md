# Build log
- 2026-10-29 09:01: Project start. Scaffolded Next.js + TypeScript + Tailwind + shadcn.
- 2026-10-29 09:24: Claude Code refused to plan without missing context (empty CLAUDE.md, no field tables) instead of guessing.
- 2026-10-29 09:46: Plan review (issue #1): Claude's plan dropped skipped areatype from the payload; site default is 'unknown'. Sent back with a fix before any code was written.
- 2026-10-29 10:19: #1 merged. 42 tests. Claude pinned Vitest 4 (not 5) and used --legacy-peer-deps after an npm crash; checked and accepted.
- 2026-10-29 13:15: Parsers plan (#3): 'commas anywhere between digits' would turn '1,5 cr' into 15 crore (10x). Required valid Indian/Western grouping instead.
- 2026-10-29 13:46: #3 merged. Manually clicked through #2 UI: stale-answer pruning, areatype skip, upload limits, edit-from-review all behave.
- 2026-10-29 14:47: Issue/PR numbers share one sequence on GitHub; parsers work referenced #3 but its issue was #4. Fixed links via issue comments; briefs now use the number GitHub actually assigns.
