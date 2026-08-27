# Devin Rule: Password Input Standard

## Trigger
- Applies whenever an AI agent creates or modifies a password-type input
  field (any field where the user types a secret: passwords, API keys,
  client secrets, tokens).

## The Two Categories of Password Input

### Category 1: Access password (login/auth)
The user types a password to **authenticate** — the password is NOT saved
to the BE, it is sent for verification only.

- Use `Password.PasswordInput` (eye toggle).
- Do NOT add `PasswordChecklist`.
- Do NOT add a policy `.refine()` to the Zod schema.
- Validation: only `required` (min 1) or basic length if needed.

**Example:** `LoginForm.svelte` — the password field authenticates the
user, it does not create/update a password.

### Category 2: Data-entry password (save)
The user types a password that **will be saved** to the BE (create
account, change password, set password on first login, admin setting a
user's password).

- Use `Password.PasswordInput` (eye toggle).
- **MANDATORY:** Add `PasswordChecklist` in the opposite column of the
  form grid, aligned via `row-start` / `row-span`.
- **MANDATORY:** Add an async `.refine()` on the `new_password` Zod
  field that checks `passwordPolicy.regex` and uses
  `passwordPolicy.state.errorLabelKey` as the error message.
- The refine MUST be async so it reads `passwordPolicy.state` at
  validation time (when the user types), not at schema creation time.
- Load the password policy in `onMount(() => { void passwordPolicy.load(); })`.

**Examples:** `ChangePasswordCard.svelte`, `ChangePasswordDialog.svelte`,
`users/create/+page.svelte`, `welcome/+page.svelte`.

### Category 3: Secrets / API keys (NOT user passwords)
API keys, client secrets, tokens — these are NOT user passwords and are
NOT subject to the password policy.

- Use `Password.PasswordInput` (eye toggle).
- Do NOT add `PasswordChecklist`.
- Do NOT add a policy `.refine()`.
- Validation: only `required` or format-specific as needed.

**Examples:** `security/+page.svelte` (OIDC client secret),
`email-providers/+page.svelte` (API key).

## The Base Rule (ALL categories)

ALL password-type inputs MUST use `Password.PasswordInput` from
`$lib/components/ui/password`.

NEVER use `<Input type="password">` — the plain Input component does not
include the visibility toggle (eye icon).

Do NOT pass `type="password"` to `Password.PasswordInput` — the component
manages the type dynamically based on toggle state.

## Category 2 — Required Pattern

```svelte
<script lang="ts">
  import { z } from 'zod';
  import { usePasswordPolicy } from '$lib/composables/usePasswordPolicy.svelte';
  import PasswordChecklist from '$lib/components/forms/PasswordChecklist.svelte';

  const passwordPolicy = usePasswordPolicy();

  const schema = z.object({
    new_password: z
      .string()
      .min(1, { message: 'validation.required' })
      .refine(async (val) => {
        if (!passwordPolicy.state.loaded || !val) return true;
        return passwordPolicy.regex.test(val);
      }, passwordPolicy.state.errorLabelKey),
    // ... other fields
  });

  onMount(() => {
    void passwordPolicy.load();
  });
</script

<!-- In the form grid, col 2 aligned with new_password row: -->
{#if $form.new_password && passwordPolicy.state.loaded}
  <div class="col-start-2 row-start-2 row-span-2">
    <PasswordChecklist
      password={$form.new_password}
      rules={[...passwordPolicy.state.checklistRules]}
      specialChars={passwordPolicy.state.specialChars}
    />
  </div>
{/if}
```

## Exceptions

OTP/code inputs (6-digit verification codes) are NOT password fields.
Use plain `Input` with:

```svelte
<Input
  type="text"
  inputmode="numeric"
  autocomplete="one-time-code"
  maxlength={6}
/>
```

These should NOT use `Password.PasswordInput` — they don't need a
visibility toggle and the `inputmode="numeric"` triggers a numeric
keyboard on mobile.

## Enforcement
- AI agent MUST use `Password.PasswordInput` for all password/secret
  fields.
- AI agent MUST NOT use `<Input type="password">` for password fields.
- AI agent MUST NOT pass `type="password"` to `Password.PasswordInput`
  (the component manages type internally).
- AI agent MUST add `PasswordChecklist` + async `.refine()` with
  `passwordPolicy.regex` for Category 2 (data-entry) password fields.
- AI agent MUST NOT add `PasswordChecklist` or policy `.refine()` for
  Category 1 (access) or Category 3 (secrets) fields.
- AI agent MUST use plain `Input` with `inputmode="numeric"` for OTP
  code inputs, NOT `Password.PasswordInput`.
