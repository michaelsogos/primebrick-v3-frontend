# Devin Rule: Environment Variable Policy

## Trigger
- Applies to ALL code in this repository that reads `process.env` or
  defines configuration.

## Canonical doc
**`docs/ai/env-policy.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- ONLY `DATABASE_URL` + `DATABASE_SCHEMA` may live in `.env`; everything
  else is a module config row (`config_entries` / `<schema>.config`).
- Any new `process.env.` read beyond the DB pair is a violation.
