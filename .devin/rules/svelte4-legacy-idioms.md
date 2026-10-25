# Devin Rule: No Svelte 4 Legacy Idioms

## Trigger
- Applies whenever an AI agent writes or edits `.svelte` files or
  `.svelte.ts`/`.svelte.js` modules.
- Complements `svelte-runes.md` (reactivity). This rule covers **legacy
  Svelte 4 syntax/idioms** that still compile under runes mode but are
  non-idiomatic and banned.

## Canonical doc
**`docs/ai/svelte4-legacy-idioms.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- `svelte-autofixer` (Svelte MCP) flags `$:` — run it before writing any
  `.svelte` file (mandatory per `svelte-runes.md`).
- `$$Props`, `export let`, `createEventDispatcher`, `<slot>` do NOT always
  produce compiler warnings — absence of warnings is NOT proof of
  compliance. Review idioms when editing a file.
- Agents MUST migrate legacy idioms found in files they touch.
