import { fetchServices, type ServiceInfo } from '$lib/api';
import { createSseConnection, parseSseData } from '$lib/sse/create-sse-connection';

export const servicesState = $state({
  services: [] as ServiceInfo[],
  loading: true,
  lastCheckedAt: null as number | null,
});

let closeSse: (() => void) | null = null;

/**
 * Initial fetch — loads services via REST before SSE connects.
 * This ensures the UI has data even if SSE takes a moment to connect.
 */
export async function probeServices(): Promise<void> {
  try {
    servicesState.services = await fetchServices();
    servicesState.lastCheckedAt = Date.now();
  } catch {
    // Silently fail — services panel is non-critical
  } finally {
    servicesState.loading = false;
  }
}

/**
 * Start streaming service events via SSE.
 * Replaces the 30s polling loop with real-time push.
 * Falls back to REST fetch if SSE fails to connect.
 */
export function startServicesStream(): void {
  if (closeSse) return;

  // Initial REST fetch for immediate data
  void probeServices();

  closeSse = createSseConnection({
    url: '/api/v1/system/services/events',
    onMessage: (msg) => {
      if (msg.event === 'snapshot') {
        const data = parseSseData<{ services: ServiceInfo[] }>(msg.data);
        servicesState.services = data.services;
        servicesState.lastCheckedAt = Date.now();
        servicesState.loading = false;
      } else if (
        msg.event === 'service.register' ||
        msg.event === 'service.heartbeat' ||
        msg.event === 'service.unregister' ||
        msg.event === 'service.stale'
      ) {
        const service = parseSseData<ServiceInfo>(msg.data);
        upsertService(service);
        servicesState.lastCheckedAt = Date.now();
      }
    },
    onError: () => {
      // SSE error — backoff and reconnect is handled by createSseConnection.
      // The services panel is non-critical; no notification needed.
    },
  });
}

export function stopServicesStream(): void {
  if (closeSse) {
    closeSse();
    closeSse = null;
  }
}

/**
 * Upsert a single service into the state array.
 * Matches by code + base_url (composite key for non-scaler services).
 */
function upsertService(service: ServiceInfo): void {
  const idx = servicesState.services.findIndex(
    (s) => s.code === service.code && s.base_url === service.base_url,
  );
  if (idx >= 0) {
    servicesState.services[idx] = service;
  } else {
    servicesState.services.push(service);
  }
}

/**
 * Aggregate status across instances of the same service code.
 * - 'online' — all instances are online
 * - 'going_live' — 1+ online, 1+ not online
 * - 'offline' — all instances are offline
 * - 'unknown' — no online instances and at least one non-offline (e.g. 'unknown')
 */
export function aggregateStatus(instances: ServiceInfo[]): string {
  if (instances.length === 0) return 'offline';
  if (instances.every((i) => i.status === 'online')) return 'online';
  if (instances.some((i) => i.status === 'online')) return 'going_live';
  if (instances.every((i) => i.status === 'offline')) return 'offline';
  return 'unknown';
}

/** Group services by code, returning a Map for ordered iteration. */
export function groupByCode(services: ServiceInfo[]): Map<string, ServiceInfo[]> {
  const map = new Map<string, ServiceInfo[]>();
  for (const s of services) {
    if (!map.has(s.code)) map.set(s.code, []);
    map.get(s.code)!.push(s);
  }
  return map;
}
