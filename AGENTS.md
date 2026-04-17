# Frontend agent guide — Primebrick

This doc is the **frontend-specific agent guide** for this repository.

**Documentation language:** All `*.md` files in this repository must use **English** for team-facing prose.

## Multi-repo layout (this repository is standalone)

- This **frontend** tree is its **own Git repository**, independent from the **backend** repo and from any **workspace/meta** repo that may sit beside it in a local folder layout.
- **Commits, branches, pushes, and releases** apply to **this repo only** (`git` commands run from the frontend root unless the user specifies otherwise).

### “Release everything” / **rilascia tutto**

When the user says **rilascia tutto** or **release everything**, they expect the **full GitFlow release close** in **this repo** and in **backend** and **workspace meta**: `develop` → `release/<version>` → **`pnpm run version:auto`** → merge to **`main`** → tag **`v<version>`** → merge to **`develop`** → delete **`release/*`**. Do **not** treat “release” as only pushing `develop`.

Authoritative steps: **`.cursor/rules/gitflow-guard.mdc`**. Same SemVer across all three repos for a coordinated release unless the user scopes to one repo.

## App page layout (standard)

In-app routes under the shell should **fill the main content area** (full width, no `mx-auto` / `max-w-*` unless a specific form needs it). Use **`AppPageScaffold`** from `$lib/components/AppPageScaffold.svelte`: outer padding `p-2 sm:p-3`, column `gap-4`, `min-h-0` so flex children (tables, cards) can use remaining height. Put breadcrumb + `h1` (and optional toolbar) in `{#snippet header()}`; put the main block (e.g. `EntityListTable`) as default children.

## Stack + commands

- **Stack**: SvelteKit + Svelte 5 + TypeScript
- **Commands**:
  - Dev: `pnpm run dev`
  - Typecheck: `pnpm run check`
  - Build: `pnpm run build`

## GitFlow workflow (team rule)

- **Zero tolerance:** do **not** keep working (edits/commits) on **`develop` or `main`**. Do **not** push commits that were created on `develop`—merge **`feature/*`** into `develop` first. *"Push and close"* does **not** mean commit on `develop`. Only an **explicit** *"commit on `develop`"* overrides—see **`.cursor/rules/gitflow-guard.mdc`** (*Zero tolerance*).
- **Never commit** application or config changes on `main` or `develop`. If you are on `develop` or `main`, **create a `feature/*` branch first** (`git checkout -b feature/...` from updated `develop`), then edit and commit. No “small fix” exception unless the user explicitly allows direct commits to `develop`.
- **Before the first patch/write in this repo:** run `git branch --show-current`; if `develop` or `main`, **`git checkout -b feature/<slug>`** first—see **`.cursor/rules/gitflow-guard.mdc`** (*Mandatory order*).
- Allowed branch types:
  - `feature/*` or `fix/*` from `develop`
  - `release/*` from `develop` (release process only)
  - `hotfix/*` from `main`
- If you are **already** on `feature/*`, `release/*`, or `hotfix/*`, **ask** whether to **stay** on that branch or **open a new** GitFlow branch. If the user stays, do **not** argue about the branch name.
- If the user **chooses a new** branch: **ask** whether to **close the previous branch first** or leave it open; then always **`checkout` the parent (`develop` or `main`) → `pull` → `checkout -b …`** for the new branch (do not branch the new feature off the old feature unless the user explicitly asks).
- Do not push automatically. Push only when explicitly requested.
- Do not commit changes until the fix has been verified (checks and/or visual verification).

## UI architecture (Shadcn-Svelte)

Primebrick uses **Shadcn-Svelte** as “vendored UI source” + Tailwind.

### Source-of-truth folders

- **UI primitives (vendored)**: `src/lib/components/ui/*`
  - Generated/updated by the Shadcn-Svelte CLI.
  - Prefer **minimal direct edits** here.
- **App components (composition/wrappers)**: `src/lib/components/*` (non-`ui/`)
  - Business/UI building blocks for Primebrick.
  - Compose primitives, add app-specific behavior, defaults, and styling.

### Allowed usage rule (important)

- **If a primitive is not customized**, it is **allowed and encouraged** to use it directly:
  - Example: `import { Button } from "$lib/components/ui/button";`
- Create a wrapper only when you need **app-wide defaults** or **shared behavior**.

## When to use primitives vs wrappers

### Use primitives directly when

- The component is used in **one place** or a few places with **no shared policy**.
- Styling is local (page/component-level) and does not establish a new standard.
- You can express the need via props/classes without changing internals.

### Create an app wrapper when

- You need consistent defaults across the app (e.g. sizing, density, icons).
- You need shared behavior (permissions/disabled policy, analytics hooks, shortcut keys).
- You’re building a “domain component” (e.g. `CustomerPicker`, `MoneyInput`, `ModuleNav`).
- You need standard form UX (label/help/error layout) across many inputs.

### Naming guidance (non-strict)

- `src/lib/components/<DomainThing>.svelte` for domain components.
- `src/lib/components/forms/<Control>.svelte` for form wrappers (optional convention).
- Keep `src/lib/components/ui/*` reserved for vendored primitives.

## Customization rules (to keep updates easy)

- **Composition-first**: prefer wrappers, slots, props, and local classes.
- Avoid changing primitive markup/variants unless you must.
- If you must change a primitive:
  - Keep the change small and intentional.
  - Expect it may be overwritten during a vendor update.
  - Prefer to upstream the change into a wrapper instead if possible.

