import { describe, it, expect, beforeEach } from 'vitest';
import {
  addPendingTranslation,
  dropPendingTranslation,
  hasPendingTranslation,
  takePendingTranslations,
  pendingTranslationCount,
  clearPendingTranslations,
} from '$lib/i18n/pending-translations.svelte';

const A = 'page-a';
const B = 'page-b';

describe('pending-translations queue', () => {
  beforeEach(() => {
    clearPendingTranslations(A);
    clearPendingTranslations(B);
  });

  it('queues rows and drains them into {key,language,value}[]', () => {
    addPendingTranslation(A, 'custom.config.a.errors.min', {
      'en-GB': { value: 'Too short' },
      'it-IT': { value: 'Troppo corto' },
    });
    expect(pendingTranslationCount(A)).toBe(2);
    const rows = takePendingTranslations(A);
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({ key: 'custom.config.a.errors.min', language: 'en-GB', value: 'Too short' });
    expect(pendingTranslationCount(A)).toBe(0);
  });

  it('carries uuid+version through to the drained row (update CAS identity)', () => {
    addPendingTranslation(A, 'crm.entities.customer_type.rows.private', {
      'it-IT': { value: 'Privato', uuid: 'u-1', version: 3 },
    });
    const rows = takePendingTranslations(A);
    expect(rows).toContainEqual({
      key: 'crm.entities.customer_type.rows.private',
      language: 'it-IT',
      value: 'Privato',
      uuid: 'u-1',
      version: 3,
    });
  });

  it('merges languages on repeated adds, later value wins', () => {
    addPendingTranslation(A, 'k', { 'en-GB': { value: 'a' } });
    addPendingTranslation(A, 'k', { 'en-GB': { value: 'b' }, 'it-IT': { value: 'c' } });
    const rows = takePendingTranslations(A);
    expect(rows).toContainEqual({ key: 'k', language: 'en-GB', value: 'b' });
    expect(rows).toContainEqual({ key: 'k', language: 'it-IT', value: 'c' });
  });

  it('owner isolation — draining A never touches B', () => {
    addPendingTranslation(A, 'k-a', { 'en-GB': { value: 'a' } });
    addPendingTranslation(B, 'k-b', { 'en-GB': { value: 'b' } });
    const rowsA = takePendingTranslations(A);
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0].key).toBe('k-a');
    expect(hasPendingTranslation(B, 'k-b')).toBe(true);
    expect(takePendingTranslations(B)).toHaveLength(1);
  });

  it('same key under two owners stays independent', () => {
    addPendingTranslation(A, 'k', { 'en-GB': { value: 'from-a' } });
    addPendingTranslation(B, 'k', { 'en-GB': { value: 'from-b' } });
    expect(takePendingTranslations(A)).toContainEqual({ key: 'k', language: 'en-GB', value: 'from-a' });
    expect(takePendingTranslations(B)).toContainEqual({ key: 'k', language: 'en-GB', value: 'from-b' });
  });

  it('drop removes a single key', () => {
    addPendingTranslation(A, 'k1', { 'en-GB': { value: 'a' } });
    addPendingTranslation(A, 'k2', { 'en-GB': { value: 'b' } });
    dropPendingTranslation(A, 'k1');
    expect(hasPendingTranslation(A, 'k1')).toBe(false);
    expect(hasPendingTranslation(A, 'k2')).toBe(true);
  });

  it('clear empties only that owner (page destroy / cancel)', () => {
    addPendingTranslation(A, 'k', { 'en-GB': { value: 'a' } });
    addPendingTranslation(B, 'k', { 'en-GB': { value: 'b' } });
    clearPendingTranslations(A);
    expect(takePendingTranslations(A)).toEqual([]);
    expect(takePendingTranslations(B)).toHaveLength(1);
  });

  it('pendingTranslationCount() without owner counts all owners', () => {
    addPendingTranslation(A, 'k', { 'en-GB': { value: 'a' } });
    addPendingTranslation(B, 'k', { 'en-GB': { value: 'b' } });
    expect(pendingTranslationCount()).toBe(2);
  });
});
