# Devin Rule: Cross-Repo Release Ordering

## Trigger
- Applies whenever a feature touches both an upstream repo (FE, BE, US, DAL,
  SDK) and the docs repo (`primebrick-v3-docs`) — e.g. a new MDX page, an
  updated `_order.json`, or any `docs/user-guide/` content change.
- Also applies when cutting a docs release that depends on recent upstream
  changes.

## Canonical doc
**`docs/ai/cross-repo-release-order.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- AI agent MUST verify that the upstream repo's `main` branch contains the
  new/updated MDX file before cutting a docs release.
- AI agent MUST release the upstream repo first, then the docs repo.
- AI agent MUST NOT invert the release order.
