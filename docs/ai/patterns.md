# Frontend patterns (extended reference)

**Language:** English for team-facing prose in Markdown.

## App page layout

In-app routes under the shell should **fill the main content area** (full width, no `mx-auto` / `max-w-*` unless a specific form needs it).

Use **`AppPageScaffold`** from `$lib/components/AppPageScaffold.svelte`: outer padding `p-2 sm:p-3`, column `gap-4`, `min-h-0` so flex children (tables, cards) can use remaining height. Put breadcrumb + `h1` (and optional toolbar) in `{#snippet header()}`; put the main block (e.g. entity list table) as default children.

## UI architecture (Shadcn-Svelte™)

Primebrick uses **Shadcn-Svelte™** as vendored UI source + Tailwind™.

### Customization (keep updates easy)

- **Composition-first:** wrappers, slots, props, local classes.
- Avoid changing primitive markup/variants unless necessary.
- If you must change a primitive: keep it small; expect vendor CLI may overwrite; prefer fixing in a wrapper when possible.

### When to use primitives vs wrappers

**Use primitives directly when:** few usages, no shared policy, styling is local.

**Create an app wrapper when:** app-wide defaults, shared behavior (permissions, analytics), domain components (`CustomerPicker`, `MoneyInput`), standard form UX.

**Naming (non-strict):** `src/lib/components/<DomainThing>.svelte` for domain; optional `src/lib/components/forms/` for form controls. Keep `src/lib/components/ui/*` for vendored primitives.

## Updating Shadcn-Svelte™ components (vendor workflow)

1. Branch: `chore/ui-vendor-update-YYYY-MM` — do not mix with feature work.
2. Update one component at a time: `pnpm dlx shadcn-svelte@<version> add <component> -o` (prefer explicit CLI version).
3. After each: `pnpm run check`; fix wrappers/usages first, patch primitives only if unavoidable.
4. Record CLI version in the PR description.

## UI patterns (conventions)

### Forms

Prefer shared form building blocks (e.g. `FormField`, `MoneyInput`, `DateInput` under `src/lib/components/forms/` when present). Validation UX (errors, spacing, disabled) should stay consistent; promote to wrapper only after repetition.

#### Detail-page primary CTA placement

A "detail page" is any non-table page (form page, settings sub-page, entity
edit/create page, etc.). Two layouts are allowed:

1. **Pure form (TUTTO FORM)** — the entire content is a single 2-column form
   (`grid grid-cols-2 gap-6`) with no other sections.
   - Use `FormPageLayout` (provides the card wrapper + audit footer).
   - The **DEFAULT primary button lives in the footer** via `footerActions`.
   - No other primary button inside the content.
   - The footer MAY hold multiple CTAs (primary + secondary).
   - The form is NOT wrapped in an extra `<Card>` — `FormPageLayout` already
     provides the wrapper.
   - Example: `/system/settings/profile`.

2. **Mixed content (UN PO' FORM + UN PO' ALTRO)** — the page mixes a form with
   other content (in-card lists, info boxes, multiple cards).
   - Use `AppPageScaffold` (NOT `FormPageLayout`) — no single footer primary.
   - **No primary button in the page footer.**
   - Each card that needs an action puts its own **DEFAULT primary button
     in `CardFooter`** (`variant="default"`, default `tone="primary"`).
   - The form keeps all its characteristics (2-col grid, validation,
     `use:enhance`, `FormField` blocks) and **MUST be wrapped in a `<Card>`**.
   - Example: `/system/settings/credentials` — 3 cards (Change Password,
     Passkeys, MFA), each with its own DEFAULT primary CTA in `CardFooter`.

**Soft primary** (`variant="soft" tone="primary"`) is used for in-card CTAs
**only when** a DEFAULT primary already exists in the footer (Layout 1 with
extra in-card actions). In Layout 2, in-card CTAs are **DEFAULT primary**.

See `.devin/rules/detail-page-cta-placement.md` and
`.devin/rules/card-content-layout.md` for the enforcing rules.

#### Card Content Layout Standard

Every `<Card>` with interactive content follows a **3-zone vertical
structure**:

1. **CardHeader** — icon + title + description (identity)
2. **CardContent** — form / list / table / empty state (NO CTAs here)
3. **CardFooter** — action buttons (CTAs)

**The 4 CardContent types:**

| Type | Internal layout | Column management |
|------|----------------|-------------------|
| FORM | At least 2 columns (`grid grid-cols-2 gap-6`) | Form grid |
| LIST | Single column | Each `<li>` item |
| TABLE | Single column | Table component |
| KANBAN | Single column | Kanban component |

