import { pushNotification } from '$lib/errors/app-errors';
import { resolveRemoteSheetDecl } from '$lib/shell/modules-shell.svelte';
import type { MetaColumn } from '$lib/entity-list/types';

export type SheetSide = 'left' | 'right';

/**
 * Runtime list of every HOST-REGISTERED panel key — the type below derives
 * from it (single source). Remote-declared sheets (`<module>.<name>`,
 * `nav.sheets[]`) live outside this list: `openSheet` resolves host keys
 * first, then remote declarations via the module discovery payload, and
 * rejects anything else with a notification.
 */
export const SHEET_PANEL_IDS = [
  'shell.errors',
  'shell.versions',
  'shell.aiChat',
  'shell.aiGuide',
  'entity.searchIn',
  'entity.columns',
  'entity.filters',
  'entity.datetimeIana',
  'entity.versionHistory',
  'entity.jsonViewer',
  'entity.record',
  'config.currencySelect',
  'config.protocolSelect',
  'config.phonePrefixSelect',
  'config.regexFlags',
  'config.regexAiChat',
  'config.jsonAiChat',
  'json.aiChat',
  'config.badgeValueEdit',
  'shell.docs',
  'i18n.translationEditor',
] as const;

export type SheetPanelId = (typeof SHEET_PANEL_IDS)[number];

export type SheetOpenOptions = {
  side?: SheetSide;
  /** Tailwind classes for `Sheet.Content` (width/padding, etc.). */
  contentClass?: string;
  /** When true, keep `panelId/props` after close (rare; defaults false). */
  keepMountedState?: boolean;
  /** When false, the sheet will not have a modal overlay (defaults true). */
  modal?: boolean;
  /**
   * Two-sheet stack (max 2 panes): when a sheet is already open, the
   * current panel slides to the LEFT slot and the new one takes the
   * right slot. Used by drill-down chrome (record → version history,
   * ref-cell drill-through). A stacked `closeSheet` pops the right pane
   * and the left one slides back — non-stacked opens clear the stack.
   */
  stack?: boolean;
};

