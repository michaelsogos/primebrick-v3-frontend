export interface SelectionOptions {
  enabled: boolean;
  uid: string;
  initialKeys?: string[];
  onSelectedKeysChange?: (keys: string[]) => void;
}

export interface SelectionReturn {
  selectedKeys: string[];
  toggleRowSelect: (key: string) => void;
  toggleAllRows: (allKeys: string[]) => void;
  clearSelection: () => void;
  isRowSelected: (key: string) => boolean;
  allSelected: boolean;
  someSelected: boolean;
  syncWithExternal: (keys: string[]) => void;
}

export function useSelection(options: SelectionOptions): SelectionReturn {
  const { enabled, uid, initialKeys, onSelectedKeysChange } = options;

  let selectedKeys = $state<string[]>(initialKeys ?? []);

  function rowKey(row: Record<string, unknown>): string {
    const v = row[uid as keyof typeof row] as unknown;
    return typeof v === 'string' ? v : String(v ?? '');
  }

  function toggleRowSelect(key: string) {
    if (selectedKeys.includes(key)) {
      selectedKeys = selectedKeys.filter((k) => k !== key);
    } else {
      selectedKeys = [...selectedKeys, key];
    }
    onSelectedKeysChange?.(selectedKeys);
  }

  function toggleAllRows(allKeys: string[]) {
    if (selectedKeys.length === allKeys.length) {
      selectedKeys = [];
    } else {
      selectedKeys = [...allKeys];
    }
    onSelectedKeysChange?.(selectedKeys);
  }

  function clearSelection() {
    selectedKeys = [];
    onSelectedKeysChange?.(selectedKeys);
  }

  function isRowSelected(key: string): boolean {
    return selectedKeys.includes(key);
  }

  function syncWithExternal(keys: string[]) {
    if (JSON.stringify(selectedKeys) !== JSON.stringify(keys)) {
      selectedKeys = [...keys];
    }
  }

  const allSelected = $derived(selectedKeys.length > 0);
  const someSelected = $derived(selectedKeys.length > 0);

  return {
    get selectedKeys() { return selectedKeys; },
    toggleRowSelect,
    toggleAllRows,
    clearSelection,
    isRowSelected,
    get allSelected() { return allSelected; },
    get someSelected() { return someSelected; },
    syncWithExternal
  };
}
