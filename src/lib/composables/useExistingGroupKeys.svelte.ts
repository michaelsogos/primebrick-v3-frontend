/**
 * useExistingGroupKeys — composable that fetches all config entries via the
 * shared `useConfigEntries` composable and extracts the unique group_key
 * values. Used by the config create page to populate the group_key
 * ComboSelect with existing groups as suggestions.
 *
 * Follows the composable state exposure pattern from AGENTS.md:
 *   - _state is internal (underscore prefix)
 *   - Exposed via get state() returning DeepReadonly
 *   - $derived values exposed via individual getters
 */
import type { DeepReadonly } from "$lib/types/deep-readonly";
import { useConfigEntries } from "$lib/composables/useConfigEntries.svelte";
import { onMount } from "svelte";

export function useExistingGroupKeys() {
  const config = useConfigEntries();
  const _state = $state({ groupKeys: [] as string[], loading: true });

  onMount(async () => {
    try {
      await config.ensureLoaded();
      const entries = config.state.entries;
      const groups = new Set<string>();
      for (const row of entries) {
        if (row.group_key && row.group_key.trim()) {
          groups.add(row.group_key.trim());
        }
      }
      _state.groupKeys = [...groups].sort();
    } catch (e) {
      console.error("Failed to load group keys", e);
    } finally {
      _state.loading = false;
    }
  });

  return {
    get state(): DeepReadonly<typeof _state> {
      return _state as DeepReadonly<typeof _state>;
    },
    get groupKeys() {
      return _state.groupKeys;
    },
    get loading() {
      return _state.loading;
    },
  };
}
