---
trigger: always_on
---

# Devin Rule: Commit & verification cadence

## Trigger
- Applies to every turn that modifies source files.

## Canonical doc
**`docs/ai/commit-verification.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- Every modification turn ends with a commit, preceded by type check AND
  E2E/runtime verification of the changed path.
- A green type check alone is NEVER "verified" — run the thing and look
  at the output before claiming verification.
