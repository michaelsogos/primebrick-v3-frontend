import type { Snippet } from 'svelte';
import type { MetaColumn, SortDir, ListMetaViewVisibility, ViewName, AdvancedFilter } from '$lib/entity-list/types';

export type CellArgs<TRow extends Record<string, unknown>> = {
  row: TRow;
  column: MetaColumn;
};

export type ColumnOrderState = {
  sticky?: string[];
  data?: string[];
  auditing?: string[];
};

export type ViewMode = 'table' | 'cards' | 'cards_list';

export type ToolbarMode = 'filters' | 'bulk';

export type DeletionFilterMode = 'non_deleted' | 'deleted' | 'all';

/**
 * Main props interface for EntityListTable component
 */
export type EntityListTableProps<TRow extends Record<string, unknown>> = {
  /** Meta column key whose values uniquely identify a row in the list (uuid, id, …). */
  uid: string;
  /** Entity type for API calls (e.g., 'customer', 'product') */
  entity?: string;
  /**
   * Columns to render/select in the UI.
   * - New shape (preferred): provide `stickyColumns` + `dataColumns` + `auditingColumns`
   * - Back-compat: provide `columns` only
   */
  columns: MetaColumn[];
  stickyColumns?: MetaColumn[];
  dataColumns?: MetaColumn[];
  auditingColumns?: MetaColumn[];
  viewVisibility?: ListMetaViewVisibility;
  /** Session-scoped (sessionStorage) storage key for per-group column ordering. */
  columnOrderStorageKey?: string;
  /** Session-scoped (sessionStorage) storage key for filter values. */
  filterValuesStorageKey?: string;
  /** Session-scoped (sessionStorage) storage key for advanced filters. */
  advancedFiltersStorageKey?: string;
  defaultSort?: { key: string; dir: SortDir };
  pageSizeOptions?: number[];
  searchPlaceholderKey?: string;
  selectionLabelKey?: string;
  selectionLabelSingularKey?: string;
  selectionLabelText?: string;
  selectionLabelSingularText?: string;
  rows: TRow[];
  total: bigint;
  metaLoading: boolean;
  rowsLoading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  search: string;
  onSearchInput: (value: string) => void;
  searchInKeys: string[] | null;
  onSearchInKeysChange: (keys: string[] | null) => void;
  sortKey: string | null;
  sortDir: SortDir;
  onSortChange: (key: string | null, dir: SortDir) => void;
  visibleKeys: string[];
  onVisibleKeysChange: (keys: string[]) => void;
  onResetColumnVisibility: (view: ViewName) => void;
  selectedKeys: string[];
  onSelectedKeysChange: (keys: string[]) => void;
  rowSelectionEnabled?: boolean;
  onRefresh: () => void;
  refreshDisabled?: boolean;
  rowActionsEnabled?: boolean;
  rowActions?: Snippet<[ { row: TRow } ]>;
  entityRowActions?: {
    duplicate?: boolean;
    delete?: boolean;
    edit?: boolean;
    preview?: boolean;
    customActions?: Array<{
      actionName: string;
      translationKey: string;
      icon: string;
      textColor?: string;
      disabledWhenDeleted?: boolean;
    }>;
  };
  customActionHandlers?: Record<string, (row: TRow) => void>;
  onCreateAction?: () => void;
  onEditAction?: (row: TRow) => void;
  filtersOpen?: boolean;
  filterValues?: Record<string, any>;
  onFilterValuesChange?: (values: Record<string, any>) => void;
  onResetFilters?: () => void;
  advancedFilters?: AdvancedFilter[];
  onAdvancedFiltersChange?: (filters: AdvancedFilter[], connector: 'AND' | 'OR') => void;
  deletionFilterMode?: 'non_deleted' | 'deleted' | 'all';
  onDeletionFilterModeChange?: (mode: 'non_deleted' | 'deleted' | 'all') => void;
  /** Two-way with parent when the route uses `{#snippet cell}` and must mirror IANA datetime formatting. */
  datetimeIanaModeByKey?: Record<string, 'browser' | 'record'>;
  datetimeIanaRenderTick?: number;
  cell?: Snippet<[CellArgs<TRow>]>;
  metaLoadingView?: Snippet;
  rowsLoadingView?: Snippet;
  emptyView?: Snippet;
  errorView?: Snippet;
  loadingMessage?: string;
  noRecordsMessage?: string;
};
