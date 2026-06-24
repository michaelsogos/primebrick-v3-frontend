import type { DeepReadonly } from '$lib/types/deep-readonly';

export type ViewMode = 'table' | 'cards' | 'cards_list';

export interface ViewModeOptions {
  initialMode?: ViewMode;
  onModeChange?: (mode: ViewMode) => void;
  storageKey?: string;
}

function readViewMode(storageKey: string): ViewMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (raw === 'table' || raw === 'cards' || raw === 'cards_list') return raw;
    return null;
  } catch {
    return null;
  }
}

function writeViewMode(storageKey: string, next: ViewMode) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(storageKey, next);
  } catch {
    // ignore quota / blocked storage
  }
}

export function useViewMode(options: ViewModeOptions = {}) {
  const { initialMode = 'table', onModeChange, storageKey } = options;

  // Read from sessionStorage eagerly (before effects run) to avoid the effect overwriting the stored value
  const storedMode = storageKey ? readViewMode(storageKey) : null;

  const _state = $state({
    viewMode: (storedMode ?? initialMode) as ViewMode,
  });

  function setViewMode(mode: ViewMode) {
    _state.viewMode = mode;
    if (storageKey) {
      writeViewMode(storageKey, mode);
    }
    onModeChange?.(mode);
  }

  const isTable = $derived(_state.viewMode === 'table');
  const isCards = $derived(_state.viewMode === 'cards');
  const isCardsList = $derived(_state.viewMode === 'cards_list');

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    setViewMode,
    get isTable() { return isTable; },
    get isCards() { return isCards; },
    get isCardsList() { return isCardsList; }
  };
}
