# Frontend patterns (extended reference)

**Language:** English for team-facing prose in Markdown.

## App page layout

In-app routes under the shell should **fill the main content area** (full width, no `mx-auto` / `max-w-*` unless a specific form needs it).

Use **`AppPageScaffold`** from `$lib/components/AppPageScaffold.svelte`: outer padding `p-2 sm:p-3`, column `gap-4`, `min-h-0` so flex children (tables, cards) can use remaining height. Put breadcrumb + `h1` (and optional toolbar) in `{#snippet header()}`; put the main block (e.g. entity list table) as default children.

## UI architecture (Shadcn-Svelte)

Primebrick uses **Shadcn-Svelte** as vendored UI source + Tailwind.

### Customization (keep updates easy)

- **Composition-first:** wrappers, slots, props, local classes.
- Avoid changing primitive markup/variants unless necessary.
- If you must change a primitive: keep it small; expect vendor CLI may overwrite; prefer fixing in a wrapper when possible.

### When to use primitives vs wrappers

**Use primitives directly when:** few usages, no shared policy, styling is local.

**Create an app wrapper when:** app-wide defaults, shared behavior (permissions, analytics), domain components (`CustomerPicker`, `MoneyInput`), standard form UX.

**Naming (non-strict):** `src/lib/components/<DomainThing>.svelte` for domain; optional `src/lib/components/forms/` for form controls. Keep `src/lib/components/ui/*` for vendored primitives.

## Updating Shadcn-Svelte components (vendor workflow)

1. Branch: `chore/ui-vendor-update-YYYY-MM` — do not mix with feature work.
2. Update one component at a time: `pnpm dlx shadcn-svelte@<version> add <component> -o` (prefer explicit CLI version).
3. After each: `pnpm run check`; fix wrappers/usages first, patch primitives only if unavoidable.
4. Record CLI version in the PR description.

## UI patterns (conventions)

### Forms

Prefer shared form building blocks (e.g. `FormField`, `MoneyInput`, `DateInput` under `src/lib/components/forms/` when present). Validation UX (errors, spacing, disabled) should stay consistent; promote to wrapper only after repetition.

### Tables / lists

Prefer one table pattern: headers, row hover, empty/loading, pagination/filters consistent across modules. Reusable abstractions should be **app components** composing primitives, not forks of primitives.

### Navigation / modules

Drive module navigation from the modules API via a domain component (e.g. module nav) rather than duplicating logic per route.

### Global side sheet (right panel)

The **right-hand “sidebar” sheet** is not route-owned UI: it is a **single reusable host** mounted once in the app shell.

| Piece | Role |
|-------|------|
| `$lib/shell/sheets/sheet-manager.svelte.ts` | `sheetState`, `openSheet`, `closeSheet`, `replaceSheet`; typed `SheetPanelId` and per-panel props. |
| `$lib/shell/sheets/SheetHost.svelte` | One `Sheet.Root` / `Sheet.Content`; picks the panel component from a **registry** by `sheetState.panelId`. |
| `$lib/shell/sheets/panels/*` | Shell panels (e.g. errors, versions). |
| `$lib/entity-list/sheets/panels/*` | Entity-list panels (search-in, columns, filters). |

**How to add a panel:** register the Svelte panel in `SheetHost.svelte`, extend `SheetPanelId` / `SheetPanelPropsMap` in the manager, then call `openSheet('<id>', props, { contentClass, side })` from buttons or explicit user actions.

**Do not** drive `openSheet` from an `$effect` that also depends on a **bindable boolean** mirroring sheet open state (e.g. “open when flag is true and sheet looks closed”). While the sheet is closing, the flag can still be `true` for a tick and the effect will **re-open** the sheet → infinite loop. Prefer **opening from the click handler** (or another discrete event) and use small, one-way sync effects only for “parent set flag false → `closeSheet`” / “sheet dismissed → clear flag”.

## Agent checklist (UI)

- Use primitives directly when no customization is needed.
- Wrappers for app-wide defaults or shared behavior.
- Keep primitives stable for CLI refreshes.
- Isolate vendor updates in a dedicated branch.
- Do not fork primitives for one-off styling.
- Right-side sheets: use **`SheetHost` + `openSheet` / `closeSheet`**; avoid reactive `openSheet` loops tied to bindable “open” flags (see **Global side sheet** above).

## Local dev (backend + agents)

- If the user already runs the backend on port `3001`, test via HTTP to that instance — avoid a second process (`EADDRINUSE`).
- If **you** started a dev server only to verify work, **stop it** when done; do not stop the user’s long-running terminal without asking.

## Icons & images

No raster assets for UI icons/illustrations; prefer SVG, Lucide, or CSS. If a bitmap is a hard business requirement, confirm with the user first.
