import { onMount } from 'svelte';
import type { MetaColumn } from '$lib/entity-list/types';
import type { DeepReadonly } from '$lib/types/deep-readonly';

export type ColumnOrderState = {
  sticky?: string[];
  data?: string[];
  auditing?: string[];
};

export function useColumnOrder(getColumnOrderStorageKey: () => string | undefined) {
  const _state = $state<ColumnOrderState>({});

  function readOrderState(): ColumnOrderState {
    const columnOrderStorageKey = getColumnOrderStorageKey();
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
    const columnOrderStorageKey = getColumnOrderStorageKey();
    if (!columnOrderStorageKey) return;
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(columnOrderStorageKey, JSON.stringify(next));
    } catch {
      // ignore quota / blocked storage
    }
  }

  function applyKeyOrder(cols: MetaColumn[], keys: readonly string[] | undefined): MetaColumn[] {
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
    const cur = group === 'data' ? (_state.data ?? base) : (_state.auditing ?? base);
    const nextKeys = moveKeyWithin(cur, fromKey, toKey);
    const nextState: ColumnOrderState =
      group === 'data' ? { ..._state, data: nextKeys } : { ..._state, auditing: nextKeys };
    _state.data = nextState.data;
    _state.auditing = nextState.auditing;
    writeOrderState(nextState);
  }

  function applyColumnVisibility(group: 'sticky' | 'data' | 'auditing', keys: string[]) {
    const nextState: ColumnOrderState = { ..._state, [group]: keys };
    _state.sticky = nextState.sticky;
    _state.data = nextState.data;
    _state.auditing = nextState.auditing;
    writeOrderState(nextState);
  }

  // Initialize on mount
  onMount(() => {
    const loaded = readOrderState();
    _state.sticky = loaded.sticky;
    _state.data = loaded.data;
    _state.auditing = loaded.auditing;
  });

  return {
    get state(): DeepReadonly<typeof _state> { return _state; },
    applyKeyOrder,
    moveKeyWithin,
    reorderGroup,
    applyColumnVisibility,
    writeOrderState,
    reset: () => {
      _state.sticky = undefined;
      _state.data = undefined;
      _state.auditing = undefined;
      writeOrderState({});
    }
  };
}
