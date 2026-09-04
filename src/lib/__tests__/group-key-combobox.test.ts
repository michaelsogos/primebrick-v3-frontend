import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { minMsg, maxMsg } from '$lib/validation/zod-messages';
import { flattenDictKeys } from '$lib/i18n';

// ─── flattenDictKeys utility ───────────────────────────────────────────

describe('flattenDictKeys', () => {
  it('flattens a simple flat dict', () => {
    const dict = { a: '1', b: '2' };
    expect(flattenDictKeys(dict).sort()).toEqual(['a', 'b']);
  });

  it('flattens nested objects into dot paths', () => {
    const dict = {
      config: {
        auth: {
          idp_endpoint: {
            label: 'IDP Endpoint',
            description: 'The base URL',
          },
        },
      },
    };
    expect(flattenDictKeys(dict).sort()).toEqual([
      'config.auth.idp_endpoint.description',
      'config.auth.idp_endpoint.label',
    ]);
  });

  it('skips non-string leaf values (objects, arrays, numbers)', () => {
    const dict = {
      a: 'string',
      b: { c: 'nested' },
      d: 42,
      e: true,
      f: [1, 2],
    };
    expect(flattenDictKeys(dict).sort()).toEqual(['a', 'b.c']);
  });

  it('handles empty object', () => {
    expect(flattenDictKeys({})).toEqual([]);
  });

  it('handles deeply nested structures', () => {
    const dict = {
      a: { b: { c: { d: { e: 'deep' } } } },
    };
    expect(flattenDictKeys(dict)).toEqual(['a.b.c.d.e']);
  });

  it('uses prefix parameter correctly', () => {
    const dict = { label: 'test' };
    expect(flattenDictKeys(dict, 'config.auth.my_key')).toEqual([
      'config.auth.my_key.label',
    ]);
  });

  it('filters to config.auth.*.label keys from a realistic dict', () => {
    const dict = {
      config: {
        auth: {
          idp_endpoint: {
            label: 'IDP Endpoint',
            description: 'The base URL',
            errors: { required: 'Required' },
          },
          oidc_issuer_url: {
            label: 'OIDC Issuer URL',
            description: 'The issuer URL',
          },
        },
      },
    };
    const allKeys = flattenDictKeys(dict);
    const labelKeys = allKeys.filter(
      (k) => k.startsWith('config.auth.') && k.endsWith('.label'),
    );
    expect(labelKeys.sort()).toEqual([
      'config.auth.idp_endpoint.label',
      'config.auth.oidc_issuer_url.label',
    ]);
  });
});

// ─── Zod validation for group_key ──────────────────────────────────────

// Mirror of the schema in the create page (allows empty string — group is optional)
const groupKeySchema = z.string()
  .max(100, { message: maxMsg(100) })
  .regex(/^$|^[a-z][a-z0-9_]*$/, { message: 'validation.invalidFormat' })
  .default('');

describe('group_key Zod validation', () => {
  it('accepts empty string (group is optional)', () => {
    const result = groupKeySchema.safeParse('');
    expect(result.success).toBe(true);
  });

  it('accepts valid snake_case group key', () => {
    expect(groupKeySchema.safeParse('idp_parameters').success).toBe(true);
    expect(groupKeySchema.safeParse('security_parameters').success).toBe(true);
    expect(groupKeySchema.safeParse('my_group').success).toBe(true);
    expect(groupKeySchema.safeParse('a').success).toBe(true);
    expect(groupKeySchema.safeParse('a1_b2_c3').success).toBe(true);
  });

  it('rejects uppercase letters', () => {
    expect(groupKeySchema.safeParse('MyGroup').success).toBe(false);
    expect(groupKeySchema.safeParse('IDP_Parameters').success).toBe(false);
  });

  it('rejects starting with a digit', () => {
    expect(groupKeySchema.safeParse('1group').success).toBe(false);
    expect(groupKeySchema.safeParse('2_things').success).toBe(false);
  });

  it('rejects starting with underscore', () => {
    expect(groupKeySchema.safeParse('_group').success).toBe(false);
  });

  it('rejects spaces', () => {
    expect(groupKeySchema.safeParse('my group').success).toBe(false);
    expect(groupKeySchema.safeParse('a b').success).toBe(false);
  });

  it('rejects hyphens', () => {
    expect(groupKeySchema.safeParse('my-group').success).toBe(false);
  });

  it('rejects dots (not a full i18n path)', () => {
    expect(groupKeySchema.safeParse('config.auth.group').success).toBe(false);
  });

  it('rejects strings longer than 100 chars', () => {
    const long = 'a'.repeat(101);
    expect(groupKeySchema.safeParse(long).success).toBe(false);
  });

  it('accepts strings of exactly 100 chars', () => {
    const exact = 'a'.repeat(100);
    expect(groupKeySchema.safeParse(exact).success).toBe(true);
  });
});

