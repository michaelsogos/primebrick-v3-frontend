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
 *  - svelte component libraries compiled on the HOST runtime (lucide, bits-ui)
 *    → this is the cross-runtime seam we are measuring.
 *  - pure helpers     (cn, cerebellum, test-scores)
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
export { resolveEffectiveParams, tuningOverriddenKeys } from '$lib/ai/ai-cerebellum';
export { summarizeTestScores } from '$lib/ai/ai-model-test-scores';
export { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
export { shellNav, loadShellNav } from '$lib/shell/modules-shell.svelte';
export * from '$lib/shell/app-icons';
export * from '$lib/breadcrumb/types';
export { useMfaStepUp } from '$lib/composables/useMfaStepUp.svelte';
export { useAiModels } from '$lib/composables/useAiModels.svelte';
export { useConfigEntries } from '$lib/composables/useConfigEntries.svelte';
export { useMachineCapabilities } from '$lib/composables/useMachineCapabilities.svelte';

export * from 'clsx';
export * from 'tailwind-merge';
export * from 'tailwind-variants';
export * from '@lucide/svelte';
// bits-ui lives in host-env-bits.ts — `export *` of both in one module
// collides (Calendar/Command/Ellipsis exist in both libraries).
