# E2E `data-testid` Convention (brittle-on-purpose)

> **Audience:** AI agents and humans writing E2E tests or Svelte components in
> this repo. This doc is the reference; the enforcing rule lives in
> `.devin/rules/e2e-testid-convention.md`.

## Why `data-testid`, not classes or text

E2E tests need to locate DOM elements reliably. Three locator strategies exist:

| Strategy              | Breaks when...                              | Good break? |
|-----------------------|---------------------------------------------|-------------|
| CSS class / selector  | Tailwind/CSS refactor, class rename         | **No** — cosmetic, not behavioral |
| i18n label / text     | Translation change, locale switch, copy edit| **No** — cosmetic, not behavioral |
| `data-testid`         | Element removed or its purpose changes      | **Yes** — structural/behavioral refactor |

`data-testid` is **brittle-on-purpose**: it breaks only for the right reason.
A failing E2E locator is a desired signal that a significant refactor happened
and the test (and possibly the feature contract) needs review.

## Naming convention

Format: `<component-scope>-<element-purpose>` in `kebab-case`.

- **`<component-scope>`** — the Svelte component or route that owns the element.
  Stable across refactors as long as the component's responsibility stays the
  same. Examples: `login`, `welcome`, `passkey-enrollment`, `passkey-prompt`,
  `admin-user-create`.
- **`<element-purpose>`** — what the element IS or DOES, in semantic terms.
  Examples: `username-input`, `submit-button`, `otp-input`, `add-button`,
  `delete-button`, `error-alert`.

### Rules

1. Unique within the page.
2. Never reuse a testid across two different components.
3. Never derive a testid from a CSS class, i18n key, or visible text.
4. Never use `[data-testid=...]` as a CSS selector.
5. When you move/rename/remove an element during a refactor, either carry the
   testid to the new element or update the E2E test in the same PR. Never
   silently drop a testid.

### List items with disambiguation

When a component renders a list of rows (e.g. enrolled passkeys), the container
gets the base testid and each row uses `<base>-item` plus a disambiguating
data attribute:

```svelte
<ul data-testid="passkey-enrollment-list">
  {#each credentials as cred (cred.id)}
    <li data-testid="passkey-enrollment-item" data-credential-id={cred.id}>
      ...
      <Button data-testid="passkey-enrollment-delete-button" ...>
    </li>
  {/each}
</ul>
```

Locate a specific row in Playwright:

```ts
const item = page.getByTestId('passkey-enrollment-item')
  .filter({ has: page.getByText(credentialIdPrefix) });
await item.getByTestId('passkey-enrollment-delete-button').click();
```

## Locator usage in tests

All E2E locators use `page.getByTestId(...)` as the primary selector:

```ts
await page.getByTestId('login-username-input').fill('admin');
await page.getByTestId('login-password-input').fill('admin');
await page.getByTestId('login-submit-button').click();
```

## Passing `data-testid` through typed sub-components

When an interactive element is rendered through a typed Svelte sub-component
(e.g. `AsyncValidatedInput`, `TextInput`, `PasswordInput`, `Checkbox`), the
`data-testid` attribute must be declared in the sub-component's `Props` type,
destructured in `$props()`, and forwarded to the underlying native element.

Example (`async-validated-input.svelte`):

```ts
type Props = {
  // ...existing props...
  "data-testid"?: string;
};

let { /* ... */, "data-testid": dataTestId }: Props = $props();
```

```svelte
<TextInput
  /* ...existing props... */
  data-testid={dataTestId}
/>
```

This ensures `data-testid` passes TypeScript prop checking.

## Testid registry

Keep this table in sync whenever you add or change a testid. The enforcing
Devin rule (`.devin/rules/e2e-testid-convention.md`) references this doc.

### Login flow

| Component (file)                                 | Element            | `data-testid`                       |
|--------------------------------------------------|--------------------|-------------------------------------|
| `LoginForm.svelte`                               | username input     | `login-username-input`              |
| `LoginForm.svelte`                               | password input     | `login-password-input`              |
| `LoginForm.svelte`                               | submit button      | `login-submit-button`               |
| `PasskeyButton.svelte`                           | passkey button     | `login-passkey-button`              |

### Welcome / onboarding

