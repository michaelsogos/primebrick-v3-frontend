/**
 * Host section registry — `host:<key>` sources inside a page's
 * `layout.sections` resolve to components registered here.
 *
 * A host section is a host-compiled component rendered in the host's own
 * realm (no cross-bundle bridge needed — it mounts inside a host DOM slot).
 * Contract: `{ section: PageSectionDecl; ctx: ModulePageHost }` props.
 *
 * Registration is explicit and app-owned — host chrome registers keys for
 * reusable building blocks (e.g. `entity_table`) so descriptor pages can
 * compose host pieces without shipping a remote chunk.
 */
import type { Component } from 'svelte';
import type { ModulePageHost, PageSectionDecl } from '@primebrick/ui';

/** Props every host-registered section receives. */
export type HostSectionProps = {
	section: PageSectionDecl;
	ctx: ModulePageHost;
};

const REGISTRY = new Map<string, Component<HostSectionProps>>();

/** Register a host section under `<key>` — later calls overwrite (HMR-safe). */
export function registerHostSection(key: string, component: Component<HostSectionProps>): void {
	REGISTRY.set(key, component);
}

export function getHostSection(key: string): Component<HostSectionProps> | undefined {
	return REGISTRY.get(key);
}
