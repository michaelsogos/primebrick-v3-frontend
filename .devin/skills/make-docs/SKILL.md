---
name: make-docs
description: Run sveld extraction and surgically update docs/user-guide based on current branch diff
allowed-tools: [read, write, edit, exec, grep, find_file_by_name]
---

# make-docs

Manually refresh developer documentation for this repo. Run this when you want
to update docs without closing a GitFlow branch, or to verify docs are current.

## Steps

### 1. Detect branch and diff base

Run `git branch --show-current` to get the current branch name. Determine the
diff base:

- `feature/*` → base is `develop`
- `release/*` → base is `develop`
- `hotfix/*` → base is `main`
- `develop` or `main` → diff against the last release tag (`git describe --tags --abbrev=0`)
- Other → ask the user which base to diff against

### 2. Run extraction (refresh component docs data)

Run `pnpm extract-docs` to regenerate `docs/user-guide/_extracted/components.json`
from the current Svelte components via sveld. This ensures the extraction JSON
reflects the latest prop types, snippets, and bindable flags.

If the command fails, report the error and stop — do not proceed with stale data.

### 3. Check the diff

```
git diff <base>...HEAD --stat
git diff <base>...HEAD
```

If the diff is empty or only `package.json`/lock files → report "No user-facing
changes detected. Docs are current." and stop.

### 4. Determine if user-facing files changed

For this repo (frontend), user-facing changes include:
- Svelte components (src/lib/components/**.svelte)
- Layouts (src/routes/**/+layout.svelte)
- Pages (src/routes/**/+page.svelte)
- Component prop changes ($props() signature changes)
- i18n / translation system (src/lib/i18n/**)
- Theming / styling (src/lib/styles/**, app.css)
- Routing / navigation (src/routes/**)
- Entity form / list table changes (src/lib/entity-*)
- New reusable patterns or utilities

If NO user-facing files changed → report "No user-facing changes. Docs are
current." and stop.

### 5. Anti-rewrite check (MANDATORY)

For each doc page that might be affected:
1. Read the existing page content
2. Compare against the diff and the refreshed extraction JSON
3. Decide:
   - Already accurate → SKIP (no edit)
   - Missing info → ADD minimal content
   - Inaccurate → FIX only the wrong parts
   - No page exists → CREATE new page, add to `_order.json`

A 10-line code change → at most a few lines of doc changes, not a rewritten page.

### 6. Update docs/user-guide/

Follow `.devin/rules/docs-user-guide.md` for editorial conventions:
- Use `<Mermaid chart={...} />` for diagrams, never ```Code or ```mermaid
- Minimal edits — preserve existing prose structure
- Update `<!-- AUTO-GENERATED:reference -->` blocks with extracted component data
- **MDX escaping**: when writing TS type names in prop tables, escape `<` as
  `&lt;`, `{` as `&lbrace;`, `}` as `&rbrace;` (MDX parses these as JSX).
  Use `[text](url)` for links, never `<url>` autolinks.

### 7. Report

Summarize in chat:
- Which files changed in the diff (user-facing only)
- Whether `pnpm extract-docs` ran successfully and what changed in _extracted/
- Which doc pages were updated and why (added/fixed/created)
- Which doc pages were skipped (already accurate)
- That changes are NOT committed — wait for user instruction to commit
