/**
 * Step 2 (Record<string, any> → unknown) — behavioral contracts pinned by the
 * typing fixes:
 *
 * - `pushNotification` accepts a PLAIN RFC7807Error (public signature widened;
 *   normalization is internal) and maps severity/detail/title/extras correctly.
 * - `numOr` narrows exec_config values to finite numbers only.
 * - `tryParseJsonObject` (extracted from VersionHistoryPanel) detects JSON
 *   object values for delta rendering.
 * - `buildAuditData` three-path contract (create shell / entity / not-loaded).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get, writable } from 'svelte/store';

const mocks = vi.hoisted(() => ({
  toast: {
    critical: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    custom: vi.fn(),
  },
}));

vi.mock('$lib/errors/toast', () => ({ toast: mocks.toast }));
vi.mock('$lib/i18n', () => ({ t: writable((key: string) => key) }));

import { appErrors, clearAppErrors, pushNotification } from '$lib/errors/app-errors';
import { numOr } from '$lib/components/ui/smart-guide/guide-loop';
import { tryParseJsonObject } from '$lib/utils/json-object';
import { buildAuditData } from '$lib/utils/audit-data';

beforeEach(() => {
  clearAppErrors();
  Object.values(mocks.toast).forEach((fn) => fn.mockClear());
});

describe('pushNotification — plain RFC7807Error acceptance', () => {
  it('normalizes a bare RFC7807 error into the errors panel', () => {
    pushNotification({
      type: 'https://primebrick.dev/errors/validation',
      title: 'Validation failed',
      status: 422,
      detail: 'field X is required',
      internal_code: 'FIELD_REQUIRED',
      instance: '/api/v1/entities/user_profile',
    });

    const errs = get(appErrors);
    expect(errs).toHaveLength(1);
    const e = errs[0];
    expect(e.message).toBe('field X is required');
    expect(e.scope).toBe('Validation failed');
    expect(e.impact).toBe('HIGH'); // no severity → default HIGH
    const labels = e.tags?.map((t) => t.label) ?? [];
    expect(labels).toContain('FIELD_REQUIRED');
    expect(labels).toContain('HTTP 422');
    expect(labels).toContain('/api/v1/entities/user_profile');
    // Standard RFC7807 fields must NOT leak into extras
    expect(e.detail_field).toBeUndefined();
    expect('status' in e).toBe(false);
  });

  it('preserves RFC7807 extra fields as AppError extras', () => {
    pushNotification({
      type: 'https://primebrick.dev/errors/conflict',
      title: 'Conflict',
      status: 409,
      detail: 'version mismatch',
      severity: 'CRITICAL',
      entity: 'user_profile',
      expected_version: 7,
    } as Parameters<typeof pushNotification>[0]);

    const e = get(appErrors)[0];
    expect(e.impact).toBe('CRITICAL');
    expect(e.entity).toBe('user_profile');
    expect(e.expected_version).toBe(7);
  });

  it('severity NONE produces a toast but no errors-panel card', () => {
    pushNotification({
      type: 'https://primebrick.dev/errors/ok',
      title: 'Done',
      status: 200,
      detail: 'all good',
      severity: 'NONE',
    });
    expect(get(appErrors)).toHaveLength(0);
    expect(mocks.toast.success).toHaveBeenCalled();
  });

  it('still accepts plain NotificationInput params', () => {
    pushNotification({ impact: 'LOW', message: 'plain', scope: 'test' });
    const e = get(appErrors)[0];
    expect(e.impact).toBe('LOW');
    expect(e.message).toBe('plain');
  });
});

describe('numOr — exec_config numeric narrowing', () => {
  it.each([
    [0.5, 0.5],
    [0, 0],
    [-3, -3],
  ])('keeps finite number %s', (input, expected) => {
    expect(numOr(input)).toBe(expected);
  });

  it.each([
    ['0.5'],
    [NaN],
    [Infinity],
    [-Infinity],
    [null],
    [undefined],
    [{}],
    [[1]],
    [true],
  ])('rejects non-finite/non-number %s', (input) => {
    expect(numOr(input)).toBeUndefined();
  });
});

describe('tryParseJsonObject — JSON-object detection', () => {
  it('returns plain objects as-is (pg jsonb path)', () => {
    const obj = { a: 1 };
    expect(tryParseJsonObject(obj)).toBe(obj);
  });

  it('parses JSON object strings', () => {
    expect(tryParseJsonObject('{"x": 1}')).toEqual({ x: 1 });
    expect(tryParseJsonObject('  {"x": 1}  ')).toEqual({ x: 1 });
  });

  it.each([
    [null], [undefined], [42], [true],
    ['[1,2]'], ['"str"'], ['42'], ['{bad json'],
    [[1, 2]], // arrays rejected — rendered by formatValue
  ])('rejects %s', (input) => {
    expect(tryParseJsonObject(input)).toBeUndefined();
  });
});

describe('buildAuditData — three-path contract', () => {
  it('no-arg call returns the create-page shell', () => {
    const d = buildAuditData();
    expect(d.uuid).toBe('');
    expect(d.version).toBe(0);
    expect('created_at' in d).toBe(true);
  });

  it('entity maps the standard audit fields', () => {
    const d = buildAuditData({ uuid: 'u1', version: 3, created_by_name: 'Ann' });
    expect(d.uuid).toBe('u1');
    expect(d.version).toBe(3);
    expect(d.created_by_name).toBe('Ann');
  });

  it('null/undefined entity returns the empty object (loading state)', () => {
    expect(buildAuditData(null)).toEqual({});
    expect(buildAuditData(undefined)).toEqual({});
  });
});
