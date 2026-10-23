# Devin Rule: Cross-Repo Release Ordering

## Trigger
- Applies whenever a feature touches both an upstream repo (FE, BE, US, DAL,
  SDK) and the docs repo (`primebrick-v3-docs`) — e.g. a new MDX page, an
  updated `_order.json`, or any `docs/user-guide/` content change.
- Also applies when cutting a docs release that depends on recent upstream
  changes.

## Golden Rule

The docs sync script (`scripts/sync-repo-docs.mjs`) clones the **`main`
branch** of each upstream repo — explicitly via `--branch main`, NOT the
repo's default branch. This is deterministic.

A new or updated MDX file must be merged to `main` of the upstream repo
**BEFORE** a docs release is cut. If the file exists only on `develop` or a
feature branch, the sync will not pick it up and the page will be missing
from the docs site.

## Release order (MANDATORY)

1. **Release the upstream repo FIRST** (e.g. FE):
   - Merge feature → `develop`
   - Create `release/<version>` from `develop`
   - Merge `release/<version>` → `main` + tag
   - Push `main` with tags
   - Merge `main` back to `develop`

2. **THEN release the docs repo**:
   - Create `release/<version>` from `develop`
   - Merge `release/<version>` → `main` + tag
   - Push `main` with tags → Cloudflare® auto-deploys
   - The sync script clones `main` of the upstream repo, finds the new MDX
     file, copies it to `pages/<repo>/guide/`, and the build includes it.

## Forbidden
- ❌ Releasing the docs repo BEFORE the upstream repo's `main` has the new
  MDX file (the sync will not find it → missing page on the docs site).
- ❌ Assuming the sync script clones `develop` or the repo's default branch
  (it clones `main` explicitly).
- ❌ Relying on the GitHub™ Actions cron sync (every 6 hours) as a
  substitute for correct release ordering — the cron only picks up changes
  already on `main` of the upstream repo.

## Enforcement
- AI agent MUST verify that the upstream repo's `main` branch contains the
  new/updated MDX file before cutting a docs release.
- AI agent MUST release the upstream repo first, then the docs repo.
- AI agent MUST NOT invert the release order.