// ─── useExistingGroupKeys composable ───────────────────────────────────

// Top-level mock: onMount calls the callback immediately
vi.mock('svelte', async (importOriginal) => {
  const actual = await importOriginal<typeof import('svelte')>();
  return {
    ...actual,
    onMount: (cb: () => void | Promise<void>) => { cb(); },
  };
});

// Top-level mock: apiFetch is a controllable mock function
const mockApiFetch = vi.fn();
vi.mock('$lib/api', () => ({
  apiFetch: mockApiFetch,
}));

describe('useExistingGroupKeys composable', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  async function loadComposable() {
    const mod = await import('$lib/composables/useExistingGroupKeys.svelte');
    return mod.useExistingGroupKeys();
  }

  it('extracts unique group_keys from API response', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        rows: [
          { group_key: 'idp_parameters' },
          { group_key: 'security_parameters' },
          { group_key: 'idp_parameters' }, // duplicate
          { group_key: 'system_settings' },
          { group_key: null },             // null — skipped
          { group_key: '' },               // empty — skipped
          { group_key: '  ' },             // whitespace — skipped
          { group_key: 'advanced_features' },
        ],
      }),
    });

    const c = await loadComposable();
    await new Promise((r) => setTimeout(r, 0));

    expect(c.groupKeys).toEqual([
      'advanced_features',
      'idp_parameters',
      'security_parameters',
      'system_settings',
    ]);
    expect(c.loading).toBe(false);
  });

  it('handles API failure gracefully — empty list, not loading', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));

    const c = await loadComposable();
    await new Promise((r) => setTimeout(r, 0));

    expect(c.groupKeys).toEqual([]);
    expect(c.loading).toBe(false);
  });

  it('handles non-ok response — empty list, not loading', async () => {
    mockApiFetch.mockResolvedValue({ ok: false, json: async () => ({}) });

    const c = await loadComposable();
    await new Promise((r) => setTimeout(r, 0));

    expect(c.groupKeys).toEqual([]);
    expect(c.loading).toBe(false);
  });

  it('updates groupKeys after a delayed fetch resolution', async () => {
    let resolveJson: (v: unknown) => void = () => {};
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => new Promise((resolve) => { resolveJson = resolve; }),
    });

    const c = await loadComposable();
    // Allow the apiFetch promise to resolve (json() is still pending)
    await new Promise((r) => setTimeout(r, 0));

    // Resolve the json() promise
    resolveJson({ rows: [{ group_key: 'test_group' }] });
    await new Promise((r) => setTimeout(r, 0));

    expect(c.loading).toBe(false);
    expect(c.groupKeys).toEqual(['test_group']);
  });

  it('trims whitespace from group_key values', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        rows: [
          { group_key: '  idp_parameters  ' },
          { group_key: 'security_parameters' },
        ],
      }),
    });

    const c = await loadComposable();
    await new Promise((r) => setTimeout(r, 0));

    expect(c.groupKeys).toEqual(['idp_parameters', 'security_parameters']);
  });

  it('exposes state as DeepReadonly', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ rows: [{ group_key: 'test' }] }),
    });

    const c = await loadComposable();
    await new Promise((r) => setTimeout(r, 0));

    expect(c.state.groupKeys).toEqual(['test']);
    expect(c.state.loading).toBe(false);
  });
});
