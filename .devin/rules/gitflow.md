# Devin Rule: GitFlow

## Trigger
- Applies to ALL git operations in this repository (branches, merges, tags,
  releases, commits).

## Canonical doc
**`docs/gitflow.md` — read it before acting.** This file is a pointer;
the normative text lives in the canonical doc (rules are pointers, not
docs — and `docs/` survives independently of Devin).

## Enforcement
- NEVER commit automatically — wait for explicit user instruction.
- NEVER work directly on `develop` or `main`.
- Version bump MUST be committed on the release/hotfix branch before
  merge to `main`. NO 'v' prefix in tags.
