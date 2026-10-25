# Devin Rule: Fixed Package Versions (No Ranges)

## Trigger
- Applies to ALL `package.json` files in this repository.
- Applies whenever a package is added, updated, or its version is modified.

## Canonical doc
**`docs/ai/package-versioning.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- AI agent MUST NOT add `^`, `~`, `>=`, `*`, or `latest` prefixes to any
  registry package version in `package.json`.
- AI agent MUST pin exact versions when adding new dependencies.
- AI agent MUST NOT change a pinned version to a range as a "quick fix"
  for a resolution conflict.
- When reviewing PRs, flag any range-prefixed versions as violations.
