# Devin Rule: Password Input Standard

## Trigger
- Applies whenever an AI agent creates or modifies a password-type input
  field (any field where the user types a secret: passwords, API keys,
  client secrets, tokens).

## Canonical doc
**`docs/ai/password-input-standard.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

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
- AI agent MUST use `OtpInput` + `useOtpInput` for OTP code inputs —
  NOT `Password.PasswordInput` and NOT a plain `Input`.
