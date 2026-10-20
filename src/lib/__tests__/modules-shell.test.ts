import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * resolveModuleFromRoute — longest-prefix module ownership under
 * `/{part_of}/{code}` namespacing.
 *
 * A service-owned page (job → /system/job) must resolve to its OWN
 * module even when it sits under a broader root shared with other
 * modules (settings → /system/settings). First-match resolution would
 * let a broad prefix swallow service-declared routes — the anti-pattern
 * this guards against.
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
    part_of: 'system',
    route_prefixes: ['/system/job'],
    is_reserved: false,
  },
  {
    id: 'settings',
    name: 'Settings',
    enabled: true,
    icon: 'settings',
    part_of: 'system',
    // Real prefixes only — no /system catch-all (attribution, not
    // containment). /system/settings/migrations matches via the prefix.
    route_prefixes: ['/system/settings'],
    is_reserved: true,
  },
  {
    id: 'crm',
    name: 'CRM',
    enabled: true,
    icon: 'users',
    part_of: 'crm',
    route_prefixes: ['/crm'],
    is_reserved: false,
  },
];

describe('resolveModuleFromRoute — longest-prefix ownership', () => {
  beforeEach(async () => {
    mocks.fetchModules.mockResolvedValue(MODULES);
    await loadShellNav();
  });

  it('resolves a service-owned page to its own module under /system', () => {
    // /system/job is the job module's own prefix — it must resolve to
    // 'job', never to settings even though both live under /system.
    expect(shellNav.resolveModuleFromRoute('/system/job')).toBe('job');
    expect(shellNav.resolveModuleFromRoute('/system/job/rules')).toBe('job');
  });

  it('resolves routes under a declared prefix to that prefix owner', () => {
    expect(shellNav.resolveModuleFromRoute('/system/settings/profile')).toBe('settings');
    expect(shellNav.resolveModuleFromRoute('/system/settings/migrations')).toBe('settings');
  });

  it('resolves the crm root level correctly', () => {
    expect(shellNav.resolveModuleFromRoute('/crm/customers')).toBe('crm');
    expect(shellNav.resolveModuleFromRoute('/crm/pipeline')).toBe('crm');
  });

  it('does not let a trailing-slash-less prefix over-match', () => {
    // '/system/job-extra' matches neither job's '/system/job'
    // (segment-boundary rule) nor any other declared prefix → unowned.
    expect(shellNav.resolveModuleFromRoute('/system/job-extra')).toBeNull();
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

describe('root levels — part_of grouping', () => {
  beforeEach(async () => {
    mocks.fetchModules.mockResolvedValue(MODULES);
    await loadShellNav();
  });

  it('lists distinct roots with system first', () => {
    expect(shellNav.roots).toEqual(['system', 'crm']);
  });

  it('groups modules by root level', () => {
    expect(shellNav.modulesForRoot('system').map((m) => m.id)).toEqual(['job', 'settings']);
    expect(shellNav.modulesForRoot('crm').map((m) => m.id)).toEqual(['crm']);
  });

  it('selectedRoot derives from the selected module, defaulting to system', () => {
    expect(shellNav.selectedRoot).toBe('system');
  });
});
