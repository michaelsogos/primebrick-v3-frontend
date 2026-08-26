# Devin Rule: SSR-Safe Async Loads

## Trigger
- Applies whenever an AI agent creates a composable or component that
  calls `fetch`, `apiFetch`, or `apiFetchExt` during initialisation.

## The Rule

NEVER call `fetch` (or `apiFetch` / `apiFetchExt`) eagerly during
component initialisation or at the top level of a composable function
body. SvelteKit runs component init during server-side rendering (SSR),
and `fetch` calls there trigger the warning:

```
Avoid calling `fetch` eagerly during server-side rendering — put your
`fetch` calls inside `onMount` or a `load` function instead
```

## Why

- During SSR, `onMount` does NOT run — it only runs on the client.
- Top-level `fetch` calls in component init or composable bodies execute
  during SSR, which is not the intended behaviour for client-only data
  (e.g. user-specific API calls, policy fetches).
- SvelteKit's SSR fetch context is different from the client fetch
  context (relative URLs, cookie forwarding, etc.).

## Correct Pattern

### Composable with async load

```ts
export function useSomething() {
  const _state = $state({ loaded: false, data: null });

  async function load() {
    const res = await apiFetch('/api/v1/something');
    // ...
    _state.loaded = true;
  }

  return { get state() { return _state; }, load };
}
```

### Component calling the composable

```svelte
<script>
  import { onMount } from 'svelte';
  const something = useSomething();

  onMount(() => {
    void something.load();
  });
</script>
```

The `onMount` callback only runs on the client — SSR skips it entirely.

## Forbidden Patterns

```ts
// ❌ Eager fetch in composable body
export function useSomething() {
  const _state = $state({ loaded: false });
  apiFetch('/api/v1/something').then(...); // runs during SSR!
  return { state: _state };
}
```

```svelte
<!-- ❌ Eager fetch in component init -->
<script>
  const data = $state(null);
  apiFetch('/api/v1/something').then(d => data = d); // runs during SSR!
</script>
```

## Enforcement
- AI agent MUST wrap all `fetch`/`apiFetch`/`apiFetchExt` calls in
  `onMount` or a `load` function.
- AI agent MUST NOT call `fetch` at the top level of a composable
  function body.
- AI agent MUST NOT call `fetch` in component `<script>` init code
  outside of `onMount` or an event handler.
