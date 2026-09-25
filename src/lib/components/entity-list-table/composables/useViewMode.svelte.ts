import type { DeepReadonly } from '$lib/types/deep-readonly';

export type ViewMode = 'table' | 'cards' | 'cards_list';

export interface ViewModeOptions {
  /** Getter for `meta.table.default_view` — applied once meta arrives, unless
   *  the user already picked a mode or a stored mode exists. */
  initialMode?: () => ViewMode | undefined;
  onModeChange?: (mode: ViewMode) => void;
  storageKey?: () => string | undefined;
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
  const { onModeChange } = options;
  const getInitialMode = options.initialMode;
  const getStorageKey = options.storageKey;

  // Read from sessionStorage eagerly (before effects run) to avoid the effect overwriting the stored value
  const storedMode = getStorageKey ? readViewMode(getStorageKey() ?? '') : null;

  const _state = $state({
    viewMode: (storedMode ?? 'table') as ViewMode,
  });

  // Apply the meta default once it resolves — skipped when a stored mode
  // exists or the user already picked a mode explicitly.
  let userOverrode = false;
  $effect(() => {
    const m = getInitialMode?.();
    if (!storedMode && !userOverrode && m) {
      _state.viewMode = m;
    }
  });

  function setViewMode(mode: ViewMode) {
    userOverrode = true;
    _state.viewMode = mode;
    const sk = getStorageKey?.();
    if (sk) {
      writeViewMode(sk, mode);
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
