import type { MetaColumn } from '$lib/entity-list/types';

/** Top-align cells that stack datetime value + IANA badge. */
export function entityListDataCellValignClass(col: MetaColumn): string | undefined {
  return col.datetimeIanaToggle ? 'align-top' : undefined;
}

/** Amber tint only when showing the record's stored IANA timezone; browser/local mode uses default neutral like other columns. */
export function isDatetimeIanaRecordMode(col: MetaColumn, datetimeIanaModeByKey: Record<string, 'browser' | 'record'>): boolean {
  if (col.type !== 'datetime' || !col.datetimeIanaToggle) return false;
  return (datetimeIanaModeByKey[col.key] ?? 'browser') === 'record';
}

/**
 * Datetime columns with IANA toggle: light header band above body (`amber-100` vs cell `amber-50`).
 * Dark: same **Tailwind amber** ramp as body (`amber-950`).
 * `Table.Row` applies `[&>th]:[…]:hover:bg-muted`; repeat the same bg on `hover:` with `!` so the
 * header does not grey out on row hover (hover tint stays on body cells only).
 */
export function datetimeIanaHeadHighlightClass(col: MetaColumn, datetimeIanaModeByKey: Record<string, 'browser' | 'record'>): string | undefined {
  if (!isDatetimeIanaRecordMode(col, datetimeIanaModeByKey)) return undefined;
  return 'bg-amber-100! hover:bg-amber-100! dark:bg-amber-950! dark:hover:bg-amber-950!';
}

/**
 * Datetime IANA body cells: amber palette only in record (stored timezone) mode. Browser mode: no classes here
 * (standard neutral interaction applies). Light: 50→100 hover, 200→300 when row selected.
 * Dark (Tailwind amber): base `950` → hover `900` → selected `800` → selected+hover `700`.
 */
export function datetimeIanaCellHighlightClass(col: MetaColumn, rowSelected: boolean, datetimeIanaModeByKey: Record<string, 'browser' | 'record'>): string | undefined {
  if (!isDatetimeIanaRecordMode(col, datetimeIanaModeByKey)) return undefined;
  if (rowSelected) {
    return 'bg-amber-200/95! dark:bg-amber-800! transition-colors group-hover/entity-row:bg-amber-300/95! dark:group-hover/entity-row:bg-amber-700!';
  }
  return 'bg-amber-50! dark:bg-amber-950! transition-colors group-hover/entity-row:bg-amber-100/95! dark:group-hover/entity-row:bg-amber-900!';
}

/** Card view: highlight datetime+IANA fields when record (IANA locale) mode is active. */
export function datetimeIanaCardFieldHighlightClass(col: MetaColumn, rowSelected: boolean, datetimeIanaModeByKey: Record<string, 'browser' | 'record'>): string | undefined {
  if (!isDatetimeIanaRecordMode(col, datetimeIanaModeByKey)) return undefined;
  if (rowSelected) {
    return 'rounded-md border border-amber-300/70 bg-amber-200/70 p-2 transition-colors group-hover:bg-amber-300/75 dark:border-amber-700 dark:bg-amber-800 dark:group-hover:bg-amber-700';
  }
  return 'rounded-md border border-amber-200/70 bg-amber-50/70 p-2 transition-colors group-hover:bg-amber-100/80 dark:border-amber-900 dark:bg-amber-950 dark:group-hover:bg-amber-900';
}

/**
 * Checkbox / actions (dark): base `900`, hover `800`, selected `700`, selected+hover `600` — same ramp as sticky uuid/code body.
 */
export function entityListGrayChromeCellClass(rowSelected: boolean): string {
  return rowSelected
    ? 'bg-neutral-300! dark:bg-neutral-700! transition-colors group-hover/entity-row:bg-neutral-400! dark:group-hover/entity-row:bg-neutral-600!'
    : 'bg-neutral-100 dark:bg-neutral-900 transition-colors group-hover/entity-row:bg-neutral-200 dark:group-hover/entity-row:bg-neutral-800';
}

/**
 * Destructive background for deleted rows (light red): base `100`, hover `200`, selected `300`, selected+hover `400`.
 * Dark: base `900`, hover `800`, selected `700`, selected+hover `600`.
 */
export function entityListDestructiveChromeCellClass(rowSelected: boolean): string {
  return rowSelected
    ? 'bg-rose-300! dark:bg-rose-700! transition-colors group-hover/entity-row:bg-rose-400! dark:group-hover/entity-row:bg-rose-600!'
    : 'bg-rose-100! dark:bg-rose-900! transition-colors group-hover/entity-row:bg-rose-200! dark:group-hover/entity-row:bg-rose-800!';
}

/**
 * Sticky uuid/code body overlay (dark, not IANA): base from `stickyCellClass`; hover `800`; selected `700` / `600`.
 */
export function entityListGrayBandStickyInteractionClass(rowSelected: boolean): string {
  return rowSelected
    ? 'bg-neutral-300! dark:bg-neutral-700! transition-colors group-hover/entity-row:bg-neutral-400! dark:group-hover/entity-row:bg-neutral-600!'
    : 'transition-colors group-hover/entity-row:bg-neutral-200 dark:group-hover/entity-row:bg-neutral-800';
}

/**
 * Destructive sticky uuid/code body overlay for deleted rows: base `200`, hover `300`, selected `400` / `500` (slightly darker than chrome).
 * Dark: base `800`, hover `700`, selected `600` / `500`.
 */
export function entityListDestructiveBandStickyInteractionClass(rowSelected: boolean): string {
  return rowSelected
    ? 'bg-rose-400! dark:bg-rose-600! transition-colors group-hover/entity-row:bg-rose-500! dark:group-hover/entity-row:bg-rose-500!'
    : 'bg-rose-200! dark:bg-rose-800! transition-colors group-hover/entity-row:bg-rose-300! dark:group-hover/entity-row:bg-rose-700!';
}

/**
 * Normal (non-sticky) scroll cells — **not** IANA record (IANA uses its own ramp). Light unchanged.
 * Dark: rest `950`, hover `900`, selected `900`, selected+hover `800` (sticky selected resta `700`/`600`).
 */
export function entityListDefaultScrollInteractionClass(rowSelected: boolean): string | undefined {
  if (rowSelected) {
    return 'transition-colors bg-neutral-100! dark:bg-neutral-900! group-hover/entity-row:bg-neutral-200! dark:group-hover/entity-row:bg-neutral-800!';
  }
  return 'dark:bg-neutral-950! transition-colors group-hover/entity-row:bg-neutral-50! dark:group-hover/entity-row:bg-neutral-900!';
}

/**
 * Destructive scroll cells for deleted rows: base `100`, hover `200`, selected `300`, selected+hover `400`.
 * Dark: base `900`, hover `800`, selected `700`, selected+hover `600`.
 */
export function entityListDestructiveScrollInteractionClass(rowSelected: boolean): string | undefined {
  if (rowSelected) {
    return 'transition-colors bg-rose-300! dark:bg-rose-700! group-hover/entity-row:bg-rose-400! dark:group-hover/entity-row:bg-rose-600!';
  }
  return 'bg-rose-100! dark:bg-rose-900! transition-colors group-hover/entity-row:bg-rose-200! dark:group-hover/entity-row:bg-rose-800!';
}
