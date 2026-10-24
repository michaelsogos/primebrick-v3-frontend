/**
 * DEV-ONLY host environment shim for the runtime-source-compile spike.
 *
 * The runtime-compiled remote graph resolves every specifier that is NOT a
 * vendored svelte/core specifier and NOT a source-compiled local file to THIS
 * module. That means everything below is the *host-owned* instance — the exact
 * equivalent of what `ctx` passes to remotes in production.
 *
 * It deliberately mixes:
 *  - host singletons  (i18n store, api, openSheet, $app/state page, composables)
 *  - pure helpers     (cn, cerebellum, test-scores)
 *
 * Vendor libraries are NOT here — remote source imports them through the
 * sanctioned `@primebrick/ui/vendor/<lib>` subpaths, resolved bare via the
 * host import map (raw package imports are rejected upstream).
 */

export { page } from '$app/state';
export { goto, invalidate, invalidateAll } from '$app/navigation';
export { resolve, base, assets } from '$app/paths';
export { t } from '$lib/i18n';
export { pushNotification } from '$lib/errors/app-errors';
export { cn } from '$lib/utils.js';
export * from '$lib/api';
export * from '$lib/api-types';
export { moduleBreadcrumbSegments } from '$lib/breadcrumb/module-breadcrumb';
export { resolveEffectiveParams, tuningOverriddenKeys } from '@primebrick/ui';
export { summarizeTestScores } from '@primebrick/ui';
export { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
export { shellNav, loadShellNav } from '$lib/shell/modules-shell.svelte';
export * from '$lib/shell/app-icons';
export * from '$lib/breadcrumb/types';
export { useMfaStepUp } from '$lib/composables/useMfaStepUp.svelte';
export { useAiModels } from '@primebrick/ui';
export { useConfigEntries } from '@primebrick/ui';
export { useMachineCapabilities } from '@primebrick/ui';
