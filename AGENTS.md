# AI AGENT INSTRUCTIONS - Primebrick Frontend

## ⚠️ CRITICAL: NEVER COMMIT AUTOMATICALLY

**AI agents MUST NEVER commit changes without explicit user instruction.**

- **WAIT for the user to explicitly tell you to commit** before running any `git commit` command
- This applies to ALL situations - no exceptions
- See [docs/gitflow.md](./docs/gitflow.md) for complete GitFlow rules including commit rules


## Svelte 5 & TypeScript Mandatory Rules
You are an expert Svelte 5 and TypeScript developer. You MUST EXCLUSIVELY use Svelte 5 Runes and native types.

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

## Repository overview

Independent Git repository containing the Primebrick SvelteKit application.

**Documentation language:** All `*.md` files must use **English** for team-facing prose.

## Stack & commands

| | |
|--|--|
| Stack | SvelteKit + Svelte 5 + TypeScript |
| Dev | `pnpm run dev` |
| Typecheck | `pnpm run check` |
| Build | `pnpm run build` |

## Where to look (order)

1. **`docs/ai/patterns.md`** — layout, vendor workflow, forms/tables/nav, dev etiquette.
2. **`docs/ai/i18n.md`** — translations rule (⚠️ CRITICAL: always add translations immediately when adding labels).
3. **`docs/ai/`** — skills selection and suggested workflows.

## GitFlow rules

This repository follows GitFlow. AI agents MUST follow these rules.

**See [docs/gitflow.md](./docs/gitflow.md) for complete GitFlow rules, branch management, closing procedure, version tagging, and commit rules.**

## Further documentation

See `docs/ai/` for UI patterns, skills selection, and suggested workflows.
