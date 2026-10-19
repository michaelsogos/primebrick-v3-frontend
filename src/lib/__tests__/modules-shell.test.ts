import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * resolveModuleFromRoute — longest-prefix module ownership.
 *
 * A service-owned page (job → /system/jobs) must resolve to its OWN module
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
    route_prefixes: ['/system/jobs'],
    is_reserved: false,
  },
  {
    id: 'settings',
    name: 'Settings',
    enabled: true,
    icon: 'settings',
    route_prefixes: ['/system'],
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
    // /system/jobs sits under settings' /system prefix but the job module
    // declares the longer /system/jobs prefix — the specific owner wins.
    expect(shellNav.resolveModuleFromRoute('/system/jobs')).toBe('job');
  });

  it('resolves broader-prefix routes to the broad prefix owner', () => {
    expect(shellNav.resolveModuleFromRoute('/system/settings/profile')).toBe('settings');
    expect(shellNav.resolveModuleFromRoute('/system/users')).toBe('settings');
    expect(shellNav.resolveModuleFromRoute('/system/migrations')).toBe('settings');
  });

  it('resolves multi-prefix modules correctly', () => {
    expect(shellNav.resolveModuleFromRoute('/system/customers')).toBe('crm');
    expect(shellNav.resolveModuleFromRoute('/crm/pipeline')).toBe('crm');
  });

  it('does not let a trailing-slash-less prefix over-match', () => {
    // '/system/jobs-extra' must NOT match job's '/system/jobs' prefix —
    // it falls back to settings' '/system'.
    expect(shellNav.resolveModuleFromRoute('/system/jobs-extra')).toBe('settings');
  });

  it('falls back to the reserved module when nothing matches', () => {
    expect(shellNav.resolveModuleFromRoute('/')).toBe('settings');
    expect(shellNav.resolveModuleFromRoute('/unknown/path')).toBe('settings');
  });
});
