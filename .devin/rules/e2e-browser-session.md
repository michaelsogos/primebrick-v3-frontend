# Devin Rule: E2E Browser Session, Auth & Determinism

## Trigger
- Applies whenever an AI agent writes or modifies E2E specs in `src/e2e/`
  that drive a real browser (Playwright), especially specs that need an
  authenticated session, WebGPU, or a warm Cache API (AI model files).

## Mandatory conventions

### Browser session — reuse over relaunch
- Attach to the shared Edge debug session via `chromium.connectOverCDP(
  "http://127.0.0.1:9333")` first; only launch `launchPersistentContext(
  E2E_PROFILE, { channel: "msedge", headless: false, args: [
  "--remote-debugging-port=9333"] })` when nothing listens.
- `E2E_PROFILE = D:\git\primebrick\temp\pw-edge-profile` — a Playwright-owned
  Edge profile. NEVER the user's real profile. It persists the Cache API so
  downloaded AI models survive across runs (Transformers.js commits a cache
  entry only for COMPLETE files — a mid-file interruption restarts that file).
- NEVER close the browser/context in the spec — the session is deliberately
  left alive for observation and reuse by the next spec.

### Auth — endpoint, not URL
- Gate on `GET /api/v1/auth/me` via `page.evaluate(fetch)` — the SPA renders
  the form shell even with an expired session (401), so URL/DOM checks lie.
- On 401: navigate to `/login` and treat it as a state machine — the login
  page auto-attempts a session refresh before showing the form; poll for the
  form (`login-username-input`) OR a redirect, submit `admin`/`admin`, then
  re-verify `/api/v1/auth/me`.
- `beforeAll`: `deleteMfaFactorsByUsername("admin")` +
  `setAuthMethodEnforcerDismissed("admin", true)` via `helpers/db.ts` so the
  login cannot stall on an MFA challenge.

### Locale — pin before first load
- `sessionStorage["pb.lang"] = "it-IT"` then reload once if it differed.
- A `UiLang` listed in `UI_LANGS`/`LangSelect` MUST have a dictionary in the
  BE translations tables — `normalizeLang` exact-matches listed tags and only
  falls back to the primary subtag (`en`→`en-GB`) for UNLISTED tags, so a
  listed language without dicts renders raw `system.*` keys everywhere.
- NEVER scan all DOM text for raw `system.*` keys: user-entered values (e.g.
  `label_key` fields) legitimately contain them.

### Determinism — evidence, not sleeps
- Every wait polls DOM evidence in ≤5s slots, ≤6 retries (30s cap) via
  `locator.waitFor({ state: "visible", timeout: 5000 })` in a loop.
- The same bound applies to the AGENT observing a run: read shell output in
  ≤30s windows (`get_output` timeout ≤30s), never multi-minute blocking
  reads — a test that is silent for >30s is already telling you something.
- Hydration gate: wait for a sidebar nav link (`a[href^="/system/"]`) —
  rendered only after `onMount` + module-nav fetch. Clicking SSR DOM hits
  dead (unhydrated) handlers. If a click may have raced hydration, retry the
  click inside the poll until the expected element mounts.
- The assistant sheet MUST be proven mounted (`*-panel` testid) BEFORE any
  `data-ai-phase` wait — never wait for a model that cannot load because the
  sheet never opened.
- Model load: `loading_*` phases get an 8-minute budget (5s slots); any other
  phase unchanged for 30s = fail fast. `webgpu_required`/`error` fail
  immediately.
- `page.goto()` to the SAME URL aborts (ERR_ABORTED) or stalls on a reused
  tab — navigate only when the current URL differs.
- Nav/group locators must be scoped to `[data-sidebar="content"]` and must
  exclude elements carrying `title` (org/module switchers) — a loose
  `button[aria-expanded]` selector also matches in-page disclosures and
  hijacks clicks.
- If in-page `fetch()` hangs while `curl` succeeds, the browser instance's
  connection pool is wedged (stalled streams from killed runs) — close the
  E2E Edge instance and relaunch; do not add retries.

### Assertions of completeness
- When a UI renders a data-driven set (nav links, explorer topics), assert
  BOTH directions: missing (expected but not rendered) AND exceeding
  (rendered but not expected). Compute the expected set from the app's own
  source of truth — fetch the same API the app uses, or `await import(
  "/src/lib/...")` inside `page.evaluate` (Vite dev serves the real modules).

### Persistence of test evidence
- `ai_models.test_scores` cases live under `*_test_score` keys with canonical
  `turns[]`; aggregates (quality/speed/score/rank) are computed at READ time —
  never persist precomputed score fields.
- One case may collect turns from MULTIPLE specs/sessions: each spec owns a
  `phase` (e.g. `conversation`, `navigation`), starts a clean chat via the
  `{prefix}-new-session` CTA, and merges through
  `mergeTestScoreTurns(model_id, caseKey, phase, turns)` in
  `src/e2e/helpers/test-scores.ts` — which replaces same-phase turns,
  preserves the rest, and recomputes rank. Never write a whole case
  destructively when another phase's turns exist.

## Reference
- Full doc + pitfalls: `docs/ai/e2e-browser-session.md`
- Reference specs: `src/e2e/ai-json-schema-quality.spec.ts`,
  `src/e2e/ai-json-schema-navigation.spec.ts`, `src/e2e/auth-mfa.spec.ts`
- Testid convention: `.devin/rules/e2e-testid-convention.md`

## Enforcement
- AI agent MUST NOT add `sleep`/`waitForTimeout` outside the 5s poll slots.
- AI agent MUST NOT modify production components to make a test pass — fix
  the test against the existing DOM contract.
- AI agent MUST report the actual DOM/state in failures (bounded, fail-fast).
