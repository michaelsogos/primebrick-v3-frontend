import { describe, it, expect, beforeEach } from 'vitest';
import { hasAccess } from '$lib/permissions.svelte';
import { userProfileState } from '$lib/user-profile-store.svelte';

/**
 * FE mirror of the SDK `isAccessGranted` contract — keep the two in sync.
 * Covers: open-when-undeclared, deny-first invalid keys, hierarchical
 * bare-grant coverage, wildcards, and the admin→access.system-only rule.
 */
describe('hasAccess — access.{app}.{module}.{page}', () => {
  beforeEach(() => {
    userProfileState.current = null;
  });

  it('open when no requirement declared', () => {
    expect(hasAccess(undefined)).toBe(true);
    expect(hasAccess(null)).toBe(true);
  });

  it('fails closed on non-access keys', () => {
    userProfileState.current = {
      is_admin: false,
      permissions: ['access.system.job'],
    } as never;
    expect(hasAccess('customer.read.all')).toBe(false);
    expect(hasAccess('access')).toBe(false);
    expect(hasAccess('not-a-key')).toBe(false);
  });

  it('bare grant covers itself and descendants', () => {
    userProfileState.current = {
      is_admin: false,
      permissions: ['access.system.job'],
    } as never;
    expect(hasAccess('access.system.job')).toBe(true);
    expect(hasAccess('access.system.job.rules')).toBe(true);
    expect(hasAccess('access.system.job.runs.new')).toBe(true);
  });

  it('page-level grant never climbs to the module ancestor', () => {
    userProfileState.current = {
      is_admin: false,
      permissions: ['access.system.job.rules'],
    } as never;
    expect(hasAccess('access.system.job')).toBe(false);
    expect(hasAccess('access.system.job.runs')).toBe(false);
    expect(hasAccess('access.system.job.rules')).toBe(true);
  });

  it('wildcards work at any level', () => {
    userProfileState.current = {
      is_admin: false,
      permissions: ['access.system.*'],
    } as never;
    expect(hasAccess('access.system.job.runs')).toBe(true);
    expect(hasAccess('access.crm.customers')).toBe(false);
  });

  it('is_admin implies access.system only — business roots stay gated', () => {
    userProfileState.current = {
      is_admin: true,
      permissions: [],
    } as never;
    expect(hasAccess('access.system.settings')).toBe(true);
    expect(hasAccess('access.system.job.rules')).toBe(true);
    expect(hasAccess('access.crm')).toBe(false);
    expect(hasAccess('access.crm.customers')).toBe(false);
  });

  it('explicit grant wins over admin even outside system', () => {
    userProfileState.current = {
      is_admin: true,
      permissions: ['access.crm'],
    } as never;
    expect(hasAccess('access.crm.customers')).toBe(true);
    expect(hasAccess('access.shop.orders')).toBe(false);
  });

  it('non-admin without grants sees nothing gated', () => {
    userProfileState.current = {
      is_admin: false,
      permissions: ['customer.read.all'],
    } as never;
    expect(hasAccess('access.system.settings')).toBe(false);
    expect(hasAccess('access.crm.customers')).toBe(false);
  });
});
