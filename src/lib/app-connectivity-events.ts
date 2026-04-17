import { browser } from '$app/environment';

/** Dispatched on window when health goes from degraded to fully OK (not on first `loading` → `ok`). */
export const CONNECTIVITY_RESTORED_EVENT = 'primebrick:connectivity-restored' as const;

export type ConnectivityRestoredDetail = {
  previous: 'backend_offline' | 'db_offline';
};

export function dispatchConnectivityRestored(detail: ConnectivityRestoredDetail): void {
  if (!browser || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CONNECTIVITY_RESTORED_EVENT, { detail }));
}

/**
 * Subscribe to connectivity recovery. Returns unsubscribe for use in `$effect` cleanup or `onDestroy`.
 */
export function onConnectivityRestored(
  handler: (detail: ConnectivityRestoredDetail) => void
): () => void {
  if (!browser || typeof window === 'undefined') {
    return () => {};
  }
  const listener = (ev: Event) => {
    const ce = ev as CustomEvent<ConnectivityRestoredDetail>;
    const d = ce.detail;
    if (
      d &&
      (d.previous === 'backend_offline' || d.previous === 'db_offline')
    ) {
      handler(d);
    }
  };
  window.addEventListener(CONNECTIVITY_RESTORED_EVENT, listener);
  return () => window.removeEventListener(CONNECTIVITY_RESTORED_EVENT, listener);
}
