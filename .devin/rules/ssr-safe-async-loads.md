# Devin Rule: SSR-Safe Async Loads

## Trigger
- Applies whenever an AI agent creates a composable or component that
  calls `fetch`, `apiFetch`, or `apiFetchExt` during initialisation.

## Canonical doc
**`docs/ai/ssr-safe-async-loads.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- AI agent MUST wrap all `fetch`/`apiFetch`/`apiFetchExt` calls in
  `onMount` or a `load` function.
- AI agent MUST NOT call `fetch` at the top level of a composable
  function body.
- AI agent MUST NOT call `fetch` in component `<script>` init code
  outside of `onMount` or an event handler.
