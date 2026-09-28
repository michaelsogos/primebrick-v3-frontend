# Devin Rule: E2E Auth & WebAuthn (Playwright)

## Trigger
- Applies to ALL Playwright E2E work in `src/e2e/` touching auth flows:
  login, invitations/onboarding, passkeys, MFA, and the
  `helpers/webauthn.ts` virtual authenticator.

## Virtual authenticator (`helpers/webauthn.ts`)

- **Enrollment: install ONLY, never seed.** `install()` attaches an EMPTY
  authenticator. Any pre-seeded credential gets captured by
  `captureEnrolledPasskey()` instead of the real passkey the page registered —
  silently testing a credential the app never wrote.
- **Sign-in: reseed with `setResidentCredentials([captured])`** on a FRESH
  context. Login on the enrollment context uses the resident credential
  already installed — a separate context proves storage-independent login.
- **Credential ids come back as STANDARD base64** (`+`, `/`, `=`). Playwright
  seeds require base64url — normalize with `toBase64Url()` before
  `setResidentCredentials`, else `create()`/`get()` reports no matching
  credential and the error looks like a real app bug.
- **Never navigate while a WebAuthn ceremony is in flight.** `goto()` aborts
  `navigator.credentials.create()` silently — the call hangs/cancels and the
  enrollment dialog stays half-open. Always `waitFor` the dialog to close
  (completion) BEFORE navigating.
- `context.credentials` is CDP-backed: one authenticator per context; a second
  `install()`/`setResidentCredentials` replaces the previous state.

## Passkey login is NON-discoverable by design

Casdoor+Postgres cannot do discoverable (usernameless) lookup — see BE rule
`casdoor-integration.md`. The login page sends the typed `username` to
`signin/begin`; a test that clicks "Sign in with passkey" with an EMPTY
username field correctly does nothing. Tests must type the username first.

## Auth E2E pitfalls already hit once

- **`locator.isVisible()` does NOT wait** — it answers immediately. For
  "element appears after async save" use `waitFor({state:'visible'})` wrapped
  in try/catch, or `expect(...).toBeVisible()`.
- The admin's **"Session Expired" dialog steals focus globally**. A 401 on any
  background fetch during enrollment/onboarding pops it over the page and
  swallows subsequent clicks — diagnose by dumping `userPage` console/network,
  not by re-running blind.
- **Wait for the CREATE response (201) before asserting navigation.** The
  invited-user test polls `/api/v1/auth/users?pageSize=200`; org select needs
  an explicit click + retry loop on the option (headless/CDP timing).
- These suites are **heavyweight sequential steps** (create user → onboard →
  login → enroll → re-login). Under a full parallel run (12 workers) the org
  popover/step-1 can starve and time out — run them focused or accept that
  whole-suite parallel flake is environmental, not a regression.
- **`is_active` matters**: invited users created through the UI need the
  "Active" toggle checked, else Casdoor marks them `is_forbidden` and login
  fails with `user_no_permission` even with correct role membership.

## Do not debug Casdoor blind

When a grant/login fails, check the client pair, `role.users` membership,
`role.isEnabled`, `isForbidden` — in that order (BE rule
`casdoor-integration.md` has the checklist). Do NOT assume propagation delays
or poll minutes: Casdoor `add-user`/`update-role` are effective immediately.