## Updating Shadcn-Svelte components (vendor update workflow)

Goal: updates are **controlled, reviewable overwrites**, not accidental drift.

### Branching

- Create a dedicated branch for vendor refreshes:
  - `chore/ui-vendor-update-YYYY-MM`
- Do not mix UI vendor refreshes with feature work in the same PR.

### Update procedure

- Update or add components **one at a time** and review the diff:
  - `pnpm dlx shadcn-svelte@<version> add <component> -o`
- If prompted, prefer overwrite when refreshing.
- After each component refresh:
  - Run `pnpm run check`
  - Fix breaks by adjusting wrappers/usages first; only patch primitives if unavoidable.

### Version pinning (recommended)

- Prefer using an explicit CLI version in update branches (avoid surprise `@latest` diffs).
- Record the chosen version in the PR description.

## Agent Do/Don’t checklist

- **Do**: use primitives directly when no customization is needed.
- **Do**: create wrappers for app-wide defaults/behavior.
- **Do**: keep primitives stable so CLI refreshes are easy.
- **Do**: isolate vendor updates in a dedicated branch and keep PRs focused.
- **Don’t**: fork primitives for one-off styling; use local classes or a wrapper.
- **Don’t**: mix large shadcn refreshes with unrelated feature refactors.

## UI patterns (recommended conventions)

These are conventions to keep the UI consistent and reduce “one-off” component drift. They’re guidelines; prefer consistency over cleverness.

### Forms

- Prefer a small set of shared form building blocks (wrappers), for example:
  - `src/lib/components/forms/FormField.svelte` (label + control + help/error)
  - `src/lib/components/forms/MoneyInput.svelte`
  - `src/lib/components/forms/DateInput.svelte`
- Validation UX should be consistent:
  - Error message placement, spacing, and color should match across inputs.
  - Disabled/readonly styling should be consistent and accessible.
- If a single screen needs custom form UX, keep it local; only promote it to a wrapper once it repeats.

### Tables / lists

- Prefer a single table “pattern” rather than many bespoke ones:
  - Column headers style, row hover behavior, empty/loading states.
  - Pagination and filters should be consistent across modules.
- If you need a reusable table abstraction, build it as an app component that composes primitives (don’t modify primitives to become “table framework”).

### Navigation / modules

- Module navigation should be driven by the modules API and live as a domain component (e.g. `ModuleNav.svelte`) rather than duplicating nav logic per route.
- Keep route-to-module mapping explicit and easy to audit.

## i18n (UI language)

- Supported UI languages: **EN, IT, FR, ES, DE, PT**.
- **Default language**: detected from the browser (`navigator.language` / `navigator.languages`), fallback **EN**.
- **Persistence**: UI language selection is stored in **sessionStorage** (key: `pb.lang`).
 - **Rule**: for any user-facing, translatable UI text, use the i18n helper `t()` from `$lib/i18n` (don’t hardcode strings in components/pages).

### Translation files layout

- Messages live under `src/lib/i18n/messages/`:
  - `en.json`, `it.json`, `fr.json`, `es.json`, `de.json`, `pt.json`

### Agent rule (keep translations in sync)

- When adding/changing UI text keys, update **all** language JSON files (even if the translation is temporarily copied from EN) so keys don’t drift.
- Avoid deleting or renaming keys without updating every language file.

## Error handling (impact + tags)

Follow `.cursor/rules/error-impact-levels.mdc`:

- All user-visible errors should include an `impact` level.
- Prefer `scopeKey` / `messageKey` (i18n) over hardcoded strings (avoid mixed EN/IT).
- Put technical details into tags (chips), e.g. `LIST_FAILED` + `HTTP 503`.

## Local dev (backend)

- The backend dev server auto-reloads via `tsx watch` (HMR-like).
- If the user already has the backend running on port `3001`, prefer testing via HTTP requests to the existing server
  rather than starting a second backend instance (avoids `EADDRINUSE` and terminal spam).

### Cleanup after agent-started servers

- When you **started** a dev server (backend and/or frontend) **only to run tests or verify a change**, **stop that process tree when you are done** so ports and terminals are not left occupied.
- **Do not** stop servers the user is already running in **their** terminal for normal work. If you cannot tell (same port, ambiguous parent), **ask** or limit shutdown to the exact subtree you spawned (e.g. the `tsx watch` / `pnpm … dev` chain from the Cursor terminal session used for the test).

## Backend availability (API calls)

- **Types** shared with the availability layer live in `src/lib/api-types.ts` (avoids circular imports with `backend-availability.ts`).
- **All app API traffic** to `/api/v1/*` should go through `apiFetch` / `apiFetchWithTimeout` from `$lib/api` so the global offline gate applies.
- **Health / recovery** uses `probeHealth()` from `$lib/backend-availability.ts` (plain `fetch` to `/api/v1/health`, bypasses the gate). Do not use `fetchHealth()` for sidebar recovery while offline—it would be blocked by the gate.
- **AbortError** (cancelled requests) must not flip the backend to offline; `apiFetch` rethrows aborts without calling `noteGatewayFailure`.

## Icons & images (no raster)

- **Do not** add raster images for UI icons/illustrations (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`).
- Prefer **SVG** (inline or as `.svg`), icon libraries (e.g. `lucide-svelte`), or CSS techniques.
- If a bitmap is unavoidable for a specific business requirement, confirm explicitly before adding it.
