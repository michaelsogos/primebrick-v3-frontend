# Devin Rule: Svelte 5 Runes Reactivity

> Canonical body of `.devin/rules/svelte-runes.md` — the rule file is a pointer to this page.

## Trigger
- Applies whenever an AI agent writes or edits `.svelte` files or `.svelte.ts`/`.svelte.js` modules.
- Applies whenever an agent creates a value that reads from `$props()`, `$state`, `$derived`, or any reactive source.

## Golden Rule

Any value computed from `$props()`, `$state`, `$derived`, or other reactive
sources MUST be declared with `$derived` (or `$derived.by` for complex logic).
Never read reactive sources into a plain `const`/`let` at component top level —
this triggers `state_referenced_locally` (elevated to a **build-breaking error**
in production via `svelte.config.js` `onwarn`) and produces stale values.

## Anti-Pattern (FORBIDDEN)

```svelte
<script lang="ts">
  let { entity, translationKey }: $$Props = $props();
  // ❌ snapshots the initial prop values — never updates
  const i18nEntity = translationKey ?? entity;
</script>
```

## Correct Pattern

```svelte
<script lang="ts">
  let { entity, translationKey }: $$Props = $props();
  // ✅ stays reactive — updates when props change
  const i18nEntity = $derived(translationKey ?? entity);
</script>
```

## Intentional one-time reads — `untrack()`

When a value must snapshot a reactive source ONCE (never re-track), express
the intent in code with `untrack()` — the sanctioned escape hatch. Never
with `svelte-ignore`: a suppression states intent in a comment the linter
cannot verify; `untrack()` states it in code that IS the behavior.

```svelte
<script lang="ts">
  import { untrack } from 'svelte';
  let { data } = $props();
  // service is a local mutable draft initialized from the load prop —
  // reassigned on save (panels remount to re-snapshot), so $derived
  // cannot be used.
  let service = $state(untrack(() => data.service));
</script>
```

`untrack()` semantics: evaluates the expression without registering
dependency reads — exactly what `$state(prop)` did implicitly and warned
about. Same runtime behavior, explicit intent, zero warnings.

Valid uses of `untrack()`:
- Local mutable draft state initialized from a prop (form data, toggles —
  reassigned by the user; panels remount to re-snapshot)
- One-time reads at initialization (guards, registrations, context sets):
  `untrack(() => ctx.registerTab(value))`
- Module-level caches initialized once from a reactive source

`svelte-ignore state_referenced_locally` is NOT sanctioned for these cases —
`untrack()` always expresses the same intent in verifiable code.

Invalid reasons for `untrack()` (they mean you wanted `$derived`):
- "I'm too lazy to use `$derived`"
- "The prop probably won't change" (use `$derived` anyway — it's future-proof)

## Decision Table

| Scenario | Use |
|----------|-----|
| Value is a simple expression reading reactive sources | `$derived(expr)` |
| Value needs loops, multiple statements, or complex logic | `$derived.by(() => { ... return value; })` |
| Local mutable state initialized from a prop, then reassigned | `$state(untrack(() => prop))` |
| One-time registration/initialization with a reactive source | `untrack(() => call())` |
| Side effects (DOM, fetch, subscriptions) | `$effect(() => { ... })` |
| Computed state that you also need to reassign | `$derived` (overridable since Svelte 5.25) or `$state` + `$effect` |

## Svelte MCP Tool Requirement (MANDATORY)

Before writing any `.svelte` file to disk, agents MUST pass the proposed code
to the `svelte-autofixer` MCP tool (server: `svelte`, tool: `svelte-autofixer`).
Fix any `issues` returned before writing to the file system.

For documentation and patterns, use `get-documentation` (server: `svelte`,
tool: `get-documentation`) to pull authoritative Svelte 5 docs instead of
relying on web search or memory.

## Enforcement

- `svelte.config.js` `onwarn` elevates `state_referenced_locally` to a
  **build-breaking error** in production builds (`process.env.NODE_ENV === 'production'`).
  In dev mode, it remains a warning so HMR is not disrupted.
- `node_modules` warnings are skipped (we cannot fix third-party code).
- `eslint-plugin-svelte` provides additional Svelte-specific linting via
  `pnpm run lint` (see `eslint.config.js`).
- The `svelte/prefer-derived-over-derived-by` ESLint rule is set to `error`.
- Agents MUST use `$derived` for any expression reading reactive sources.
- Agents MUST NOT use `svelte-ignore state_referenced_locally` — intentional
  one-time reads go through `untrack()` (same semantics, explicit in code).
  Any residual suppression must carry an explicit reason — the always-on
  `suppress-no-reason` check-standards rule flags bare suppression tags.
- Agents MUST use `svelte-autofixer` before writing `.svelte` files.

## References

- [Svelte 5 `$state` docs](https://svelte.dev/docs/svelte/$state) — "Passing state into functions" explains why `state_referenced_locally` happens
- [Svelte 5 `$derived` docs](https://svelte.dev/docs/svelte/$derived)
- [Svelte 5 `$effect` docs](https://svelte.dev/docs/svelte/$effect) — "When not to use `$effect`"
- [Extended patterns doc](../../docs/ai/svelte-runes.md)
- [AGENTS.md § "Svelte 5 & TypeScript Mandatory Rules"](../../AGENTS.md)

## Deep dive

The normative rules live here; the full mechanics and rationale are in `docs/dev-guide/ui-stack.mdx` — link, do not duplicate.