**CTA placement in CardFooter:**
- All CTAs are right-aligned (`justify-end`), grouped together.
- Secondary first (leftmost in group), primary last (rightmost).
- CardFooter class: `bg-muted/50 border-t p-4 -mb-6 flex justify-end gap-2 rounded-b-xl`.
  The `-mb-6` cancels the card root's `py-6` bottom padding so the footer
  bleeds to the card's bottom edge (same pattern as `DialogFooter`'s `-mb-4`).
- This matches `DialogFooter` and `FormPageLayout` footer visually.
- Cards do NOT use `justify-between` (that is dialog-only for strong
  secondary/primary separation).

**When NOT to use CardFooter:**
- `BorderedDialog` → use `DialogFooter` (needs `-mx-4 -mb-4 rounded-b-xl`).
- `FormPageLayout` → use the built-in 50/50 grid footer (audit + actions).

**FORM type — field ordering:**
- 2-col grid, reading flow top-to-bottom (col 1 before col 2).
- Validation feedback (e.g. `PasswordChecklist`) goes in the opposite
  column, aligned via CSS grid `row-start` / `row-span`.

**FORM type — validation scoping:**
- Each card form uses its own `superForm({ SPA: true })` instance.
- Zod schemas defined inside the card component, not at page level.
- Validation triggers only on user interaction (tainted fields).
- The `onUpdate` callback handles the API call and error mapping locally.

#### Password inputs

ALL password-type inputs (passwords, API keys, client secrets, tokens)
MUST use `Password.PasswordInput` from `$lib/components/ui/password`.

- The component automatically includes an eye/eye-off visibility toggle
  (`ToggleVisibility` with `EyeIcon`/`EyeOffIcon`).
- NEVER use `<Input type="password">` — the plain Input has no toggle.
- Do NOT pass `type="password"` to `Password.PasswordInput` — the
  component manages the type dynamically based on toggle state.
- OTP/code inputs (6-digit verification codes) are NOT password fields —
  use plain `Input` with `inputmode="numeric" autocomplete="one-time-code"`.

There are **three categories** of password input, with different
validation requirements:

**Category 1 — Access password (login/auth):** The user types a password
to authenticate. The password is NOT saved, it is sent for verification.
- Only `Password.PasswordInput` (eye toggle). No checklist, no policy
  refine.
- Example: `LoginForm.svelte`.

**Category 2 — Data-entry password (save):** The user types a password
that will be saved to the BE (create account, change password, set
password, admin setting a user's password).
- `Password.PasswordInput` (eye toggle) **+** `PasswordChecklist` in the
  opposite form column **+** async `.refine()` on the Zod field checking
  `passwordPolicy.regex` with `passwordPolicy.state.errorLabelKey` as
  the error message.
- The refine MUST be async so it reads `passwordPolicy.state` at
  validation time, not at schema creation time.
- Load the policy in `onMount(() => { void passwordPolicy.load(); })`.
- Examples: `ChangePasswordCard.svelte`, `ChangePasswordDialog.svelte`,
  `users/create/+page.svelte`, `welcome/+page.svelte`.

**Category 3 — Secrets / API keys:** API keys, client secrets, tokens —
NOT user passwords, NOT subject to the password policy.
- Only `Password.PasswordInput` (eye toggle). No checklist, no policy
  refine.
- Examples: `security/+page.svelte` (OIDC client secret),
  `email-providers/+page.svelte` (API key).

See `.devin/rules/password-input-standard.md` for the enforcing rule.

### Tables / lists

Prefer one table pattern: headers, row hover, empty/loading, pagination/filters consistent across modules. Reusable abstractions should be **app components** composing primitives, not forks of primitives.

### SSR-safe async loads

NEVER call `fetch` / `apiFetch` / `apiFetchExt` eagerly during component
init or at the top level of a composable function body. SvelteKit runs
component init during SSR, and eager fetch triggers:

```
Avoid calling `fetch` eagerly during server-side rendering — put your
`fetch` calls inside `onMount` or a `load` function instead
```

Correct pattern: composable exposes a `load()` function, component calls
it inside `onMount(() => { void something.load(); })`. `onMount` only
runs on the client — SSR skips it entirely.

See `.devin/rules/ssr-safe-async-loads.md` for the enforcing rule.

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

**How to add a panel:** register the Svelte™ panel in `SheetHost.svelte`, extend `SheetPanelId` / `SheetPanelPropsMap` in the manager, then call `openSheet('<id>', props, { contentClass, side })` from buttons or explicit user actions.

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

No raster assets for UI icons/illustrations; prefer SVG, Lucide™, or CSS. If a bitmap is a hard business requirement, confirm with the user first.
