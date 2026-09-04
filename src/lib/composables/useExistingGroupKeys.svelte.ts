/**
 * useExistingGroupKeys — composable that fetches all config entries from
 * `/api/v1/entities/config_entries/list` and extracts the unique group_key
 * values. Used by the config create page to populate the group_key
 * ComboSelect with existing groups as suggestions.
 *
 * Follows the composable state exposure pattern from AGENTS.md:
 *   - _state is internal (underscore prefix)
 *   - Exposed via get state() returning DeepReadonly
 *   - $derived values exposed via individual getters
 */
import type { DeepReadonly } from "$lib/types/deep-readonly";
import { apiFetch } from "$lib/api";
import { onMount } from "svelte";

export function useExistingGroupKeys() {
  const _state = $state({ groupKeys: [] as string[], loading: true });

  onMount(async () => {
    try {
      const res = await apiFetch("/api/v1/entities/config_entries/list");
      if (res.ok) {
        const data = (await res.json()) as { rows: Array<{ group_key?: string | null }> };
        const groups = new Set<string>();
        for (const row of data.rows) {
          if (row.group_key && row.group_key.trim()) {
            groups.add(row.group_key.trim());
          }
        }
        _state.groupKeys = [...groups].sort();
      }
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
