# Commit & verification cadence — every change turn commits

> Canonical body of `.devin/rules/commit-verification.md` — the rule file
> is a pointer to this page.

## Contract

- **Commit at every modification turn.** A turn that produced file changes
  ends with a commit on the current branch — no accumulated uncommitted
  work. The user authorized this cadence as a standing rule; per-commit
  permission is NOT required.
- **Before every commit run the relevant checks** for the touched surface:
  - **Type check** — the repo's gate (`svelte-check`, `tsc --noEmit`,
    `pnpm check:standards` where it applies).
  - **E2E / runtime verification** — exercise the changed path in the
    running system: Playwright spec, live screenshot for UI anatomy,
    real endpoint call for BE, real query for data changes.
- **A green type check alone is NEVER "verified".** `tsc`/`svelte-check`
  only prove the code compiles — they say nothing about rendered UI,
  runtime wiring, or behavior. Never report "verified" on type check
  alone; empirical verification means running the thing and looking at
  the output.
- **The working plan is updated BEFORE every commit.** Whatever plan or
  tracking file drives the work (`ai-plans/*.md` in the workspace, a
  repo-local plan) reflects what was just done — items completed,
  decisions taken, anomalies found — so the commit and the plan never
  drift.
- If the dev stack is required for verification and it is not running,
  start it (or ask the user) — never downgrade "verified" to
  "type-checked" silently.
- Commit per repository, on the current feature branch, following the
  repo's GitFlow rules (`.devin/rules/gitflow.md` / `docs/gitflow.md`) and
  the mandated commit trailer.
