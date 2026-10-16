import { redirect } from '@sveltejs/kit';

// Runs in universal load — redirect() works on BOTH SSR and client-side
// navigation (throwing it inside +page.svelte's script only works on SSR;
// on CSR it surfaces as an unhandled "Redirect" error and a blank page).
export function load() {
  redirect(307, '/system/settings/profile');
}
