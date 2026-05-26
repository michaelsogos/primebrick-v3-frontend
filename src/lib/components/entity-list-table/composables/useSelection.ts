export interface SelectionOptions {
  enabled: boolean;
  uid: string;
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
}

export function useSelection(options: SelectionOptions): SelectionReturn {
  const { enabled, uid, onSelectedKeysChange } = options;

  let selectedKeys = $state<string[]>([]);

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

  const allSelected = $derived(selectedKeys.length > 0);
  const someSelected = $derived(selectedKeys.length > 0);

  return {
    selectedKeys,
    toggleRowSelect,
    toggleAllRows,
    clearSelection,
    isRowSelected,
    allSelected,
    someSelected
  };
}
