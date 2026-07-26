/**
 * Auth method enforcer store.
 *
 * The enforcer dialog ("you should set up a passkey / MFA") is a ONE-TIME
 * security decision made right after `/auth/me` returns 200 with confirmed
 * data. It is NOT a reactive UI state that tracks every profile mutation.
 *
 * Principle: HIDDEN FIRST, SHOWN ONLY IF SURE.
 *   - `enforcerVisible` defaults to `false` and is set to `true` only by the
 *     layout's onMount, after `/auth/me` returns 200 and `shouldShowEnforcer`
 *     confirms the user genuinely lacks any advanced auth method.
 *   - If `/auth/me` fails (401, network, refresh failure), the flag is never
 *     set → the dialog stays hidden. We do NOT fall back to stale
 *     sessionStorage data or default `has_passkey = false`.
 *   - The flag is cleared (`hideEnforcer()`) when the user completes
 *     enrollment or dismisses the dialog.
 */

import { isWebauthnSupported } from "$lib/webauthn/codec";
import type { AuthConfigPublic } from "$lib/auth-config-store.svelte";

/**
 * Module-level singleton state. `visible` is the only field — no profile
 * mirror, no derived values, no reactivity to `userProfileStore`.
 */
export const enforcerState = $state<{ visible: boolean }>({
  visible: false,
});

export const enforcerStore = {
  get visible(): boolean {
    return enforcerState.visible;
  },
};

/** Show the enforcer (called by +layout.svelte after /auth/me confirms it's needed). */
export function showEnforcer(): void {
  enforcerState.visible = true;
}

/** Hide the enforcer (called on enrollment complete or dismiss). */
export function hideEnforcer(): void {
  enforcerState.visible = false;
}

/**
 * Pure decision function — no store reads, no reactivity, no fallbacks.
 * Called once, right after `/auth/me` returns 200, with the actual response
 * values in hand. Returns `true` only when we are SURE the enforcer is
 * needed.
 *
 * Rules:
 *   1. No config loaded → can't decide → hidden.
 *   2. `has_passkey` or `has_mfa` missing from the response → data
 *      incomplete → hidden (we do NOT default to `false`).
 *   3. User has at least one advanced method (passkey OR MFA) → hidden.
 *   4. User has NEITHER → check if there's at least one method they could
 *      enroll (otherwise the dialog is useless) → hidden if nothing to offer.
 *   5. `passkey_required` + webauthn supported → show (mandatory, no dismiss).
 *   6. Not required + not dismissed → show.
 */
export function shouldShowEnforcer(args: {
  has_passkey?: boolean;
  has_mfa?: boolean;
  dismissed?: boolean;
  config: AuthConfigPublic | null;
}): boolean {
  const { has_passkey, has_mfa, dismissed, config } = args;

  // 1. No config → can't decide
  if (!config) return false;

  // 2. Data incomplete → can't decide (NO fallback to false)
  if (has_passkey === undefined || has_mfa === undefined) return false;

  // 3. User has at least one advanced method → no enforcer needed
  if (has_passkey || has_mfa) return false;

  // 4. User has neither — is there at least one method they could enroll?
  const webauthnSupported = isWebauthnSupported();
  const canEnrollPasskey = config.enable_webauthn && webauthnSupported;
  const canEnrollMfa = config.enable_mfa;
  if (!canEnrollPasskey && !canEnrollMfa) return false;

  // 5. passkey_required + webauthn available → mandatory, show regardless of dismiss
  if (config.passkey_required && canEnrollPasskey) return true;

  // 6. Not required → show only if not dismissed
  if (!config.passkey_required && !dismissed) return true;

  return false;
}