| Component (file)                                 | Element            | `data-testid`                       |
|--------------------------------------------------|--------------------|-------------------------------------|
| `welcome/+page.svelte`                           | loading step       | `welcome-step-loading`              |
| `welcome/+page.svelte`                           | error step         | `welcome-step-error`                |
| `welcome/+page.svelte`                           | error message      | `welcome-error-message`             |
| `welcome/+page.svelte`                           | otp-sent step      | `welcome-step-otp-sent`             |
| `welcome/+page.svelte`                           | otp-verified step  | `welcome-step-otp-verified`         |
| `welcome/+page.svelte`                           | complete step      | `welcome-step-complete`             |
| `welcome/+page.svelte`                           | error alert        | `welcome-error-alert`               |
| `welcome/+page.svelte`                           | OTP input          | `welcome-otp-input`                 |
| `welcome/+page.svelte`                           | verify/next button | `welcome-next-button`               |
| `welcome/+page.svelte`                           | resend OTP button  | `welcome-resend-otp-button`         |
| `welcome/+page.svelte`                           | new password input | `welcome-password-input`            |
| `welcome/+page.svelte`                           | confirm password   | `welcome-password-confirm-input`    |
| `welcome/+page.svelte`                           | complete button    | `welcome-complete-button`           |

### Passkey enrollment & prompt

| Component (file)                                 | Element            | `data-testid`                          |
|--------------------------------------------------|--------------------|----------------------------------------|
| `PasskeyEnrollment.svelte`                       | empty state        | `passkey-enrollment-empty`             |
| `PasskeyEnrollment.svelte`                       | credential list    | `passkey-enrollment-list`              |
| `PasskeyEnrollment.svelte`                       | list item (row)    | `passkey-enrollment-item`              |
| `PasskeyEnrollment.svelte`                       | delete button (row)| `passkey-enrollment-delete-button`     |
| `PasskeyEnrollment.svelte`                       | add-passkey button | `passkey-enrollment-add-button`        |
| `PasskeyPromptDialog.svelte`                     | dismiss button     | `passkey-prompt-dismiss-button`        |
| `PasskeyPromptDialog.svelte`                     | enroll button      | `passkey-prompt-enroll-button`         |

### Admin user creation

| Component (file)                                 | Element                | `data-testid`                              |
|--------------------------------------------------|------------------------|--------------------------------------------|
| `(app)/system/settings/users/create/+page.svelte`| create-user form       | `admin-user-create-form`                   |
| `(app)/system/settings/users/create/+page.svelte`| display name input     | `admin-user-create-display-name-input`     |
| `(app)/system/settings/users/create/+page.svelte`| email input            | `admin-user-create-email-input`            |
| `(app)/system/settings/users/create/+page.svelte`| username input         | `admin-user-create-username-input`         |
| `(app)/system/settings/users/create/+page.svelte`| org select (ComboSelect) | `admin-user-create-org-select`           |
| `(app)/system/settings/users/create/+page.svelte`| roles select (ComboSelect) | `admin-user-create-roles-select`       |
| `(app)/system/settings/users/create/+page.svelte`| send-invitation toggle | `admin-user-create-send-invitation-toggle` |
| `(app)/system/settings/users/create/+page.svelte`| submit button          | `admin-user-create-submit-button`          |

> **ComboSelect note:** the `ComboSelect` component forwards `data-testid` to
> its trigger `<div>` (the combobox element). Dropdown options inside the
> popover use `[role='option']` — they are located by role + text content
> (org names and role names are data-driven, not i18n strings, so text-based
> selection is acceptable for options).

## Refactor protocol

When refactoring a component that has testids:

1. **Moving an element to a new component** — carry the testid to the new
   component. The E2E test should not need to change.
2. **Removing an element** — search `src/e2e/` for the testid string. If a test
   references it, update the test in the same PR (the test may need to be
   removed or rewritten to assert the new behavior).
3. **Repurposing an element** (e.g. a button that used to "submit" now "saves
   and continues") — rename the testid to reflect the new purpose and update
   the E2E test. Do not keep a stale testid that no longer matches the purpose.
4. **Adding a new interactive element** — add a testid in the same PR.

## Enforcement

- The Devin rule `.devin/rules/e2e-testid-convention.md` is always-on and
  enforced on every AI agent session.
- AI agents MUST flag missing testids when editing components.
- AI agents MUST NOT silently drop a testid during a refactor.
