/**
 * Step-up MFA composable.
 *
 * Wraps an API call that may require step-up MFA. If the BE returns 403 with
 * `mfa_step_up_required: true`, the composable shows the MFA step-up dialog,
 * waits for the user to verify their TOTP code, then retries the original
 * request with the `X-MFA-Action-Authorization` header.
 *
 * Usage in a component:
 *   const stepUp = useMfaStepUp();
 *
 *   async function deleteOrg(uuid: string) {
 *     const resp = await stepUp.executeWithToken(
 *       (token) => apiFetch(`/api/v1/organizations/${uuid}`, {
 *         method: 'DELETE',
 *         headers: token ? { 'X-MFA-Action-Authorization': token } : {},
 *       }),
 *       { action: 'delete', target_resource: 'organizations' },
 *     );
 *     // ... handle resp
 *   }
 *
 * Then in the template:
 *   <MfaStepUpDialog
 *     bind:open={stepUp.dialogOpen}
 *     action={stepUp.pendingAction}
 *     target_resource={stepUp.pendingTargetResource}
 *     onauthorized={stepUp.handleAuthorized}
 *   />
 */

interface StepUpState {
  dialogOpen: boolean;
  pendingAction: string;
  pendingTargetResource: string;
}

export function useMfaStepUp() {
  let state = $state<StepUpState>({
    dialogOpen: false,
    pendingAction: '',
    pendingTargetResource: '',
  });

  let pendingRetryWithToken: ((token: string) => void) | null = null;

  /**
   * Execute an API call with step-up MFA support.
   * The requestFn receives the action authorization token (or null if not
   * yet obtained) and should include it in the X-MFA-Action-Authorization
   * header when present.
   *
   * If the BE returns 403 with mfa_step_up_required, this function shows
   * the step-up dialog (by setting dialogOpen=true) and returns a Promise
   * that resolves when the user verifies and the request is retried.
   */
  async function executeWithToken(
    requestFn: (token: string | null) => Promise<Response>,
    context: { action: string; target_resource: string },
  ): Promise<Response> {
    // First attempt — no token
    const resp = await requestFn(null);

    if (resp.status === 403) {
      const errorData = await resp.json().catch(() => null);
      if (errorData?.extra?.mfa_step_up_required) {
        // Show the step-up dialog and wait for the user to verify
        return new Promise<Response>((resolve) => {
          state.dialogOpen = true;
          state.pendingAction = context.action;
          state.pendingTargetResource = context.target_resource;

          pendingRetryWithToken = (token: string) => {
            requestFn(token).then(resolve).catch((err) => {
              console.error('[MfaStepUp] Retry failed:', err);
              // Resolve with a synthetic error response so the caller can handle it
              resolve(new Response(JSON.stringify({ type: '/errors/internal-error', title: 'Internal server error', status: 500, detail: 'Retry failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
            });
          };
        });
      }
    }

    return resp;
  }

  /**
   * Called by the MfaStepUpDialog when the user successfully verifies.
   * Retries the original request with the action authorization token.
   */
  function handleAuthorized(token: string) {
    if (pendingRetryWithToken) {
      pendingRetryWithToken(token);
      pendingRetryWithToken = null;
    }
    state.dialogOpen = false;
  }

  return {
    get dialogOpen() { return state.dialogOpen; },
    set dialogOpen(v: boolean) { state.dialogOpen = v; },
    get pendingAction() { return state.pendingAction; },
    get pendingTargetResource() { return state.pendingTargetResource; },
    executeWithToken,
    handleAuthorized,
  };
}
