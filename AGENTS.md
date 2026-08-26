# AI AGENT INSTRUCTIONS - Primebrick Frontend

## ⚠️ CRITICAL: NEVER COMMIT AUTOMATICALLY

**AI agents MUST NEVER commit changes without explicit user instruction.**

- **WAIT for the user to explicitly tell you to commit** before running any `git commit` command
- This applies to ALL situations - no exceptions
- See [docs/gitflow.md](./docs/gitflow.md) for complete GitFlow rules including commit rules


## Svelte™ 5 & TypeScript® Mandatory Rules
You are an expert Svelte™ 5 and TypeScript® developer. You MUST EXCLUSIVELY use Svelte™ 5 Runes and native types.

1. **STATE**: Use `let x = $state<Type>(value)`.
2. **PROPS**: Use typed destructuring directly from `$props()`.
   - Example: `let { name, age }: { name: string; age: number } = $props();`
   - Optional with defaults: `let { value = 0 }: { value?: number } = $props();`
3. **DERIVED**: Use `$derived(expression)`. 
   - WARNING: Do NOT put anonymous functions inside `$derived()`. Write `$derived(a + b)` and NOT `$derived(() => a + b)`.
   - For complex logic, loops, or multiple conditions, you MUST use `$derived.by<Type>(() => { ... return value; })`.
4. **EVENTS**: Do NOT use `createEventDispatcher`. Use callbacks passed as props, typing them as functions.
   - Example: `let { onchange }: { onchange: (v: string) => void } = $props();`
5. **CHILDREN & SNIPPETS**: To pass HTML elements or components as children, use the `Snippet` type.
   - Example: `let { children }: { children: Snippet } = $props();` inside `{#render children()}`
6. **REACTIVITY**: Any value computed from `$props()`, `$state`, or other reactive
   sources MUST be declared with `$derived` (or `$derived.by` for complex logic).
   Never read reactive sources into a plain `const`/`let` at component top level —
   this triggers `state_referenced_locally` (elevated to a **build-breaking error**
   in production via `svelte.config.js` `onwarn`) and produces stale values.
   - ❌ `const i18nEntity = translationKey ?? entity;` (snapshots initial value)
   - ✅ `const i18nEntity = $derived(translationKey ?? entity);`
   - Use `svelte-ignore state_referenced_locally` ONLY when the value is genuinely
     static (e.g., local mutable state initialized from a prop, then reassigned on
     save). Add a comment explaining why.
   - See [`.devin/rules/svelte-runes.md`](./.devin/rules/svelte-runes.md) and
     [`docs/ai/svelte-runes.md`](./docs/ai/svelte-runes.md) for the full pattern guide.
7. **SVELTE MCP TOOL**: Before writing any `.svelte` file, agents MUST pass the
   proposed code to the `svelte-autofixer` MCP tool and fix any `issues` returned.
   Use `get-documentation` to pull authoritative Svelte 5 docs instead of relying
   on web search or memory.

## Repository overview

Independent Git repository containing the Primebrick SvelteKit™ application.

**Documentation language:** All `*.md` files must use **English** for team-facing prose.

## CI / Deployment

**This repo has NO auto-deploy CI. Deployment follows GitFlow.**

Pushing to `develop` or feature branches is fine for development, but deployment
only happens when a release branch is created, closed, and merged to `main` with
a version tag. There is no CI pipeline that auto-deploys on push.

### Primebrick CI/Deployment overview (all repos)

| Repo | CI/Deployment | Process to deploy |
|------|--------------|-------------------|
| **primebrick-v3-frontend** (this repo) | No auto-deploy CI | GitFlow: create release branch → close → merge to `main` + tag |
| **primebrick-v3-backend** (BE) | No auto-deploy CI | GitFlow: create release branch → close → merge to `main` + tag |
| **primebrick-v3-microservices** (US) | No auto-deploy CI | GitFlow: create release branch → close → merge to `main` + tag |
| **primebrick-v3-sdk** (SDK) | GitHub™ Actions | GitFlow: create release → close → merge to `main` + tag → CI publishes to npm |
| **primebrick-v3-dal** (DAL) | GitHub™ Actions | GitFlow: create release → close → merge to `main` + tag → CI publishes to npm |
| **primebrick-v3-docs** | Cloudflare® Worker CI | Push to `main` — auto-deploys |
| **primebrick-v3-website** | Cloudflare® Worker CI | Push to `main` — auto-deploys |

