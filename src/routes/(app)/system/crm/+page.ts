import { redirectToModuleDefault } from '$lib/navigation/module-root';

// Runs in universal load — redirect() works on BOTH SSR and client-side
// navigation (throwing it inside +page.svelte's script only works on SSR;
// on CSR it surfaces as an unhandled "Redirect" error and a blank page).
// The module root is a namespace, not a page: GOTO(module) resolves the
// declared `default` leaf — the pipeline page under this extra root.
export function load() {
  return redirectToModuleDefault('/system/crm');
}

// apiFetch does not forward the session cookie during SSR — the census
// load runs client-side only (same pattern as /crm and /system roots).
export const ssr = false;
