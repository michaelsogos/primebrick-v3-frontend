import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * resolveModuleFromRoute — longest-prefix module ownership.
 *
 * A service-owned page (job → /jobs) must resolve to its OWN module
 * even when it sits under a broader prefix owned by another module
 * (settings → /system). First-match resolution would let the broad prefix
 * swallow service-declared routes — the anti-pattern this guards against.
 */

const mocks = vi.hoisted(() => ({
  fetchModules: vi.fn(),
  fetchModuleMeta: vi.fn(),
}));

vi.mock('$lib/api', () => ({
  fetchModules: mocks.fetchModules,
  fetchModuleMeta: mocks.fetchModuleMeta,
  ApiUnreachableError: class ApiUnreachableError extends Error {},
}));

import { loadShellNav, shellNav } from '$lib/shell/modules-shell.svelte';

const MODULES = [
  {
    id: 'job',
    name: 'Job Handler',
    enabled: true,
    icon: 'schedule',
    route_prefixes: ['/jobs'],
    is_reserved: false,
  },
  {
    id: 'settings',
    name: 'Settings',
    enabled: true,
    icon: 'settings',
    // Real prefixes only — no /system catch-all (attribution, not containment)
    route_prefixes: ['/system/settings', '/system/migrations'],
    is_reserved: true,
  },
  {
    id: 'crm',
    name: 'CRM',
    enabled: true,
    icon: 'users',
    route_prefixes: ['/system/customers', '/crm'],
    is_reserved: false,
  },
];

describe('resolveModuleFromRoute — longest-prefix ownership', () => {
  beforeEach(async () => {
    mocks.fetchModules.mockResolvedValue(MODULES);
    await loadShellNav();
  });

  it('resolves a service-owned page to its own module, not the broad prefix owner', () => {
    // /jobs is the job module's own prefix — it must resolve to 'job',
    // never to a foreign module.
    expect(shellNav.resolveModuleFromRoute('/jobs')).toBe('job');
  });

  it('resolves routes under a declared prefix to that prefix owner', () => {
    expect(shellNav.resolveModuleFromRoute('/system/settings/profile')).toBe('settings');
    expect(shellNav.resolveModuleFromRoute('/system/migrations')).toBe('settings');
  });

  it('resolves multi-prefix modules correctly', () => {
    expect(shellNav.resolveModuleFromRoute('/system/customers')).toBe('crm');
    expect(shellNav.resolveModuleFromRoute('/crm/pipeline')).toBe('crm');
  });

  it('does not let a trailing-slash-less prefix over-match', () => {
    // '/jobs-extra' matches neither job's '/jobs' (segment-boundary rule)
    // nor any other declared prefix → unowned.
    expect(shellNav.resolveModuleFromRoute('/jobs-extra')).toBeNull();
    // An undeclared /system subtree is unowned, not settings'.
    expect(shellNav.resolveModuleFromRoute('/system/users')).toBeNull();
  });

  it('returns null when nothing matches — neutral, not the reserved module', () => {
    // No route_prefix claims `/` or /unknown/path: no module is attributed.
    // The switcher shows a neutral state instead of falsely crediting the
    // reserved module for pages it does not own.
    expect(shellNav.resolveModuleFromRoute('/')).toBeNull();
    expect(shellNav.resolveModuleFromRoute('/unknown/path')).toBeNull();
  });
});
