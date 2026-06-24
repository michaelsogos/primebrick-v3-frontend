import type { DeepReadonly } from '$lib/types/deep-readonly';

export function useSelection(options: {
  enabled: boolean;
  uid: string;
  initialKeys?: string[];
  onSelectedKeysChange?: (keys: string[]) => void;
}) {
  const { uid, initialKeys, onSelectedKeysChange } = options;

  const _state = $state({
    selectedKeys: (initialKeys ?? []) as string[],
  });

  function rowKey(row: Record<string, unknown>): string {
    const v = row[uid as keyof typeof row] as unknown;
    return typeof v === 'string' ? v : String(v ?? '');
  }

  function toggleRowSelect(key: string) {
    if (_state.selectedKeys.includes(key)) {
      _state.selectedKeys = _state.selectedKeys.filter((k) => k !== key);
    } else {
      _state.selectedKeys = [..._state.selectedKeys, key];
    }
    onSelectedKeysChange?.(_state.selectedKeys);
  }

  function toggleAllRows(allKeys: string[]) {
    if (_state.selectedKeys.length === allKeys.length) {
      _state.selectedKeys = [];
    } else {
      _state.selectedKeys = [...allKeys];
    }
    onSelectedKeysChange?.(_state.selectedKeys);
  }

  function clearSelection() {
    _state.selectedKeys = [];
    onSelectedKeysChange?.(_state.selectedKeys);
  }

  function isRowSelected(key: string): boolean {
    return _state.selectedKeys.includes(key);
  }

  function syncWithExternal(keys: string[]) {
    if (JSON.stringify(_state.selectedKeys) !== JSON.stringify(keys)) {
      _state.selectedKeys = [...keys];
    }
  }

  const allSelected = $derived(_state.selectedKeys.length > 0);
  const someSelected = $derived(_state.selectedKeys.length > 0);

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    toggleRowSelect,
    toggleAllRows,
    clearSelection,
    isRowSelected,
    get allSelected() { return allSelected; },
    get someSelected() { return someSelected; },
    syncWithExternal
  };
}
