/**
 * useSelection — generic selection state manager for selectable lists/fieldsets.
 *
 * Follows the composable state exposure pattern (AGENTS.md):
 * - Consolidated `_state` object with underscore prefix
 * - Exposed via `get state()` getter (ReadonlySet for selected_ids)
 * - Mutations only through exposed mutator functions
 *
 * Note: `selected_ids` is exposed as `ReadonlySet<string>` (not `DeepReadonly<Set>`)
 * because `DeepReadonly` strips the `[Symbol.iterator]` method from Set, breaking
 * spread (`[...state.selected_ids]`) and for-of iteration.
 *
 * Usage:
 * ```ts
 * const selection = useSelection();
 * selection.toggleSelect('id-1', true);
 * selection.toggleSelectAll(['id-1', 'id-2'], true);
 * const isSel = selection.isSelected('id-1');
 * const count = selection.selected_count;
 * ```
 *
 * `all_selected` and `some_selected` are NOT in the composable because they
 * depend on the total item count, which is page-specific. Consumers compute
 * them as `$derived` from `selection.selected_count` and their item list.
 */

export function useSelection() {
  const _state = $state({
    selected_ids: new Set<string>(),
  });

  const selected_count = $derived(_state.selected_ids.size);

  function isSelected(id: string): boolean {
    return _state.selected_ids.has(id);
  }

  function toggleSelect(id: string, checked: boolean): void {
    const next = new Set(_state.selected_ids);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    _state.selected_ids = next;
  }

  function toggleSelectAll(all_ids: string[], checked: boolean): void {
    _state.selected_ids = checked ? new Set(all_ids) : new Set();
  }

  function clearSelection(): void {
    _state.selected_ids = new Set();
  }

  function getSelectedIds(): string[] {
    return [..._state.selected_ids];
  }

  return {
    get state(): { readonly selected_ids: ReadonlySet<string> } {
      return _state as { readonly selected_ids: ReadonlySet<string> };
    },
    get selected_count() {
      return selected_count;
    },
    isSelected,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    getSelectedIds,
  };
}
