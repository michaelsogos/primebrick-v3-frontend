# Devin Rule: Sync Docs on GitFlow Close

## Trigger
- Applies when closing a GitFlow branch (feature, release, or hotfix).
- Fires BEFORE the merge step of the closing procedure in .devin/rules/gitflow.md.

## Canonical doc
**`docs/ai/docs-sync-on-close.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- AI agent MUST use the correct diff base per branch type
- AI agent MUST skip docs for version-bump-only releases
- AI agent MUST run `pnpm extract-docs` if components changed
- AI agent MUST read existing docs before updating (anti-rewrite check)
- AI agent MUST commit doc updates on the branch before merging
- If unsure whether a change is user-facing, lean toward updating docs
- If unsure whether existing docs are accurate, ask the user
