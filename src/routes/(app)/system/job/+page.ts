import { redirect } from '@sveltejs/kit';

// Runs in universal load — redirect() works on BOTH SSR and client-side
// navigation (throwing it inside +page.svelte's script only works on SSR;
// on CSR it surfaces as an unhandled "Redirect" error and a blank page).
// The module root is a namespace, not a page: the schedules list is the
// module home (nav[0].href).
export function load() {
  redirect(307, '/system/job/job-schedules');
}
