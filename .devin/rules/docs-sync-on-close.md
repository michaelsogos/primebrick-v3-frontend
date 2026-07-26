# Devin Rule: Sync Docs on GitFlow Close

## Trigger
- Applies when closing a GitFlow branch (feature, release, or hotfix).
- Fires BEFORE the merge step of the closing procedure in docs/gitflow.md.

## Diff base per branch type

The diff base depends on which branch type is being closed. This ensures
we only see what changed ON the branch, not accumulated changes from
other branches:

| Branch type | Diff command | What it shows |
|-------------|-------------|---------------|
| feature/* | `git diff develop...feature/<name>` | Changes made on the feature branch |
| release/* | `git diff develop...release/<version>` | Changes made during release stabilization (usually just version bump) |
| hotfix/* | `git diff main...hotfix/<version>` | The hotfix changes only |

**Critical for release branches**: releases are often just version bumps
with no code changes. The features were already merged to develop (with
their docs) during feature closes. The release diff against develop
should be near-empty. If it is — skip docs entirely.

## Procedure

When the user requests closing a feature/release/hotfix branch, BEFORE
performing the merge:

### 1. Check the diff (correct base per branch type)
Run the appropriate diff command from the table above with `--stat` first:
```
git diff <base>...<branch> --stat
```
Then review the actual diff:
```
git diff <base>...<branch>
```

### 2. Determine if docs need updating

**For release branches**: if the diff is only `package.json` (version bump)
and/or lock files, SKIP docs entirely. Docs were already updated during
feature closes. Proceed to step 6.

**For feature/hotfix branches**: check if the changed files affect
user-facing behavior. For this repo (frontend), user-facing changes include:
- New or modified Svelte™ components (src/lib/components/**.svelte)
- New or modified layouts (src/routes/**/+layout.svelte)
- New or modified pages (src/routes/**/+page.svelte)
- Component prop changes ($props() signature changes)
- i18n / translation system changes (src/lib/i18n/**)
- Theming / styling system changes (src/lib/styles/**, app.css)
- Routing / navigation changes (src/routes/**)
- Entity form / list table changes (src/lib/entity-*)
- New reusable patterns or utilities that devs should know about

If NO user-facing files changed, skip to step 6 (proceed with normal close).

### 3. Run extraction (refresh component docs data)
Run `pnpm extract-docs` to regenerate `docs/user-guide/_extracted/components.json`
from the current Svelte™ components. This ensures the extraction JSON reflects
the latest prop types, snippets, and bindable flags.

### 4. Anti-rewrite check (MANDATORY)

Before updating any doc page, READ the existing content and compare
against the diff:

- If the existing docs ALREADY describe the changed behavior accurately
  → do NOT update that page. Skip it.
- If the existing docs are MISSING the changed behavior
  → add the missing content with minimal edits.
- If the existing docs are INACCURATE (describe old behavior)
  → fix only the inaccurate parts. Do not rewrite the page.
- If no doc page exists for the changed topic
  → create a new page and add it to `_order.json`.

**The goal is surgical edits, not regeneration.** A 10-line code change
should produce at most a few lines of doc changes, not a rewritten page.

### 5. Update docs/user-guide/ and commit
For each page that needs updating (after the anti-rewrite check):
- Follow `.devin/rules/docs-user-guide.md` for editorial conventions
- Use `<Mermaid chart={...} />` for diagrams, never ```Code or ```mermaid
- Update `<!-- AUTO-GENERATED:reference -->` blocks with extracted component data
- Make minimal edits — preserve existing prose structure

Commit the doc updates (including regenerated _extracted/ JSON) ON the
branch BEFORE merging:
```
git add docs/user-guide/
git commit -m "docs: update user-guide for <branch-name> changes"
```

### 6. Proceed with normal close
Continue with the standard GitFlow closing procedure from docs/gitflow.md
(merge --no-ff, push, delete branch, etc.).

## What NOT to do
- ❌ Do NOT diff against `main` for release branches — use `develop` as base
- ❌ Do NOT rewrite pages that already describe the changed behavior
- ❌ Do NOT regenerate docs at release close if features already updated them
- ❌ Do NOT skip the anti-rewrite check — always read existing docs first
- ❌ Do NOT skip `pnpm extract-docs` if components changed
- ❌ Do NOT update docs after the merge — update before, on the branch
- ❌ Do NOT create docs for internal-only changes (refactors, tests, configs)
- ❌ Do NOT make large edits for small code changes — be surgical

## Enforcement
- AI agent MUST use the correct diff base per branch type
- AI agent MUST skip docs for version-bump-only releases
- AI agent MUST run `pnpm extract-docs` if components changed
- AI agent MUST read existing docs before updating (anti-rewrite check)
- AI agent MUST commit doc updates on the branch before merging
- If unsure whether a change is user-facing, lean toward updating docs
- If unsure whether existing docs are accurate, ask the user
