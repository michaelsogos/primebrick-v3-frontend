export type ViewMode = 'table' | 'cards' | 'cards_list';

export interface ViewModeOptions {
  initialMode?: ViewMode;
  onModeChange?: (mode: ViewMode) => void;
  storageKey?: string;
}

export interface ViewModeReturn {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  isTable: boolean;
  isCards: boolean;
  isCardsList: boolean;
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

export function useViewMode(options: ViewModeOptions = {}): ViewModeReturn {
  const { initialMode = 'table', onModeChange, storageKey } = options;

  // Read from sessionStorage eagerly (before effects run) to avoid the effect overwriting the stored value
  const storedMode = storageKey ? readViewMode(storageKey) : null;
  let viewMode = $state<ViewMode>(storedMode ?? initialMode);

  function setViewMode(mode: ViewMode) {
    viewMode = mode;
    if (storageKey) {
      writeViewMode(storageKey, mode);
    }
    onModeChange?.(mode);
  }

  const isTable = $derived(viewMode === 'table');
  const isCards = $derived(viewMode === 'cards');
  const isCardsList = $derived(viewMode === 'cards_list');

  return {
    get viewMode() { return viewMode; },
    setViewMode,
    get isTable() { return isTable; },
    get isCards() { return isCards; },
    get isCardsList() { return isCardsList; }
  };
}
