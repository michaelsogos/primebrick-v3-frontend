# E2E browser session, auth & determinism

> **Audience:** AI agents and humans writing Playwright specs in `src/e2e/`.
> The enforcing rule lives in `.devin/rules/e2e-browser-session.md`; this doc
> is the full reference, including every pitfall we hit empirically.

## The shared Edge session (CDP :9333)

Specs reuse a single, Playwright-owned Edge instance instead of launching a
fresh browser per run:

```ts
const E2E_PROFILE = "D:\\git\\primebrick\\temp\\pw-edge-profile";
const CDP_URL = "http://127.0.0.1:9333";

async function getSharedContext() {
  try {
    const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 5000 });
    const ctx = browser.contexts()[0];
    if (ctx) return ctx;                       // reuse: cache, cookies, tabs
  } catch { /* nothing listening — launch */ }
  return chromium.launchPersistentContext(E2E_PROFILE, {
    channel: "msedge", headless: false,
    viewport: { width: 1440, height: 900 },
    args: ["--remote-debugging-port=9333"],
  });
}
```

Why this design:

- **Cache API survives.** Transformers.js writes a cache entry only for a
  COMPLETE file (`cache.put` after the body stream reaches `done`). A ~2GB
  model re-downloads on every fresh context; the persistent profile keeps
  completed files, so warm runs load in ~10s. Sharded models resume at shard
  granularity; a partially-downloaded shard restarts from byte 0 — there is
  no byte-level resume in Transformers.js.
- **Not the user's profile.** The profile is dedicated to E2E; login is still
  programmatic every run (see below).
- **Never close the context.** The spec intentionally leaves the browser
  open — the next spec attaches to it via CDP.

### Pitfall: wedged connection pool

If in-page `fetch()` hangs on EVERYTHING (even `/favicon.ico`) while `curl`
succeeds, and `navigator.serviceWorker` is empty, the browser's per-host
connection pool is stalled by killed runs. Symptom: the spec prints "landed"
then goes silent. Fix: kill the E2E Edge instance (the `pw-edge-profile`
processes) and relaunch — do NOT add retries around a dead network stack.

## Auth: gate on the endpoint, not the URL

The SPA renders pages (and even the login auto-refresh UI) on expired
sessions. Only `GET /api/v1/auth/me` is truthful:

```ts
const isAuthed = () => page.evaluate(async () => {
  try { return (await fetch("/api/v1/auth/me")).ok; } catch { return false; }
});
```

On 401, `/login` is a **state machine**: `bootSessionCheck()` first tries the
HttpOnly refresh cookie (`checking → refreshing → form`); a successful
refresh redirects away before the form renders. So poll for EITHER the form
(`login-username-input`) OR navigation, submit `admin`/`admin`, then re-verify
`auth/me`. Strip admin MFA in `beforeAll` via `helpers/db.ts`
(`deleteMfaFactorsByUsername`, `setAuthMethodEnforcerDismissed`) — the
documented convention from `auth-mfa.spec.ts`.

## Locale

Pin `sessionStorage["pb.lang"] = "it-IT"` before the app boots (it is read at
startup; reload once if it differed). Watch out for languages offered by the
selector but missing DB dictionaries — `normalizeLang` exact-matches listed
tags and only falls back to the primary subtag for unlisted ones, so e.g. an
`en-US` browser with no `en-US` dictionary rendered raw keys until the dict
was seeded (see `docs/ai/i18n.md` — UiLang ↔ dictionary parity). Never treat
user-entered `label_key` values (which legitimately look like
`system.settings.config.*`) as untranslated UI.

## Multi-phase score cases

One `*_test_score` case can be fed by several specs in separate chat
sessions. Convention for `json_editor_with_schema_test_score`:

- `ai-json-schema-quality.spec.ts` → `phase: "conversation"` turns (prompts)
- `ai-json-schema-navigation.spec.ts` → `phase: "navigation"` turns (clicks)

Each spec clicks `{prefix}-new-session` after model-ready so phases never
share a conversation, then calls `mergeTestScoreTurns(model_id, caseKey,
phase, turns)` from `src/e2e/helpers/test-scores.ts`. The helper replaces
same-phase turns, preserves the other phases, and recomputes the model rank
— quality/speed/score come from ALL merged turns at read time.

