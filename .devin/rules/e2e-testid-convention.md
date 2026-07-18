# Devin Rule: E2E `data-testid` Convention (brittle-on-purpose)

## Trigger
- Applies whenever an AI agent creates, modifies, or removes an interactive
  DOM element (input, button, toggle, link, dialog action, list item, etc.)
  in a Svelte component or route that could be targeted by E2E tests.
- Also applies when creating new E2E test specs that need to locate elements.

## Philosophy: brittle-on-purpose

E2E tests locate elements via `data-testid` attributes — NOT via CSS classes,
i18n labels, or visible text. CSS classes and i18n strings change for cosmetic
reasons that don't affect behavior (wrong reason to break a test). `data-testid`
attributes break only when an element's **purpose** changes or the element is
removed — which is exactly the kind of refactor the team should be alerted to.

A failing E2E test that cannot find a `data-testid` is a **desired signal** that
a significant structural/UX refactor happened and the test (and possibly the
feature contract) needs review.

## Naming convention

Format: `<component-scope>-<element-purpose>` in `kebab-case`.

Rules:
1. **`<component-scope>`** = the Svelte component or route that owns the element
   (e.g. `login`, `welcome`, `passkey-enrollment`, `passkey-prompt`). Stable
   across refactors as long as the component's responsibility stays the same.
2. **`<element-purpose>`** = what the element IS or DOES, in semantic terms
   (e.g. `username-input`, `submit-button`, `otp-input`, `add-button`). Never
   the visible text, never the CSS class.
3. **Unique within the page** — if the same component renders multiple rows
   (e.g. passkey list), the container has the base testid and each row uses
   `data-testid="<base>-item"` with `data-credential-id="<id>"` (or similar)
   for disambiguation. Locators use `page.getByTestId('<base>-item').filter(...)`.
4. **Never reuse a testid across components** — each testid belongs to exactly
   one component/element. Duplication defeats the purpose.
5. **Testids are not styling hooks** — never add CSS selectors that target
   `[data-testid=...]`. They exist for test selection only.
6. **Adding/removing a testid is a deliberate act** — when refactoring, if you
   move an element to a new component, carry the testid with it (or update the
   E2E test in the same PR). Never silently drop a testid.

## Mandatory actions

- AI agent MUST add a `data-testid` to every new interactive element it creates
  in a Svelte component or route.
- AI agent MUST flag (in the chat, not silently) any existing interactive
  element that is missing a `data-testid` when editing a component.
- AI agent MUST NOT remove an existing `data-testid` without updating the E2E
  test that references it (search `src/e2e/` for the testid string first).
- AI agent MUST NOT derive a testid from a CSS class, i18n key, or visible text.
- AI agent MUST NOT use `[data-testid=...]` as a CSS selector in `<style>` or
  `class:` directives.
- AI agent MUST use `page.getByTestId(...)` as the primary locator strategy in
  E2E specs (`src/e2e/*.spec.ts`).

## When a component wraps a typed-input sub-component

If an interactive element is rendered through a typed Svelte sub-component
(e.g. `AsyncValidatedInput`, `TextInput`, `PasswordInput`, `Checkbox`) that
declares a `Props` type, the `data-testid` attribute MUST be:
1. Added to the sub-component's `Props` type as `"data-testid"?: string`.
2. Destructured in the sub-component's `$props()`.
3. Forwarded to the underlying native HTML element (or the next sub-component
   in the chain).

This ensures `data-testid` passes through TypeScript's prop checking.

## Reference

- Full testid registry + rationale: `docs/ai/e2e-testid-convention.md`
- E2E test suites using this convention: `src/e2e/auth-password.spec.ts`,
  `src/e2e/auth-passkey.spec.ts`

## Enforcement

- Violations of this rule MUST be flagged by the AI agent in the chat.
- The AI agent MUST NOT merge a component change that drops a testid without
  updating the corresponding E2E test.
