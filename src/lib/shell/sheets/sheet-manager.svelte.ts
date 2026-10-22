export type SheetSide = 'left' | 'right';

/**
 * Runtime list of every registered panel key — the type below derives from
 * it (single source). Remote pages reach this registry only through
 * `ctx.components.openSheet`, which validates `panelKey` against this list:
 * an unknown key is rejected with a notification instead of opening an
 * empty sheet.
 */
export const SHEET_PANEL_IDS = [
  'shell.errors',
  'shell.versions',
  'shell.aiChat',
  'shell.aiGuide',
  'entity.searchIn',
  'entity.columns',
  'entity.filters',
  'entity.versionHistory',
  'config.currencySelect',
  'config.protocolSelect',
  'config.phonePrefixSelect',
  'config.regexFlags',
  'config.regexAiChat',
  'config.jsonAiChat',
  'config.badgeValueEdit',
  'shell.aiModelTestReport',
  'shell.aiCerebellum',
  'shell.aiModelImport',
  'shell.aiModelCache',
  'shell.docs',
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
  'entity.filters': {
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
    columns?: any[];
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
  'shell.aiModelTestReport': {
    /** The ai_model row whose test_scores report is rendered. */
    model: import('$lib/api-types').AiModel;
  };
  'shell.aiCerebellum': {
    /** Enabled ai_model rows for the model ComboSelect. */
    models: readonly import('$lib/api-types').AiModel[];
    /** Known assistants: key + stored `name` i18n key for that assistant. */
    assistants: readonly { key: string; name: string }[];
    /** Existing cerebellum rows — a matching (assistant, model) pair turns the sheet into edit mode. */
    rows?: readonly import('$lib/api-types').AiCerebellum[];
    /** Called after a successful save so the caller can reload rows. */
    onCreated?: () => void;
  };
  'shell.aiModelImport': {
    /** model_id values already in the catalog — excluded from HF results. */
    existing_model_ids?: readonly string[];
    /** Called after a model row is created so the caller can reload. */
    on_added?: () => void;
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
  'shell.aiModelCache': {
    /** The model currently loaded in VRAM — its cache cannot be deleted. */
    active_model_id?: string | null;
    /** model_id → quality rank, from the compatible catalog snapshot. */
    model_ranks?: Record<string, number | null>;
  };
  'shell.docs': Record<string, never>;
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

type SheetState = {
  open: boolean;
  panelId: SheetPanelId | null;
  props: AnyPanelProps | null;
  side: SheetSide;
  contentClass: string;
  keepMountedState: boolean;
  modal: boolean;
  expanded: boolean;
};

export const sheetState = $state<SheetState>({
  open: false,
  panelId: null,
  props: null,
  side: 'right',
  contentClass: 'p-0',
  keepMountedState: false,
  modal: true,
  expanded: false
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
  sheetState.modal = options?.modal ?? true;
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
) {
  // For now `replace` is identical to `open` (keeps sheet open while switching content).
  openSheet(panelId, props, options);
}

export function closeSheet() {
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

