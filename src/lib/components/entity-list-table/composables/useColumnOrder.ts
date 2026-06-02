import { onMount } from 'svelte';
import type { MetaColumn } from '$lib/entity-list/types';

export type ColumnOrderState = {
  sticky?: string[];
  data?: string[];
  auditing?: string[];
};

export function useColumnOrder(columnOrderStorageKey?: string) {
  const orderState = $state<ColumnOrderState>({});

  function readOrderState(): ColumnOrderState {
    if (!columnOrderStorageKey) return {};
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.sessionStorage.getItem(columnOrderStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return {};
      const obj = parsed as any;
      return {
        sticky: Array.isArray(obj.sticky)
          ? obj.sticky.filter((k: unknown) => typeof k === 'string')
          : undefined,
        data: Array.isArray(obj.data) ? obj.data.filter((k: unknown) => typeof k === 'string') : undefined,
        auditing: Array.isArray(obj.auditing)
          ? obj.auditing.filter((k: unknown) => typeof k === 'string')
          : undefined
      };
    } catch {
      return {};
    }
  }

  function writeOrderState(next: ColumnOrderState) {
    if (!columnOrderStorageKey) return;
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(columnOrderStorageKey, JSON.stringify(next));
    } catch {
      // ignore quota / blocked storage
    }
  }

  function applyKeyOrder(cols: MetaColumn[], keys: string[] | undefined): MetaColumn[] {
    if (!keys || keys.length === 0) return cols;
    const byKey = new Map(cols.map((c) => [c.key, c] as const));
    const out: MetaColumn[] = [];
    const used = new Set<string>();
    for (const k of keys) {
      const c = byKey.get(k);
      if (!c) continue;
      out.push(c);
      used.add(k);
    }
    for (const c of cols) {
      if (used.has(c.key)) continue;
      out.push(c);
    }
    return out;
  }

  function moveKeyWithin(keys: string[], fromKey: string, toKey: string): string[] {
    if (fromKey === toKey) return keys;
    const fromIdx = keys.indexOf(fromKey);
    const toIdx = keys.indexOf(toKey);
    if (fromIdx < 0 || toIdx < 0) return keys;
    const next = keys.slice();
    next.splice(fromIdx, 1);
    const insertAt = fromIdx < toIdx ? toIdx - 1 : toIdx;
    next.splice(insertAt, 0, fromKey);
    return next;
  }

  function reorderGroup(
    group: 'data' | 'auditing',
    fromKey: string,
    toKey: string,
    dataColumns: MetaColumn[] | undefined,
    auditingColumns: MetaColumn[] | undefined,
    nonAuditingColumns: MetaColumn[]
  ) {
    const base =
      group === 'data'
        ? (dataColumns ?? nonAuditingColumns).map((c) => c.key)
        : (auditingColumns ?? []).map((c) => c.key);
    const cur = group === 'data' ? (orderState.data ?? base) : (orderState.auditing ?? base);
    const nextKeys = moveKeyWithin(cur, fromKey, toKey);
    const nextState: ColumnOrderState =
      group === 'data' ? { ...orderState, data: nextKeys } : { ...orderState, auditing: nextKeys };
    orderState.data = nextState.data;
    orderState.auditing = nextState.auditing;
    writeOrderState(nextState);
  }

  // Initialize on mount
  onMount(() => {
    const loaded = readOrderState();
    orderState.sticky = loaded.sticky;
    orderState.data = loaded.data;
    orderState.auditing = loaded.auditing;
  });

  return {
    orderState,
    applyKeyOrder,
    moveKeyWithin,
    reorderGroup,
    reset: () => {
      orderState.sticky = undefined;
      orderState.data = undefined;
      orderState.auditing = undefined;
      writeOrderState({});
    }
  };
}
