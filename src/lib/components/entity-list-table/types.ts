import type { MetaColumn } from '$lib/entity-list/types';

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
