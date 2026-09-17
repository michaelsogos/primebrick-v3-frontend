import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveSafeHome } from '$lib/navigation/safe-home';
import type { ModuleInfo, ModuleNav } from '$lib/api-types';

vi.mock('$lib/api', () => ({
  fetchModules: vi.fn(),
  fetchModuleMeta: vi.fn(),
  ApiUnreachableError: class ApiUnreachableError extends Error {},
}));

import { fetchModules, fetchModuleMeta } from '$lib/api';

const mockedFetchModules = vi.mocked(fetchModules);
const mockedFetchModuleMeta = vi.mocked(fetchModuleMeta);

const settingsModule: ModuleInfo = {
  id: 'settings',
  name: 'Settings',
  enabled: true,
  route_prefixes: ['/system/settings'],
  is_reserved: true,
};

const settingsMeta: ModuleNav = {
  module: 'settings',
  nav: [
    { id: 'profile', label_key: 'tabs.profile', href: '/system/settings/profile' },
    { id: 'credentials', label_key: 'tabs.credentials', href: '/system/settings/credentials' },
    { id: 'configurations', label_key: 'tabs.configurations', href: '/system/settings/configurations' },
  ],
};

describe('resolveSafeHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchModules.mockResolvedValue([settingsModule]);
    mockedFetchModuleMeta.mockImplementation(async (code: string) => {
      if (code === 'settings') return settingsMeta;
      throw new Error('unknown module');
    });
  });

  // NOTE: shellNav is a module-level singleton — this test must run before any
  // successful loadShellNav() call, otherwise modules stay populated.
  it('falls back to / when the module list fails to load', async () => {
    mockedFetchModules.mockRejectedValue(new Error('network down'));
    expect(await resolveSafeHome('/system/settings/security')).toBe('/');
  });

  it('renamed route resolves to module default page (profile)', async () => {
    expect(await resolveSafeHome('/system/settings/security')).toBe(
      '/system/settings/profile'
    );
  });

  it('ancestor that is itself a nav page returns the ancestor', async () => {
    expect(await resolveSafeHome('/system/settings/profile/child')).toBe(
      '/system/settings/profile'
    );
  });

  it('falls back to / when no module matches any ancestor', async () => {
    expect(await resolveSafeHome('/nonexistent/place')).toBe('/');
  });

  it('falls back to / when meta fetch fails for every ancestor', async () => {
    mockedFetchModuleMeta.mockRejectedValue(new Error('meta 500'));
    expect(await resolveSafeHome('/system/settings/security')).toBe('/');
  });
});
