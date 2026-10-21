import { describe, it, expect, beforeEach } from 'vitest';
import { userProfileStore, userProfileState } from '$lib/user-profile-store.svelte';

/**
 * Single-source-of-truth contract: `/auth/me` owns identity; login/refresh
 * claims payloads may only touch session metadata via `setSession`.
 */
describe('userProfileStore.setSession', () => {
  beforeEach(() => {
    userProfileStore.clear();
  });

  it('writes session fields only — identity is never overwritten by claims', () => {
    userProfileStore.set({
      idp_code: 'idp-user-1',
      display_name: 'Prime Admin',
      avatar_color: '#0AB681',
      avatar_initials: 'PA',
      is_admin: true,
      email: 'admin@acme.test',
    });

    userProfileStore.setSession({
      username: 'micha',
      idp_code: 'idp-user-1',
      display_name: 'Micha',           // claims drift — must be dropped
      email: 'micha@idp.test',         // claims drift — must be dropped
      expires_at: Date.now() + 3600_000,
      roles: [{ name: 'admin' }],
      organization: 'acme',
    });

    const u = userProfileState.current!;
    expect(u.display_name).toBe('Prime Admin');
    expect(u.email).toBe('admin@acme.test');
    expect(u.avatar_color).toBe('#0AB681');
    expect(u.is_admin).toBe(true);
    expect(u.username).toBe('micha');
    expect(u.expires_at).toBeGreaterThan(Date.now());
    expect(u.organization).toBe('acme');
  });

  it('account switch — different idp_code drops the stale identity', () => {
    userProfileStore.set({
      idp_code: 'idp-user-1',
      display_name: 'Prime Admin',
      avatar_initials: 'PA',
      is_admin: true,
    });

    userProfileStore.setSession({
      username: 'bob',
      idp_code: 'idp-user-2',
      expires_at: Date.now() + 3600_000,
    });

    const u = userProfileState.current!;
    expect(u.idp_code).toBe('idp-user-2');
    expect(u.username).toBe('bob');
    // identity of the previous account is gone — /auth/me repopulates
    expect(u.display_name).toBeUndefined();
    expect(u.avatar_initials).toBeUndefined();
    expect(u.is_admin).toBeUndefined();
  });

  it('first login — session fields land even with an empty store', () => {
    userProfileStore.setSession({
      username: 'micha',
      idp_code: 'idp-user-1',
      expires_at: Date.now() + 3600_000,
    });
    expect(userProfileState.current?.idp_code).toBe('idp-user-1');
  });
});
