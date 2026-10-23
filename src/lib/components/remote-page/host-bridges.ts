/**
 * Host bridges — the built-in entries of `ctx.components` handed to every
 * remote page/section. These are host-bound plain functions (no rune state
 * crosses the boundary): the remote calls them, the host executes.
 *
 * - `mfaStepUp` — step-up MFA for guarded remote ops (delete model, …):
 *   same contract as `useMfaStepUp().executeWithToken`; the step-up dialog
 *   is rendered host-side inside RemotePageMount's own markup.
 * - `openSheet` — opens a host-registered sheet panel by key. The key is
 *   validated against `SHEET_PANEL_IDS`: an unknown panel is rejected with
 *   a notification instead of rendering an empty sheet.
 * - `hostApi` — plain `apiFetch` (full-path BE fetch): remote pages bind it
 *   via `bindRemoteCtx(ctx)` so ui composables can reach BE-owned
 *   `/api/v1/…` endpoints that `ctx.api` (ws-bound) cannot.
 *
 * A caller-provided `components` record keeps precedence (`??=`) — tests
 * inject fakes for either bridge.
 */
import type { ModulePageHostComponents } from '@primebrick/ui';
import type { useMfaStepUp } from '$lib/composables/useMfaStepUp.svelte';
import { apiFetch } from '$lib/api';
import { openSheet, SHEET_PANEL_IDS, type SheetOpenOptions } from '$lib/shell/sheets/sheet-manager.svelte';
import { pushNotification } from '$lib/errors/app-errors';

// The typed `openSheet<T>` signature is generic over the panel-id union —
// at the bridge boundary `panelKey` is an opaque string validated at
// runtime, so the call is intentionally untyped here.
const openSheetUnchecked = openSheet as unknown as (
  panelKey: string,
  props?: Record<string, unknown>,
  options?: SheetOpenOptions,
) => void;

function openSheetBridge(
  panelKey: string,
  props?: Record<string, unknown>,
  options?: Record<string, unknown>,
): void {
  if (!(SHEET_PANEL_IDS as readonly string[]).includes(panelKey)) {
    pushNotification({
      impact: 'MEDIUM',
      message: `Unknown sheet panel: ${panelKey}`,
      scope: 'RemotePage',
      toast: true,
    });
    return;
  }
  openSheetUnchecked(panelKey, props, options as SheetOpenOptions | undefined);
}

/**
 * Merge the built-in bridges into the caller's components record — mutates
 * the SAME object (never copies) so the `components.remote = mod`
 * back-channel assignment in RemotePageMount keeps working through ctx.
 */
export function buildHostComponents(
  stepUp: ReturnType<typeof useMfaStepUp>,
  caller?: Record<string, unknown>,
): ModulePageHostComponents {
  const comps = (caller ?? {}) as ModulePageHostComponents;
  comps.mfaStepUp ??= (requestFn, context) => stepUp.executeWithToken(requestFn, context);
  comps.openSheet ??= openSheetBridge;
  comps.hostApi ??= apiFetch;
  return comps;
}
