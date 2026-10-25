# Devin Rule: E2E Test Users — NEVER the dev `admin`

## Trigger
- Applies to ALL tests in this repository: E2E (Playwright, `src/e2e/`),
  unit/integration tests, test helpers, diagnostic scripts, and any doc or
  comment that shows how to authenticate in tests.

## Canonical doc
**`docs/ai/e2e-test-users.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- `helpers/admin-login.ts` throws when the resolved username is `admin` or
  when `E2E_ADMIN_*` env vars are unset (i.e. globalSetup did not mint an actor).
- `helpers/db.ts` throws when mutation helpers target `admin`.
- Code review / AI agents MUST flag any new `admin` literal in test files.
