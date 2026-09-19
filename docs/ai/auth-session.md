# Auth session & login boot (frontend)

How the FE detects and restores sessions **without** calling `/auth/me`
on every load. Read this before touching `api.ts` 401 handling, the
login page, or anything that redirects to `/login`.

## Source of truth

- **`sessionStorage['user']`** — local session mirror written by login
  and refresh responses. Contains `expires_at` (snake_case; legacy
  `expiresAt` still read for soft migration). **Per-tab** — a fresh tab
  has no local session even when the session is still alive.
- **HttpOnly refresh cookie** — the only authoritative, cross-tab
  channel. When local state is absent or expired, the FE proves the
  session by attempting one `POST /api/v1/auth/refresh`.

## Shared helpers — `$lib/auth/session-check.ts`

| Export | Contract |
|--------|----------|
| `hasLocalSession()` | `sessionStorage['user']` parses and has `idp_code`/`username`. NOT authoritative cross-tab. |
| `isTokenExpired()` | `expires_at - 30s < now`. Missing/invalid expiry counts as expired — refresh self-heals it. |
| `refreshAccessToken()` | Raw `fetch` POST `/auth/refresh`; rewrites `sessionStorage['user']` on success; throws on failure. |
| `triggerRefresh()` | **Single-flight** wrapper — concurrent callers share one module-level `refreshPromise`. |

Rules:

- Do NOT re-implement these in `api.ts` or the login page — import from
  `session-check`.
- Do NOT call `/auth/me` to detect a session; `expires_at` + one refresh
  attempt covers every case cheaper.
- Local cleanup is always `userProfileStore.clear()` (clears in-memory
  profile **and** `sessionStorage['user']`) — never `removeItem` +
  `current = null` inline.

## Login page boot — `src/routes/login/+page.svelte`

State machine `bootState: 'checking' | 'refreshing' | 'form'`:

1. `hasLocalSession() && !isTokenExpired()` → `window.location.href` to
   the post-login target immediately. UI shows `LoadingWatermark`
   ("Auto Logging", `cookie` icon).
2. Otherwise → `await triggerRefresh()` once ("Refreshing Token",
   `rotate-ccw-key` icon). Covers expired tokens **and** fresh tabs with
   an empty sessionStorage but a valid refresh cookie.
3. Refresh throws → `userProfileStore.clear()` → `bootState = 'form'`.

Both loading states reuse `LoadingWatermark` with `animation="flip"`
(rotateY spin + zoom). Existing callers default to `animation="pulse"`.

## Redirect helpers — `$lib/auth/redirect-cache.ts`

- `saveRedirectUrl(url)` / `getAndClearRedirectUrl()` — sessionStorage
  persistence (skips `/api/…`).
- `sanitizeRedirectPath(raw)` — accepts only same-origin `/...` paths;
  rejects `//host`, `/api/…`, backslashes, control chars. Always run QS
  input through it.
- `resolvePostLoginTarget(qsParam, lastRoute)` — deterministic order:
  `?redirect_path=` → saved redirect → `shellNav.getLastRoute()` → `/`.
  `lastRoute` is passed as an argument (not read here) to avoid the
  modules-shell → api → redirect-cache import cycle.
- `goToLoginPage()` — the ONLY way code should hard-navigate to
  `/login` **while preserving context**: saves the current path and
  appends a sanitized `?redirect_path=` (survives reloads/new tabs
  where sessionStorage does not). Used by `SessionExpiredDialog`.
  Never use it for logout — see below.

## Last-route restore — `$lib/shell/modules-shell.svelte.ts`

`pb:shell:lastRoute` (localStorage) is written by `afterNavigate` in
AppSidebar, but `saveLastRoute` **skips** `/`, `/login*` and `/api/*` —
the key always holds the last *meaningful* page or null. That's what
makes the third fallback of `resolvePostLoginTarget` deterministic
(instead of dead code reading back `/`).

## Logout — `POST /api/v1/auth/logout` + AppSidebar `handleLogout`

- Both auth cookies are **HttpOnly** — `document.cookie` cannot touch
  them. Only the server can, so logout MUST call the endpoint (PUBLIC
  route: works with an expired access token). It clears
  `access_token` (path `/`) and `refresh_token`
  (path `/api/v1/auth/refresh`). Note: the IdP-side refresh token is
  NOT revoked — it just becomes unreachable to the browser.
- `handleLogout` then clears local state: `userProfileStore.clear()`,
  `getAndClearRedirectUrl()` (drop saved redirect), and
  `shellNav.clearLastRoute()` — then navigates to `/login` **without**
  `redirect_path`. A logout must never restore the previous page: the
  session is officially over, so the boot MUST land on the form.
