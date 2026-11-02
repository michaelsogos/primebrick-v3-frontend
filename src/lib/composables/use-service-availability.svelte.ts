import { aggregateStatus, servicesState } from '$lib/services-store.svelte';

/**
 * Service-availability gate — reads the SSE-fed service registry snapshot
 * (`servicesState`) so a page learns its owning microservice is down
 * WITHOUT firing a doomed fetch (no 503 storm), and re-arms automatically
 * when the next register/heartbeat event flips it back online.
 *
 * `stamp` is a change marker: register/heartbeat upserts mutate the row's
 * status + last_health_check_at, so it flips on every fresh service event
 * for the owner — effects keyed on it run exactly once per real change.
 *
 * `available` is true when the owner has at least one online instance
 * ('online' | 'going_live'), or when the code is not a registered
 * microservice at all (BE-owned modules — their availability is the
 * backend-health concern, not this gate's).
 */
export function useServiceAvailability(owner: () => string | null | undefined) {
	const code = $derived(owner() ?? null);
	const instances = $derived(
		code ? servicesState.services.filter((s) => s.code === code) : [],
	);
	/** null = owner is not a registered microservice (BE-owned module). */
	const status = $derived<string | null>(
		instances.length === 0 ? null : aggregateStatus(instances),
	);
	// Mirror the proxy admission rule exactly: it forwards only when ≥1
	// instance reports status 'online' ('going_live' alone → 503
	// SERVICE_DEGRADED — the fetch is doomed). status === null means the
	// code is not a registered microservice (BE-owned module → always
	// reachable by definition) OR the registry snapshot has not loaded yet.
	const available = $derived(
		status === null || instances.some((i) => i.status === 'online'),
	);
	const stamp = $derived(
		instances.map((s) => `${s.status}:${s.last_health_check_at ?? ''}`).join('|'),
	);

	return {
		get status() {
			return status;
		},
		get available() {
			return available;
		},
		get stamp() {
			return stamp;
		},
	};
}

/** `/svc/<code>/api/v1/...` → `<code>`; direct BE entity paths → null. */
export function serviceCodeOf(basePath: string): string | null {
	return /^\/svc\/([^/]+)\//.exec(basePath)?.[1] ?? null;
}
