# Devin Rule: Svelte 5 Runes Reactivity

## Trigger
- Applies whenever an AI agent writes or edits `.svelte` files or `.svelte.ts`/`.svelte.js` modules.
- Applies whenever an agent creates a value that reads from `$props()`, `$state`, `$derived`, or any reactive source.

## Canonical doc
**`docs/ai/svelte-runes.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

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
