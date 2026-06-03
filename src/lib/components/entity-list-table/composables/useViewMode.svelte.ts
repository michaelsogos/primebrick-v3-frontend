export type ViewMode = 'table' | 'cards' | 'cards_list';

export interface ViewModeOptions {
  initialMode?: ViewMode;
  onModeChange?: (mode: ViewMode) => void;
}

export interface ViewModeReturn {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  isTable: boolean;
  isCards: boolean;
  isCardsList: boolean;
}

export function useViewMode(options: ViewModeOptions = {}): ViewModeReturn {
  const { initialMode = 'table', onModeChange } = options;

  let viewMode = $state<ViewMode>(initialMode);

  function setViewMode(mode: ViewMode) {
    viewMode = mode;
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
