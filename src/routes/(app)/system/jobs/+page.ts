import { redirect } from '@sveltejs/kit';

export const ssr = false;

// The job module moved to its own /jobs prefix — legacy bookmarks and
// persisted last-route entries land here and forward transparently.
export function load() {
  redirect(307, '/jobs');
}
