import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRouteAccessible, safePageFor } from '$lib/navigation/access-guard';
import { resolveSafePage } from '$lib/navigation/safe-page';
import type { ModuleInfo } from '$lib/api-types';

vi.mock('$lib/api', () => ({
  fetchModules: vi.fn(),
  ApiUnreachableError: class ApiUnreachableError extends Error {},
}));

import { fetchModules } from '$lib/api';

const mockedFetchModules = vi.mocked(fetchModules);

const settingsModule: ModuleInfo = {
  id: 'settings',
  name: 'Settings',
  enabled: true,
  part_of: 'system',
  route_prefixes: ['/system/settings'],
  is_reserved: true,
  is_default: true,
  nav: [
    { id: 'profile', label_key: 'tabs.profile', href: '/system/settings/profile', default: true },
    { id: 'users', label_key: 'tabs.users', href: '/system/settings/users' },
  ],
  routes: [
    { route: '/system/settings/profile' },
    { route: '/system/settings/users' },
    { route: '/system/settings/users/[uuid]' },
    { route: '/system/settings/users/create' },
  ] as ModuleInfo['routes'],
};

const jobModule: ModuleInfo = {
  id: 'job',
  name: 'Job Handler',
  enabled: true,
  part_of: 'system',
  route_prefixes: ['/system/job'],
  nav: [{ id: 'schedules', label_key: 'job.nav.schedules', href: '/system/job/job-schedules', default: true }],
  routes: [{ route: '/system/job/job-schedules' }] as ModuleInfo['routes'],
};

// Module with ZERO accessible leaves — present only for the reveal switch.
const aiModule: ModuleInfo = {
  id: 'ai',
  name: 'AI',
  enabled: true,
  part_of: 'system',
  route_prefixes: ['/system/ai'],
  accessible: false,
  nav: [],
  nav_hidden: [{ id: 'console', label_key: 'ai.nav.console', href: '/system/ai/console' }],
};

const MODULES: ModuleInfo[] = [settingsModule, jobModule, aiModule];

describe('isRouteAccessible — access-filtered census', () => {
  it('host surface is open — paths no module owns', () => {
    expect(isRouteAccessible('/', MODULES)).toBe(true);
    expect(isRouteAccessible('/login', MODULES)).toBe(true);
    expect(isRouteAccessible('/docs/anything', MODULES)).toBe(true);
  });

  it('declared routes and nav leaves are accessible', () => {
    expect(isRouteAccessible('/system/settings/profile', MODULES)).toBe(true);
    expect(isRouteAccessible('/system/settings/users', MODULES)).toBe(true);
    expect(isRouteAccessible('/system/job/job-schedules', MODULES)).toBe(true);
  });

  it('[param] route patterns match concrete paths', () => {
    expect(isRouteAccessible('/system/settings/users/abc-123', MODULES)).toBe(true);
    expect(isRouteAccessible('/system/settings/users/create', MODULES)).toBe(true);
    // Deeper than the pattern — not a match.
    expect(isRouteAccessible('/system/settings/users/abc/extra', MODULES)).toBe(false);
  });

  it('denies paths under an owned prefix absent from the census', () => {
    // Filtered or unknown — deliberately indistinguishable.
    expect(isRouteAccessible('/system/settings/secret', MODULES)).toBe(false);
    expect(isRouteAccessible('/system/job/rules', MODULES)).toBe(false);
  });

  it('denies every path of an accessible:false module — including its prefix', () => {
    expect(isRouteAccessible('/system/ai', MODULES)).toBe(false);
    expect(isRouteAccessible('/system/ai/console', MODULES)).toBe(false);
  });

  it('bare prefixes are open — the root shim resolves the default leaf', () => {
    expect(isRouteAccessible('/system/settings', MODULES)).toBe(true);
    expect(isRouteAccessible('/system/job', MODULES)).toBe(true);
  });
});

describe('safePageFor — fallback resolution', () => {
  it('denied page resolves to the owning module default leaf', () => {
    expect(safePageFor('/system/settings/secret', MODULES)).toBe('/system/settings/profile');
    expect(safePageFor('/system/job/anything', MODULES)).toBe('/system/job/job-schedules');
  });

  it('fully-inaccessible module falls to the root default module leaf', () => {
    expect(safePageFor('/system/ai/console', MODULES)).toBe('/system/settings/profile');
  });

  it('unowned path resolves to /', () => {
    expect(safePageFor('/nonexistent/place', MODULES)).toBe('/');
  });
});

describe('resolveSafePage — shell-integrated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchModules.mockResolvedValue({ modules: MODULES, labels: {} });
  });

  // NOTE: shellNav is a module-level singleton — this test must run before
  // any successful loadShellNav() call, otherwise modules stay populated.
  it('falls back to / when the module list fails to load', async () => {
    mockedFetchModules.mockRejectedValue(new Error('network down'));
    expect(await resolveSafePage('/system/settings/security')).toBe('/');
  });

  it('denied route resolves to the module default leaf', async () => {
    expect(await resolveSafePage('/system/settings/security')).toBe('/system/settings/profile');
  });
});
