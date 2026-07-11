import { fetchServices, type ServiceInfo } from '$lib/api';

export const servicesState = $state({
  services: [] as ServiceInfo[],
  loading: true,
  lastCheckedAt: null as number | null,
});

let pollInterval: ReturnType<typeof setInterval> | null = null;

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

export function startServicesPolling(intervalMs = 30000): void {
  if (pollInterval) return;
  void probeServices();
  pollInterval = setInterval(() => void probeServices(), intervalMs);
}

export function stopServicesPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

/**
 * Aggregate status across instances of the same service code.
 * - 'online' — all instances are online
 * - 'going_live' — 1+ online, 1+ not online
 * - 'offline' — zero instances online
 */
export function aggregateStatus(instances: ServiceInfo[]): string {
  if (instances.length === 0) return 'offline';
  if (instances.every((i) => i.status === 'online')) return 'online';
  if (instances.some((i) => i.status === 'online')) return 'going_live';
  return 'offline';
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
