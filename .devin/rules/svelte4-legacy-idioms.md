# Devin Rule: No Svelte 4 Legacy Idioms

## Trigger
- Applies whenever an AI agent writes or edits `.svelte` files or
  `.svelte.ts`/`.svelte.js` modules.
- Complements `svelte-runes.md` (reactivity). This rule covers **legacy
  Svelte 4 syntax/idioms** that still compile under runes mode but are
  non-idiomatic and banned.

## Golden Rule

This codebase is **Svelte 5 runes-only**. Never introduce or keep Svelte 4
idioms when touching a file. If you edit a file that still contains them,
migrate them in the same edit.

## Forbidden idioms

### 1. `interface $$Props` — legacy prop typing

In runes mode `$$Props` is just a dead interface name (its magic existed in
Svelte 4 legacy mode). Type props directly in the `$props()` destructuring.

❌ Forbidden:

```svelte
<script lang="ts">
  interface $$Props {
    stickyColumns: ColumnLike[];
    visibleKeys: string[];
    onToggle?: (key: string) => void;
  }
  let { stickyColumns, visibleKeys, onToggle }: $$Props = $props();
</script>
```

✅ Correct:

```svelte
<script lang="ts">
  let {
    stickyColumns,
    visibleKeys,
    onToggle
  }: {
    stickyColumns: ColumnLike[];
    visibleKeys: string[];
    onToggle?: (key: string) => void;
  } = $props();
</script>
```

For long/complex prop types you MAY declare a named `interface Props` (never
`$$Props`) and use it: `let { ... }: Props = $props();`.

### 2. `$:` reactive statements

Use `$derived` / `$derived.by` / `$effect` instead. See `svelte-runes.md`.

### 3. `export let` prop declarations

Use `let { x } = $props()`.

### 4. `createEventDispatcher`

Use callback props typed as functions (`onchange?: (v: T) => void`).

### 5. `<slot>` / `slot="..."`

Use `{#snippet}` + `children`/`Snippet` props.

### 6. `<svelte:component>` dynamic components

In Svelte 5 components are dynamic by default — render the component value
directly (`<Content />` where `Content` holds a component reference).

### 7. `$$restProps` / `$$slots`

Use `...rest` in the `$props()` destructure and `Snippet` props.

## Real evidence of violations in this repo (as of 2026-09-27)

`interface $$Props` survives in **16 files** — all of them already on
`$props()`, so it is purely a naming/typing cleanup:

- `src/lib/components/AppTopbar.svelte`
- `src/lib/components/entity-list-table/panels/ColumnSelectorPanel.svelte`
- `src/lib/components/entity-list-table/panels/FiltersPanel.svelte`
- `src/lib/components/entity-list-table/panels/SearchInPanel.svelte`
- `src/lib/components/ui/ai-icon/ai-icon.svelte`
- `src/lib/components/ui/gradient-icon/gradient-icon.svelte`
- `src/lib/components/ui/smart-regex-input/regex-flags-panel.svelte`
- `src/lib/components/ui/smart-regex-input/smart-regex-input.svelte`
- `src/lib/entity-list/sheets/panels/ColumnsPanel.svelte`
- `src/lib/entity-list/sheets/panels/FiltersPanel.svelte`
- `src/lib/entity-list/sheets/panels/SearchInPanel.svelte`
- `src/lib/entity-list/sheets/panels/VersionHistoryPanel.svelte`
- `src/lib/shell/sheets/SheetHeader.svelte`
- `src/lib/shell/sheets/panels/CurrencySelectPanel.svelte`
- `src/lib/shell/sheets/panels/PhonePrefixSelectPanel.svelte`
- `src/lib/shell/sheets/panels/ProtocolSelectPanel.svelte`

(Remediation tracked in
`primebrick-workspace/ai-plans/svelte4-legacy-cleanup-plan.md`.)

## Enforcement

- `svelte-autofixer` (Svelte MCP) flags `$:` — run it before writing any
  `.svelte` file (mandatory per `svelte-runes.md`).
- `$$Props`, `export let`, `createEventDispatcher`, `<slot>` do NOT always
  produce compiler warnings — absence of warnings is NOT proof of
  compliance. Review idioms when editing a file.
- Agents MUST migrate legacy idioms found in files they touch.
