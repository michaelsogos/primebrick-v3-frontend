export type SheetSide = 'left' | 'right';

export type SheetPanelId =
  | 'shell.errors'
  | 'shell.versions'
  | 'entity.searchIn'
  | 'entity.columns'
  | 'entity.filters';

export type SheetOpenOptions = {
  side?: SheetSide;
  /** Tailwind classes for `Sheet.Content` (width/padding, etc.). */
  contentClass?: string;
  /** When true, keep `panelId/props` after close (rare; defaults false). */
  keepMountedState?: boolean;
};

export type SheetPanelPropsMap = {
  'shell.errors': Record<string, never>;
  'shell.versions': Record<string, never>;
  'entity.searchIn': Record<string, unknown>;
  'entity.columns': Record<string, unknown>;
  'entity.filters': {
    /**
     * Arbitrary content provided by caller (e.g. EntityListTable `{#if filters}` slot).
     * Use `Snippet` typing on the panel component; manager keeps it `unknown` to avoid
     * leaking Snippet generics across the whole app.
     */
    content: unknown;
  };
};

type AnyPanelProps = SheetPanelPropsMap[SheetPanelId];

/**
 * Bits-ui `Dialog` can emit `onOpenChange(false)` immediately after a programmatic `open=true`,
 * which would call `closeSheet()` before the panel paints. Ignore close callbacks briefly after
 * `openSheet()` until after the next frames.
 */
let suppressDialogCloseFromHost = false;

export function shouldSuppressSheetDialogClose(): boolean {
  return suppressDialogCloseFromHost;
}

export const sheetState = $state({
  open: false,
  panelId: null as SheetPanelId | null,
  props: null as AnyPanelProps | null,
  side: 'right' as SheetSide,
  contentClass: 'w-[420px] p-0',
  keepMountedState: false
});

export function openSheet<T extends SheetPanelId>(
  panelId: T,
  props: SheetPanelPropsMap[T],
  options?: SheetOpenOptions
) {
  sheetState.panelId = panelId;
  sheetState.props = props as AnyPanelProps;
  sheetState.side = options?.side ?? 'right';
  sheetState.contentClass = options?.contentClass ?? sheetState.contentClass;
  sheetState.keepMountedState = Boolean(options?.keepMountedState);
  suppressDialogCloseFromHost = true;
  sheetState.open = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      suppressDialogCloseFromHost = false;
    });
  });
}

export function replaceSheet<T extends SheetPanelId>(
  panelId: T,
  props: SheetPanelPropsMap[T],
  options?: SheetOpenOptions
) {
  // For now `replace` is identical to `open` (keeps sheet open while switching content).
  openSheet(panelId, props, options);
}

export function closeSheet() {
  sheetState.open = false;
  if (sheetState.keepMountedState) return;
  // Clear on a microtask so callers can react to the closing panel id.
  queueMicrotask(() => {
    if (sheetState.open) return;
    sheetState.panelId = null;
    sheetState.props = null;
  });
}