## Deterministic waits

- ≤5s `waitFor({ state: "visible" })` slots, ≤6 retries → 30s cap per step.
- **Hydration gate**: wait for `a[href^="/system/"]` (sidebar links render
  only after `onMount` + module-nav fetch). SSR DOM is visible before Svelte
  attaches handlers — a click there does nothing. If a click can race
  hydration, put the click INSIDE the poll and retry until the target mounts.
- **Sheet before model**: prove `[data-testid="smart-json-ai-panel"]` exists
  before waiting on `data-ai-phase`; otherwise you wait for a model that
  cannot load because the sheet never opened.
- **Phase budget**: `loading_*` phases (model download) get 8min in 5s slots
  and exit the moment the phase advances; `init`/`idle`/anything else stuck
  30s = fail; `webgpu_required`/`error` = immediate fail.
- **Same-URL goto**: `page.goto(currentUrl)` aborts (`ERR_ABORTED`) or stalls
  on a reused tab — check `page.url()` first.
- **Selector scoping**: `button[aria-expanded]` matches nav group toggles AND
  unrelated in-page disclosures and the org/module switchers (those carry a
  `title` attribute). Scope to `[data-sidebar="content"]` + `:not([title])`,
  and `Escape` stray dropdown overlays before clicking links.
- **Click fallback**: if an overlay intercepts pointer events, retry with
  `click({ force: true })` — the landed-URL/DOM assertion is what proves the
  navigation, not the click mechanics.

## Missing/exceeding assertions

When a UI renders a data-driven set (nav links, schema-explorer topics),
assert BOTH directions per level:

- **missing** — the source of truth says it, the DOM does not render it;
- **exceeding** — the DOM renders something the source never declared.

Compute the expected set from the app's own truth — either the same API the
app fetches (`/api/v1/modules`, `/api/v1/modules/:id/meta`) or the app's own
modules imported in-page via Vite dev:

```ts
const tree = await page.evaluate(async () => {
  const [{ buildSchemaTopics, indexSchemaTopics }, { typeConfigJsonSchema },
         { schemaForCapabilities }, { localizeTopics }, i18n] = await Promise.all([
    import("/src/lib/components/ui/smart-json-assistant/json-schema-explorer.ts"),
    import("/src/lib/config/type-config-schema.ts"),
    import("/src/lib/components/ui/smart-json-config/type-config-explorer.ts"),
    import("/src/lib/components/ui/smart-json-config/type-config-i18n.ts"),
    import("/src/lib/i18n/index.ts"),
  ]);
  let translate; i18n.t.subscribe((v) => { translate = v; })();
  // …rebuild the exact localized tree the panel renders…
});
```

`i18n.t` is a Svelte `Readable` — read the current translator via
`subscribe()` (the `get()` helper is not importable in-page).

## Persisting AI test evidence

`ai_models.test_scores` stores per-case objects under `*_test_score` keys with
canonical `turns[]` (`{ n, prompt, expected, actual, score, verdict, reason,
response_s }`). Aggregates (`quality`, `speed`, `score`, `rank`) are computed
at READ time by `ai-model-test-scores.ts` — never persist them. Speed follows
ONE rule at every level: average the `response_s` values first, then bucket
the average via `turnSpeedScore` (case avg → case speed; mean of case avgs →
model speed). `response_s` is recorded for every turn including fast UI-driven
outcomes — sub-second latencies are real signal (command perception), not
outliers. The E2E writes
the case via SQL through `helpers/db.ts` (`UPDATE ai_models SET test_scores …,
rank = mean(case scores)`), matching the original harness.

## Reference specs

- `src/e2e/ai-json-schema-quality.spec.ts` — 5-turn prompt-driven quality case.
  Multi-model: `AI_E2E_MODEL_IDS="id1,id2"` runs the whole phase serially per
  model in the SAME browser (live model switch via the assistant selector,
  no relaunch); unset = default model only. Scores persist per `model_id`.
- `src/e2e/ai-json-schema-navigation.spec.ts` — click-through of every
  explorer topic link with per-level missing/exceeding checks
- `src/e2e/auth-mfa.spec.ts` — login + MFA DB-cleanup conventions