export type SheetPanelPropsMap = {
  'shell.errors': Record<string, never>;
  'shell.versions': Record<string, never>;
  'shell.aiChat': Record<string, never>;
  'shell.aiGuide': Record<string, never>;
  'entity.searchIn': {
    searchInKeys: string[] | null;
    searchableColumns: import('$lib/entity-list/types').MetaColumn[];
    onSearchInKeysChange: (keys: string[] | null) => void;
    toggleSearchKey: (key: string) => void;
  };
  'entity.columns': {
    stickyColumns: import('$lib/entity-list/types').MetaColumn[];
    nonAuditingColumns: import('$lib/entity-list/types').MetaColumn[];
    auditingColumns: import('$lib/entity-list/types').MetaColumn[];
    visibleKeys: string[];
    toggleColumnKey: (key: string) => void;
    onReorderKeys?: (group: 'sticky' | 'data' | 'auditing', keys: string[]) => void;
    onResetColumnVisibility: () => void;
  };
  'entity.datetimeIana': {
    datetimeIanaColumns: import('$lib/entity-list/types').MetaColumn[];
    modeByKey: Record<string, 'browser' | 'record'>;
    onToggle: (col: import('$lib/entity-list/types').MetaColumn) => void;
    disabled?: boolean;
  };
  'entity.filters': {
    /** Entity name — FiltersPanel resolves audit-actor options for audited columns. */
    entity?: string;
    filterableColumns?: import('$lib/entity-list/types').MetaColumn[];
    filterValues?: Record<string, unknown>;
    onFilterValuesChange?: (values: Record<string, unknown>) => void;
    onResetFilters?: () => void;
    advancedFilters?: import('$lib/entity-list/types').AdvancedFilter[];
    onAdvancedFiltersChange?: (
      filters: import('$lib/entity-list/types').AdvancedFilter[],
      connector: 'AND' | 'OR'
    ) => void;
  };
  'entity.versionHistory': {
    entity: string;
    translationKey?: string;
    /** Entity-label i18n namespace (`meta.entities_ns`) — `system` for BE-owned entities. */
    entities_ns?: string;
    rowUuid: string;
    columns?: MetaColumn[];
  };
  'entity.jsonViewer': {
    /** The cell's parsed JSON value (null-prototype safe — read-only). */
    value: unknown;
  };
  'entity.record': {
    /** Target entity API name (from `column.ref.entity`). */
    entity: string;
    /** The cell's raw value — the target uid for uuid refs. */
    value: unknown;
    /** The column's ref contract — drives business-key resolution. */
    ref?: import('$lib/entity-list/types').MetaColumn['ref'];
  };
  'config.currencySelect': {
    currentCurrency: string;
    onCurrencyChange: (code: string) => void;
  };
  'config.protocolSelect': {
    currentProtocol: string;
    allowedProtocols: string[];
    onProtocolChange: (protocol: string) => void;
  };
  'config.phonePrefixSelect': {
    currentCountry: string;
    allowedCountries?: string[];
    onCountryChange: (country: string) => void;
  };
  'config.regexFlags': {
    current_flags: string;
    config_type: 'string' | 'text' | 'secret' | 'url' | 'email' | 'phone';
    on_flags_change: (flags: string) => void;
  };
  'config.regexAiChat': {
    on_apply_regex: (pattern: string, flags: string) => void;
    config_type: 'string' | 'text' | 'secret' | 'url' | 'email' | 'phone';
    current_regex?: string;
    current_flags?: string;
  };
  'config.jsonAiChat': {
    on_apply_json: (json: string) => void;
    /** Live getter — the builder mutates after each apply, so a snapshot
     *  string would go stale inside the assistant's system prompt. */
    current_json?: string | (() => string);
    /** Row's config_key — needed to auto-generate error_label_key values.
     *  String or live getter (a snapshot goes stale if the user edits the
     *  key field while the sheet is open). */
    config_key?: string | (() => string);
    config_type: import('$lib/api-types').ConfigEntryType;
  };
  'json.aiChat': {
    /** The document's JSON Schema — prompts, explorer topics, validation. */
    schema: Record<string, unknown>;
    /** Human-readable document name used in prompts — e.g. 'filter'. */
    object_label?: string;
    /** Current document text — string or live getter. */
    current_json?: string | (() => string);
    on_apply_json: (json: string) => void;
  };
  'config.badgeValueEdit': {
    /** 'add' = create a new badge value; 'edit' = mutate `value_key` live. */
    mode: 'add' | 'edit';
    /** Existing map key when mode='edit', null for add mode. */
    value_key: string | null;
    /** Row's config_key — scopes the label_key suggestion prefix. */
    config_key: string;
    /** The type-config builder instance — mutations are live (same object
     *  the page reads), so edits appear without a save callback. */
    builder: ReturnType<typeof import('$lib/config/type-config-builder.svelte').useTypeConfigBuilder>;
  };
  'shell.docs': Record<string, never>;
  /**
   * Per-key translation create editor — opened from a `*_key` cell's
   * languages CTA. Writes queue into pending-translations and flush with
   * the owning page's save (create-only; existing rows stay read-only).
   */
  'i18n.translationEditor': {
    /** The i18n key being translated (e.g. `custom.entities.customer_type.rows.vip`). */
    i18n_key: string;
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

/** A sheet pane slot — the right pane is `panelId/props`, the left
 *  (secondary) is only populated through `stack` opens. */
export type SheetSlot = {
  /** Host registry key OR remote `<module>.<name>` decl key. */
  panelId: string;
  props: Record<string, unknown> | null;
  /** Chrome captured at stack time — restored when the pane slides
   *  back to the right slot. */
  side: SheetSide;
  contentClass: string;
  modal: boolean;
};

type SheetState = {
  open: boolean;
  /** Host registry key OR remote `<module>.<name>` decl key. */
  panelId: string | null;
  props: Record<string, unknown> | null;
  /** Left pane of the two-sheet stack — present only after a `stack`
   *  open while another sheet was showing. */
  secondary: SheetSlot | null;
  side: SheetSide;
  contentClass: string;
  keepMountedState: boolean;
  modal: boolean;
  expanded: boolean;
  /** Transient choreography flag for the slide transition — set on every
   *  state mutation that swaps the right pane: 'push' when a stack open
   *  slides the old pane left, 'pop' when a close slides it back, null
   *  for plain opens/closes (no animation). */
  stackAnim: 'push' | 'pop' | null;
};

export const sheetState = $state<SheetState>({
  open: false,
  panelId: null,
  props: null,
  secondary: null,
  side: 'right',
  contentClass: 'p-0',
  keepMountedState: false,
  modal: true,
  expanded: false,
  stackAnim: null
});

/**
 * Is `panelId` openable right now? Host registry first, then a remote
 * declaration from the module discovery payload. Anything else gets the
 * standard rejection notification — callers never branch on the result.
 */
export function isSheetPanelKnown(panelId: string): boolean {
  return (
    (SHEET_PANEL_IDS as readonly string[]).includes(panelId) ||
    resolveRemoteSheetDecl(panelId) !== null
  );
}

export function openSheet<T extends SheetPanelId>(
  panelId: T,
  props: SheetPanelPropsMap[T],
  options?: SheetOpenOptions
): void;
export function openSheet(
  panelId: string,
  props?: Record<string, unknown>,
  options?: SheetOpenOptions
): void;
export function openSheet(
  panelId: string,
  props?: Record<string, unknown>,
  options?: SheetOpenOptions
) {
  const isHostPanel = (SHEET_PANEL_IDS as readonly string[]).includes(panelId);
  const remoteDecl = isHostPanel ? null : resolveRemoteSheetDecl(panelId);
  if (!isHostPanel && !remoteDecl) {
    pushNotification({
      impact: 'MEDIUM',
      message: `Unknown sheet panel: ${panelId}`,
      scope: 'Sheets',
      toast: true
    });
    return;
  }
  // Two-sheet stack: the open panel slides left; the new one takes the
  // right slot. A non-stacked open always clears the left pane. When a
  // stack is already open, the ORIGINAL left pane is kept — re-stacking
  // must not overwrite it (e.g. re-clicking the version badge inside the
  // record pane would otherwise swap the record for a second copy of
  // version history and lose the record slot).
  const currentPanelId = sheetState.panelId;
  const stacking = Boolean(options?.stack && sheetState.open && currentPanelId);
  sheetState.stackAnim = stacking ? 'push' : null;
  sheetState.secondary = stacking
    ? (sheetState.secondary ?? {
        panelId: currentPanelId as string,
        props: sheetState.props,
        side: sheetState.side,
        contentClass: sheetState.contentClass,
        modal: sheetState.modal
      })
    : null;
  // Declared chrome defaults — the caller's options always win.
  const defaults = remoteDecl?.default_options;
  sheetState.panelId = panelId;
  sheetState.props = (props ?? {}) as Record<string, unknown>;
  sheetState.side = options?.side ?? defaults?.side ?? 'right';
  sheetState.contentClass =
    options?.contentClass ?? defaults?.content_class ?? sheetState.contentClass;
  sheetState.keepMountedState = Boolean(options?.keepMountedState);
  sheetState.modal = options?.modal ?? defaults?.modal ?? true;
  sheetState.expanded = false;
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
): void;
export function replaceSheet(
  panelId: string,
  props?: Record<string, unknown>,
  options?: SheetOpenOptions
): void;
export function replaceSheet(
  panelId: string,
  props?: Record<string, unknown>,
  options?: SheetOpenOptions
) {
  // For now `replace` is identical to `open` (keeps sheet open while switching content).
  openSheet(panelId as SheetPanelId, props as AnyPanelProps, options);
}

export function closeSheet() {
  // Stacked close pops the right pane — the left pane slides back to the
  // right slot and the sheet stays open.
  if (sheetState.secondary) {
    sheetState.stackAnim = 'pop';
    sheetState.panelId = sheetState.secondary.panelId;
    sheetState.props = sheetState.secondary.props;
    sheetState.side = sheetState.secondary.side;
    sheetState.contentClass = sheetState.secondary.contentClass;
    sheetState.modal = sheetState.secondary.modal;
    sheetState.secondary = null;
    return;
  }
  sheetState.stackAnim = null;
  sheetState.open = false;
  sheetState.expanded = false;
  if (sheetState.keepMountedState) return;
  // Clear on a microtask so callers can react to the closing panel id.
  queueMicrotask(() => {
    if (sheetState.open) return;
    sheetState.panelId = null;
    sheetState.props = null;
  });
}

/**
 * Expanded mode — a panel that opts in (e.g. the docs viewer) may widen to
 * half the viewport. Expanded implies modal (the underlying page is covered
 * anyway); collapsing restores the standard 384px non-modal behavior.
 */
export function setSheetExpanded(expanded: boolean) {
  sheetState.expanded = expanded;
  sheetState.modal = expanded ? true : sheetState.modal;
}

