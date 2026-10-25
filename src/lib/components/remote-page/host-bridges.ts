/**
 * Host bridges — the built-in entries of `ctx.components` handed to every
 * remote page/sheet. These are host-bound plain functions (no rune state
 * crosses the boundary): the remote calls them, the host executes.
 *
 * - `mfaStepUp` — step-up MFA for guarded remote ops (delete model, …):
 *   same contract as `useMfaStepUp().executeWithToken`; the step-up dialog
 *   is rendered host-side inside the mount component's own markup.
 * - `openSheet` — opens a sheet panel by key: a host-registered panel
 *   (`shell.*`/`entity.*`/`config.*`) or a remote-declared sheet
 *   (`<module>.<name>` — mounted at runtime via RemoteSheetMount). The
 *   engine validates the key itself — unknown panels are rejected with a
 *   notification, never render an empty sheet.
 * - `hostApi` — plain `apiFetch` (full-path BE fetch): remote pages bind it
 *   via `bindRemoteCtx(ctx)` so ui composables can reach BE-owned
 *   `/api/v1/…` endpoints that `ctx.api` (ws-bound) cannot.
 *
 * A caller-provided `components` record keeps precedence (`??=`) — tests
 * inject fakes for either bridge.
 */
import type { ModuleHostComponents } from '@primebrick/ui';
import type { useMfaStepUp } from '$lib/composables/useMfaStepUp.svelte';
import { apiFetch } from '$lib/api';
import { openSheet, type SheetOpenOptions } from '$lib/shell/sheets/sheet-manager.svelte';

/**
 * `ctx.components.openSheet` — delegates to the engine, which resolves
 * host-registered panels ∪ remote `nav.sheets[]` declarations and rejects
 * unknown keys with a notification.
 */
function openSheetBridge(
  panelKey: string,
  props?: Record<string, unknown>,
  options?: Record<string, unknown>,
): void {
  openSheet(panelKey, props, options as SheetOpenOptions | undefined);
}

/**
 * Merge the built-in bridges into the caller's components record — mutates
 * the SAME object (never copies) so the `components.remote = mod`
 * back-channel assignment in RemotePageMount keeps working through ctx.
 */
export function buildHostComponents(
  stepUp: ReturnType<typeof useMfaStepUp>,
  caller?: Record<string, unknown>,
): ModuleHostComponents {
  const comps = (caller ?? {}) as ModuleHostComponents;
  comps.mfaStepUp ??= (requestFn, context) => stepUp.executeWithToken(requestFn, context);
  comps.openSheet ??= openSheetBridge;
  comps.hostApi ??= apiFetch;
  return comps;
}
