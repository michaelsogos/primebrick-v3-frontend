import type { Snippet } from 'svelte';
import type { DeepReadonly } from '$lib/types/deep-readonly';

export interface PreviewPanelOptions<TRow extends Record<string, unknown>> {
  viewRows: () => TRow[];
  rowKey: (row: TRow) => string;
  onFieldChange?: (row: TRow, field: string, value: any) => void;
  onRefresh?: () => () => void;
}

export function usePreviewPanel<TRow extends Record<string, unknown>>(
  options: PreviewPanelOptions<TRow>
) {
  const { viewRows: viewRowsFn, rowKey, onFieldChange, onRefresh: getOnRefresh } = options;

  const _state = $state({
    previewRow: null as TRow | null,
    previewRowIndex: 0,
    previewEditMode: false,
    previewPanelOpen: false,
    focusedRowIndex: 0,
  });

  function openPreview(row: TRow) {
    _state.previewRow = row;
    _state.previewRowIndex = viewRowsFn().findIndex(r => rowKey(r) === rowKey(row));
    _state.focusedRowIndex = _state.previewRowIndex;
    _state.previewEditMode = false;
    _state.previewPanelOpen = true;
  }

  function closePreview() {
    _state.previewPanelOpen = false;
    _state.previewRow = null;
    _state.previewEditMode = false;
  }

  function toggleEditMode() {
    _state.previewEditMode = !_state.previewEditMode;
  }

  function setPreviewEditMode(mode: boolean) {
    _state.previewEditMode = mode;
  }

  function handleFieldChange(field: string, value: any) {
    if (_state.previewRow) {
      if (onFieldChange) {
        onFieldChange(_state.previewRow, field, value);
      }
      // Update local preview row state
      _state.previewRow = { ..._state.previewRow, [field]: value };
    }
  }

  function refresh() {
    getOnRefresh?.()();
  }

  function setFocusedRowIndex(index: number) {
    _state.focusedRowIndex = index;
  }

  function navigatePreview(direction: 'next' | 'prev') {
    const rows = viewRowsFn();
    if (rows.length === 0) return;

    if (direction === 'next') {
      const nextIndex = Math.min(_state.previewRowIndex + 1, rows.length - 1);
      if (nextIndex !== _state.previewRowIndex) {
        _state.previewRow = rows[nextIndex];
        _state.previewRowIndex = nextIndex;
        _state.focusedRowIndex = nextIndex;
        _state.previewEditMode = false;
      }
    } else {
      const prevIndex = Math.max(_state.previewRowIndex - 1, 0);
      if (prevIndex !== _state.previewRowIndex) {
        _state.previewRow = rows[prevIndex];
        _state.previewRowIndex = prevIndex;
        _state.focusedRowIndex = prevIndex;
        _state.previewEditMode = false;
      }
    }
  }

  const canNavigateNext = $derived(_state.previewRowIndex < viewRowsFn().length - 1);
  const canNavigatePrev = $derived(_state.previewRowIndex > 0);

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    get canNavigateNext() { return canNavigateNext; },
    get canNavigatePrev() { return canNavigatePrev; },
    openPreview,
    closePreview,
    toggleEditMode,
    setPreviewEditMode,
    handleFieldChange,
    setFocusedRowIndex,
    navigatePreview
  };
}
