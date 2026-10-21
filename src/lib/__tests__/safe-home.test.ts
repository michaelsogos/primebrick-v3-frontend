import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveSafeHome } from '$lib/navigation/safe-home';
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
  nav: [
    { id: 'profile', label_key: 'tabs.profile', href: '/system/settings/profile' },
    { id: 'credentials', label_key: 'tabs.credentials', href: '/system/settings/credentials' },
    { id: 'configurations', label_key: 'tabs.configurations', href: '/system/settings/configurations' },
  ],
  home: { system: '/system/settings/profile' },
};

describe('resolveSafeHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchModules.mockResolvedValue([settingsModule]);
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
});