## Stack & commands

| | |
|--|--|
| Stack | SvelteKit™ + Svelte™ 5 + TypeScript® |
| Dev | `pnpm run dev` |
| Typecheck | `pnpm run check` |
| Build | `pnpm run build` |

## Where to look (order)

1. **`docs/ai/patterns.md`** — layout, vendor workflow, forms/tables/nav, dev etiquette.
2. **`docs/ai/i18n.md`** — translations rule (⚠️ CRITICAL: always add translations immediately when adding labels).
3. **`.devin/rules/translation-key-convention.md`** — ⚠️ CRITICAL: translation keys MUST be snake_case singular (e.g. `entities.user_profile.fields.*`, NOT `userProfile` or `user_profiles`).
4. **`docs/ai/`** — skills selection and suggested workflows.

## List pages

Any settings or module page that lists entity rows MUST use `EntityListTable` from `$lib/components/entity-list-table`. See `.devin/rules/entity-list-pages.md` for the full rule and the canonical pattern (mirror `users/+page.svelte`).

## Config List pages

Configuration pages (settings that are key/value rows with metadata-driven
inputs, NOT entity tables) MUST use the reusable `ConfigList` components from
`$lib/components/config-list`. These are NOT `EntityListTable` pages — they
render a list of rows with title/description on the left, a dynamic input in
the center, and a delete CTA on the right.

### Components

| Component | Purpose |
|-----------|---------|
| `ConfigList.svelte` | Top-level list — handles selection state, bulk action bar, loading/error/empty states, and **grouped rendering** by `group_key` (ungrouped entries first, then groups with translated section headers) |
| `ConfigListRow.svelte` | Single row — checkbox (non-reserved), title, description, dynamic input, delete CTA |
| `ConfigValueInput.svelte` | Dynamic input renderer — selects widget based on `entry.type` (switch, ComboSelect, DateWheelPicker, password, text, etc.) |
| `ConfigBulkActionBar.svelte` | Bulk action bar — shows selected count + bulk delete button |

### Usage

```svelte
import { ConfigList } from '$lib/components/config-list';
import { fetchConfigEntries, updateConfigEntry, deleteConfigEntry, bulkDeleteConfigEntries } from '$lib/api';
import { useMfaStepUp } from '$lib/composables/useMfaStepUp.svelte';

const stepUp = useMfaStepUp();

<ConfigList
  {entries}
  {loading}
  {error}
  onSave={handleSave}
  onDelete={handleDelete}
  onBulkDelete={handleBulkDelete}
/>
```

### Config types

The `ConfigEntry.type` field drives widget selection. See the BE AGENTS.md
"Config Table Standard" section for the full type vocabulary and `type_config`
JSON shapes.

### MFA integration

Delete and bulk-delete operations require step-up MFA. Use the `useMfaStepUp`
composable with `executeWithToken` — it automatically shows the MFA step-up
dialog when the BE returns 403 with `mfa_step_up_required: true`.

### Canonical example

The Security settings page (`src/routes/(app)/system/settings/security/+page.svelte`)
is the canonical example of a Config List page. Mirror it for future Config
Table pages.

## GitFlow rules

This repository follows GitFlow. AI agents MUST follow these rules.

**See [docs/gitflow.md](./docs/gitflow.md) for complete GitFlow rules, branch management, closing procedure, version tagging, and commit rules.**

## Error notifications — NEVER use toast directly (MANDATORY)

**NEVER call `toast.*()` or import `svelte-sonner` in components, routes, or composables.**

The shell has a dedicated notification infrastructure. All notifications MUST go through:
- `pushNotification(errorData)` — for BE API errors (RFC7807 object auto-detected by `type` + `status`)
- `pushNotification({ impact, message, scope, tags, detail })` — for full control with plain params
- `pushNotification({ impact: 'NONE', message, scope })` — for success (toast only, no event card)

