# Devin Rule: E2E Test Users — NEVER the dev `admin`

## Trigger
- Applies to ALL tests in this repository: E2E (Playwright, `src/e2e/`),
  unit/integration tests, test helpers, diagnostic scripts, and any doc or
  comment that shows how to authenticate in tests.

## Ephemeral test actors (no static backdoor users)
`src/e2e/global.setup.ts` mints a throwaway admin actor at the start of every
run via `helpers/test-users.ts`:

1. drop any leftover actor with the same name (previous crashed run)
2. create the user in Casdoor with a **random password**
3. assign the `administrators` role, enabled + verified
4. insert the `public.user_profiles` row (`is_admin`)
5. publish credentials via `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD` env
6. `global.teardown.ts` deletes the actor (Casdoor + DB + MFA rows)

Static privileged test users must NOT be seeded or relied upon — an always-on
admin account is a latent backdoor. Do not reintroduce them.

## Mandatory rules
1. **NEVER authenticate as the dev bootstrap `admin` user in tests.** It is a
   human first-login identity, not test data.
2. **NEVER destroy/recreate `admin`'s credentials, secrets, MFA factors, or
   passkeys** to bypass MFA — not even in MFA suites. MFA tests run on the
   ephemeral actor; `helpers/db.ts` enforcers (`deleteMfaFactorsByUsername`,
   `setAuthMethodEnforcerDismissed`) REFUSE reserved usernames and throw.
3. **Test-subject users are generated per run** (`makeTestUser()` pattern in
   `auth-password.spec.ts`: unique `e2e_*` identities created through the UI
   and cleaned up via `helpers/db.ts`).
4. **Docs/comments/code samples must never show `admin`/`admin` as test
   credentials.** Show `E2E_ADMIN_*` constants instead — examples that
   demonstrate admin login teach the wrong pattern.

## Enforcement
- `helpers/admin-login.ts` throws when the resolved username is `admin` or
  when `E2E_ADMIN_*` env vars are unset (i.e. globalSetup did not mint an actor).
- `helpers/db.ts` throws when mutation helpers target `admin`.
- Code review / AI agents MUST flag any new `admin` literal in test files.
