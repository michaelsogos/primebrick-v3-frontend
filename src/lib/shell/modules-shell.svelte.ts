import { fetchModules, ApiUnreachableError, type ModuleInfo } from '$lib/api';

export const shellNav = $state({
  loading: true,
  modules: [] as ModuleInfo[],
  unreachable: false,
  error: null as string | null
});

export async function loadShellNav(): Promise<void> {
  shellNav.loading = true;
  shellNav.error = null;
  try {
    shellNav.modules = await fetchModules();
    shellNav.unreachable = false;
  } catch (e) {
    shellNav.modules = [];
    if (e instanceof ApiUnreachableError) {
      shellNav.unreachable = true;
      shellNav.error = null;
    } else {
      shellNav.unreachable = false;
      shellNav.error = e instanceof Error ? e.message : 'Failed to load modules';
    }
  } finally {
    shellNav.loading = false;
  }
}
