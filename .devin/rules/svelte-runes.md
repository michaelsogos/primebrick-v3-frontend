# Devin Rule: Svelte 5 Runes Reactivity

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

## When to use `svelte-ignore state_referenced_locally`

Only when the value is genuinely static and you intentionally want the initial
value. Add a comment explaining why:

```svelte
<script lang="ts">
  let { data } = $props();
  // svelte-ignore state_referenced_locally
  // service is local mutable state initialized from the SvelteKit load prop.
  // It is reassigned on save, so $derived cannot be used.
  let service = $state(data.service);
</script>
```

Valid reasons for `svelte-ignore`:
- Local mutable state initialized from a prop (form data, then reassigned on save)
- One-time registration calls (e.g., `ctx.registerTab(value)`)
- Test fixtures where the prop never changes

Invalid reasons for `svelte-ignore`:
- "I'm too lazy to use `$derived`"
- "The prop probably won't change" (use `$derived` anyway — it's future-proof)
- No comment explaining why the initial value is intentional

## Decision Table

| Scenario | Use |
|----------|-----|
| Value is a simple expression reading reactive sources | `$derived(expr)` |
| Value needs loops, multiple statements, or complex logic | `$derived.by(() => { ... return value; })` |
| Local mutable state initialized from a prop, then reassigned | `$state(prop)` + `svelte-ignore` |
| One-time registration/initialization with a prop | `svelte-ignore` |
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
- Agents MUST NOT suppress `state_referenced_locally` with `svelte-ignore`
  unless the value is genuinely static (with a comment explaining why).
- Agents MUST use `svelte-autofixer` before writing `.svelte` files.

## References

- [Svelte 5 `$state` docs](https://svelte.dev/docs/svelte/$state) — "Passing state into functions" explains why `state_referenced_locally` happens
- [Svelte 5 `$derived` docs](https://svelte.dev/docs/svelte/$derived)
- [Svelte 5 `$effect` docs](https://svelte.dev/docs/svelte/$effect) — "When not to use `$effect`"
- [Extended patterns doc](../../docs/ai/svelte-runes.md)
- [AGENTS.md § "Svelte 5 & TypeScript Mandatory Rules"](../../AGENTS.md)
