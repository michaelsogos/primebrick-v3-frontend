# Svelte 5 Runes Patterns

> All examples sourced from official Svelte 5 documentation pulled via the
> Svelte MCP `get-documentation` tool. This document is the extended reference
> for the [`.devin/rules/svelte-runes.md`](../../.devin/rules/svelte-runes.md)
> always-on rule.

## Table of contents

1. [`$state`](#state)
2. [`$props`](#props)
3. [`$derived` / `$derived.by`](#derived)
4. [`$effect`](#effect)
5. [`$bindable`](#bindable)
6. [Anti-patterns](#anti-patterns)
7. [Decision flowchart](#decision-flowchart)
8. [Svelte MCP workflow](#svelte-mcp-workflow)
9. [ESLint integration](#eslint-integration)

---

## `$state`

The `$state` rune creates reactive state — your UI reacts when it changes.

```svelte
<script>
  let count = $state(0);
</script>

<button onclick={() => count++}>
  clicks: {count}
</button>
```

### Deep state

If `$state` is used with an array or object, the result is a deeply reactive
proxy. Modifying properties triggers granular updates:

```js
let todos = $state([{ done: false, text: 'add more todos' }]);
todos[0].done = !todos[0].done; // triggers update
todos.push({ done: false, text: 'eat lunch' }); // also triggers update
```

### `$state.raw`

For large arrays/objects you don't plan to mutate — avoids proxy overhead.
Can only be reassigned, not mutated:

```js
let person = $state.raw({ name: 'Heraclitus', age: 49 });
person.age += 1; // no effect
person = { name: 'Heraclitus', age: 50 }; // works
```

### `$state.snapshot`

Takes a static snapshot of a deeply reactive proxy (for external libraries,
`structuredClone`, etc.):

```js
let counter = $state({ count: 0 });
const snapshot = $state.snapshot(counter); // plain object, not Proxy
```

### Passing state into functions (WHY `state_referenced_locally` happens)

JavaScript is **pass-by-value** — when you call a function, the arguments are
the *values*, not the *variables*. This is the root cause of
`state_referenced_locally`:

```js
// ❌ captures the current value — won't update when `a` or `b` change
let a = $state(1);
let b = $state(2);
const total = add(a, b); // total is frozen at 3

a = 3;
b = 4;
console.log(total); // still 3!
```

To keep the reactive link, pass functions instead:

```js
// ✅ stays reactive
let a = $state(1);
let b = $state(2);
const getTotal = add(() => a, () => b); // returns () => a() + b()
console.log(getTotal()); // 3
a = 3; b = 4;
console.log(getTotal()); // 7
```

Or use `$derived`:

```js
let a = $state(1);
let b = $state(2);
const total = $derived(a + b); // reactive
```

---

## `$props`

Props are passed from parent to child. Use typed destructuring from `$props()`:

```svelte
<script lang="ts">
  let { name, age }: { name: string; age: number } = $props();
</script>
```

With defaults:

```svelte
<script lang="ts">
  let { value = 0 }: { value?: number } = $props();
</script>
```

With renaming and rest:

```svelte
<script lang="ts">
  let { class: className, ...rest }: { class?: string; [key: string]: any } = $props();
</script>
```

> **Warning**: Default values in `$props()` are NOT reactive — they are
> evaluated once. If you compute a value from props, use `$derived`.

---

## `$derived`

Use `$derived` for any value that depends on reactive sources:

```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
```

### WARNING: Do NOT put anonymous functions inside `$derived()`

```js
// ❌ WRONG — returns a function, not a value
let doubled = $derived(() => count * 2);

// ✅ CORRECT — returns the computed value
let doubled = $derived(count * 2);
```

### `$derived.by` — for complex logic

When you need loops, multiple statements, or complex conditions:

```js
let total = $derived.by(() => {
  let sum = 0;
  for (const item of items) {
    sum += item.price;
  }
  return sum;
});
```

### Overriding derived values (Svelte 5.25+)

Derived values can be directly overridden (e.g., for optimistic UI):

```js
let saved = $derived(data);
// Later: saved = newData; // overrides until data changes again
```

---

## `$effect`

Effects run when state updates. Use for **side effects only** — DOM
manipulation, network requests, subscriptions:

```svelte
<script>
  let canvas;
  let size = $state(50);
  let color = $state('#ff3e00');

  $effect(() => {
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = color;
    context.fillRect(0, 0, size, size);
  });
</script>
```

### When NOT to use `$effect`

**Do not use `$effect` to synchronize state.** Use `$derived` instead:

```svelte
<!-- ❌ don't do this -->
<script>
  let count = $state(0);
  let doubled = $state();
  $effect(() => { doubled = count * 2; });
</script>

<!-- ✅ do this -->
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
```

### Dependency tracking

`$effect` automatically tracks reactive values read **synchronously** inside
its function body. Values read after `await` or inside `setTimeout` are NOT
tracked:

```js
$effect(() => {
  console.log(color); // tracked — re-runs when color changes
  setTimeout(() => {
    console.log(size); // NOT tracked — won't re-run when size changes
  }, 0);
});
```

### Teardown

Return a function to clean up before re-runs or on destroy:

```js
$effect(() => {
  const interval = setInterval(() => count++, 1000);
  return () => clearInterval(interval);
});
```

---

## `$bindable`

For two-way binding (child → parent data flow). Use sparingly:

```svelte
<!-- FancyInput.svelte -->
<script>
  let { value = $bindable(), ...props } = $props();
</script>

<input bind:value={value} {...props} />
```

```svelte
<!-- Parent.svelte -->
<script>
  import FancyInput from './FancyInput.svelte';
  let message = $state('hello');
</script>

<FancyInput bind:value={message} />
<p>{message}</p>
```

With fallback:

```js
let { value = $bindable('fallback') } = $props();
```

---

## Anti-patterns

### 1. `state_referenced_locally` — snapshotting props/state in a `const`

```svelte
<!-- ❌ -->
<script>
  let { entity, translationKey } = $props();
  const i18nEntity = translationKey ?? entity; // snapshots initial value
</script>
```

```svelte
<!-- ✅ -->
<script>
  let { entity, translationKey } = $props();
  const i18nEntity = $derived(translationKey ?? entity); // reactive
</script>
```

**Enforcement**: `svelte.config.js` `onwarn` elevates this to a build-breaking
error in production.

### 2. Anonymous function inside `$derived()`

```js
// ❌
let doubled = $derived(() => count * 2);

// ✅
let doubled = $derived(count * 2);
```

**Enforcement**: AGENTS.md rule #3.

### 3. Using `$effect` for derived state

```js
// ❌
let doubled = $state();
$effect(() => { doubled = count * 2; });

// ✅
let doubled = $derived(count * 2);
```

**Enforcement**: Code review + `svelte/prefer-writable-derived` ESLint rule.

### 4. Mutating `$derived` values (pre-5.25 behavior)

Before Svelte 5.25, `$derived` values were read-only. Since 5.25, they can be
overridden. If you need a value that's computed but also reassignable, use
`$derived` (overridable) or `$state` + explicit update logic.

---

## Decision flowchart

```
I have a value that depends on other reactive values
│
├─ Is it a simple expression (a + b, cond ? x : y)?
│  └─ YES → use $derived(expr)
│
├─ Does it need loops, multiple statements, or complex logic?
│  └─ YES → use $derived.by(() => { ... return value; })
│
├─ Is it local mutable state initialized from a prop, then reassigned?
│  └─ YES → use $state(prop) + svelte-ignore state_referenced_locally
│
├─ Is it a one-time registration/initialization with a prop?
│  └─ YES → use the prop directly + svelte-ignore state_referenced_locally
│
├─ Is it a side effect (DOM, fetch, subscription)?
│  └─ YES → use $effect(() => { ... return cleanup; })
│
└─ Are you synchronizing state from other state?
   └─ STOP — use $derived instead of $effect
```

---

## Svelte MCP workflow

The Svelte MCP server exposes 5 tools. Agents MUST use them when working with
Svelte code:

| Tool | When to use |
|------|-------------|
| `svelte-autofixer` | **MANDATORY before writing any `.svelte` file.** Pass the proposed code, fix any `issues` returned. |
| `get-documentation` | When you need authoritative Svelte 5 docs. Pass section names (e.g., `"$state"`, `"$derived"`). |
| `list-sections` | When you don't know which doc sections exist. Call first, then `get-documentation`. |
| `playground-link` | When you want to share a runnable example with the user (NOT for code written to project files). |
| `playground-link-ui` | UI variant of `playground-link`. |

### Example workflow

1. Write the Svelte component code in memory.
2. Pass it to `svelte-autofixer` with `desired_svelte_version: 5`.
3. If `issues` are returned, fix them and re-validate.
4. Once `issues` is empty, write the code to the `.svelte` file.
5. Run `pnpm run build` to verify the `onwarn` handler doesn't catch anything.

---

## ESLint integration

The project uses `eslint-plugin-svelte` via `eslint.config.js`. Run with:

```sh
pnpm run lint       # check
pnpm run lint:fix   # auto-fix
```

### What ESLint catches

| Rule | What it detects |
|------|----------------|
| `svelte/prefer-derived-over-derived-by` | Unnecessary `$derived.by()` when `$derived()` suffices (auto-fixable) |
| `svelte/require-each-key` | Missing keys on `{#each}` blocks |
| `svelte/no-navigation-without-resolve` | `goto()` calls without `resolve()` |
| `svelte/prefer-svelte-reactivity` | Using `Set`/`Map`/`URLSearchParams` instead of `SvelteSet`/`SvelteMap`/`SvelteURLSearchParams` |
| `svelte/no-useless-children-snippet` | Unnecessary `{#snippet children()}` |
| `svelte/no-at-html-tags` | `{@html}` XSS risk |
| `svelte/no-unused-svelte-ignore` | `svelte-ignore` comments that are no longer needed |
| `svelte/prefer-writable-derived` | Using `$state` + `$effect` instead of writable `$derived` |
| `@typescript-eslint/no-unused-vars` | Unused imports and variables |

### What ESLint CANNOT catch

- **`state_referenced_locally`** — this is a Svelte compiler warning, not an
  ESLint rule. Enforcement is via `svelte.config.js` `onwarn` (elevated to
  error in production builds).
- **All reactivity bugs** — e.g., using `$effect` for derived state instead of
  `$derived`, or mutating props. These are architectural patterns enforced via
  the [`.devin/rules/svelte-runes.md`](../../.devin/rules/svelte-runes.md) rule
  and code review.
- ESLint does NOT replace `svelte-check` — `svelte-check` does TypeScript
  type-checking for `.svelte` files. Both should run.
