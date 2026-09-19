# Devin Rule: OTP / PIN Code Input

## Trigger
- Applies whenever a UI needs a short numeric verification code (MFA TOTP,
  welcome/invitation OTP, step-up auth, enrollment verify).

## Golden Rule

**Always use `OtpInput` + `useOtpInput` — never a raw `<Input>` for codes.**

```svelte
<script lang="ts">
  import OtpInput from '$lib/components/otp-input/otp-input.svelte';
  import { useOtpInput } from '$lib/composables/useOtpInput.svelte';

  const otp = useOtpInput({
    onSubmit: () => verify(),          // same function the Verify button calls
    disabled: () => submitting,        // suppress re-entry while in flight
  });
</script>

<OtpInput
  id="mfa-code"
  data-testid="mfa-code-input"
  bind:value={otp.code}
  onsubmit={otp.requestSubmit}
  disabled={submitting}
/>
```

## Behavior contract (already built-in — do not reimplement)

- **Digits only** — `pattern={REGEXP_ONLY_DIGITS}` (bits-ui `PinInput`).
- **Paste** — `pasteTransformer` strips non-digits and fills all cells instantly.
- **Auto-submit** — `onsubmit` fires when all cells are filled (`onComplete`).
- **Enter** — `onsubmit` fires on Enter regardless of fill; the caller's
  verify function decides validity (same path as the Verify button).
- **No double submit** — `useOtpInput`'s `disabled` predicate suppresses
  `requestSubmit` while a request is in flight; the caller must pass the
  in-flight flag.
- **Reset on failure** — call `otp.reset()` in the error path so the user
  can retype immediately (all existing call sites do this).

## Styling

Separated cells with `border-primary-gradient` (same border treatment as the
`Input` component), middle separator dash, horizontally centered. Do not
restyle per call site — adjust `otp-input.svelte` / `input-otp-slot.svelte`.

## Testing

jsdom lacks `CSS.supports`, `ResizeObserver`, and `document.elementFromPoint`
(required by bits-ui `PinInput`). Polyfills already live in `vitest-setup.ts` —
do not remove them. Component test example: `src/lib/__tests__/otp-input.test.ts`.

## Existing call sites (keep in sync)

- `MfaChallenge.svelte` — login MFA (also refreshes the challenge on mount)
- `MfaStepUpDialog.svelte` — step-up authorization
- `MfaEnrollmentSection.svelte` — enforcer enrollment verify
- `MfaManagement.svelte` — settings enrollment verify
- `src/routes/welcome/+page.svelte` — invitation OTP
