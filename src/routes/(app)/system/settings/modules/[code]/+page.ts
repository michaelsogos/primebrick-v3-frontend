import { fetchService } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
  const service = await fetchService(params.code);
  return { service };
};