All from `$lib/errors/app-errors`. This ensures errors appear in the shell
error panel (topbar badge + ErrorsPanel sheet) AND as a toast with correct
impact styling. Direct `toast.*()` calls bypass the error panel and lose
debuggability. See `.devin/rules/error-notification.md` for full details.

## Package Versioning — FIXED versions only (MANDATORY)

All package versions in `package.json` MUST be pinned to exact versions (e.g.
`"typescript": "5.9.3"`). NO ranges (`^`, `~`, `>=`, `*`, `latest`) are allowed
for registry packages. This ensures every dev machine, CI build, and production
rebuild gets the exact same dependency tree that was tested during UAT.

See [.devin/rules/package-versioning.md](./.devin/rules/package-versioning.md)
for the full rule and upgrade procedure.

## Further documentation

See `docs/ai/` for UI patterns, skills selection, and suggested workflows.

### E2E `data-testid` convention (MANDATORY for E2E + interactive elements)

Every interactive DOM element that an E2E test needs to locate MUST carry a
stable `data-testid` following the `<component-scope>-<element-purpose>`
kebab-case convention. Testids are derived from the element's **purpose**,
never from CSS classes, i18n labels, or visible text. This is a
**brittle-on-purpose** strategy: a failing E2E locator is a desired signal
that a significant refactor happened.

- Full convention + testid registry: [`docs/ai/e2e-testid-convention.md`](./docs/ai/e2e-testid-convention.md)
- Enforcing Devin rule: `.devin/rules/e2e-testid-convention.md` (always-on)
- E2E suites using this convention: `src/e2e/auth-password.spec.ts`,
  `src/e2e/auth-passkey.spec.ts`

## Composable state exposure pattern (MANDATORY)

All `use{Something}` composables MUST follow this pattern for exposing `$state`:

1. **Consolidate** all `$state` into a single `_state` object (underscore = internal).
2. **Expose** via `get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; }`.
3. **Mutations** only through exposed mutator functions — never direct property writes.
4. **`$derived`** values owned by the composable are exposed via individual `get x()` getters, NOT inside the `$state` object.
5. **Never** return `$derived` via object shorthand (`{ derived }`) — it freezes the value.
6. **Never** return raw `$state` without a getter — it allows uncontrolled mutation.
7. **Never** create wrapper objects inside getters (`{ value: x }`) — it breaks destructuring and creates garbage.

Import `DeepReadonly` from `$lib/types/deep-readonly`.

### Example

```ts
import type { DeepReadonly } from '$lib/types/deep-readonly';

export function useSomething() {
  const _state = $state({
    open: false,
    items: [] as string[],
  });

  function open() { _state.open = true; }
  function setItems(items: string[]) { _state.items = [...items]; }

  const itemCount = $derived(_state.items.length);

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    get itemCount() { return itemCount; },
    open,
    setItems,
  };
}
```

### Consumer usage

```ts
const something = useSomething();
// Reactive reads:
$derived(something.state.open)        // tracked
$derived(something.state.items.length) // tracked (deep)
// Mutations blocked at compile time:
// something.state.open = true        // TS2540
// something.state.items.push('x')    // TS2339
// Must use mutators:
something.open();                      // only path to mutation
```

## User-facing documentation

User-facing developer documentation lives in `docs/user-guide/` as MDX files.
These are synced to `docs.primebrick.dev` by the docs repo's CI pipeline.

- **Location**: `docs/user-guide/*.mdx` — one file per topic
- **Ordering**: `docs/user-guide/_order.json` defines the sidebar page order
- **Conventions**: see `.devin/rules/docs-user-guide.md` for editorial rules
- **Mermaid**: use `<Mermaid chart={...} />`, never ` ```Code ` or ` ```mermaid `
- **Component extraction**: run `pnpm extract-docs` to generate
  `docs/user-guide/_extracted/components.json` from Svelte™ components
- **Do NOT hand-edit** files in `docs/ai/` or `docs/skills/` — those are internal
- **Internal docs** (`docs/ai/`, `docs/skills/`, `docs/gitflow.md`) are NOT synced
  to the docs site — they stay in this repo for AI agents only
