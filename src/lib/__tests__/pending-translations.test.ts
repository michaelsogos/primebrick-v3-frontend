import { describe, it, expect, beforeEach } from 'vitest';
import {
  addPendingTranslation,
  dropPendingTranslation,
  hasPendingTranslation,
  takePendingTranslations,
  pendingTranslationCount,
  clearPendingTranslations,
} from '$lib/i18n/pending-translations.svelte';

describe('pending-translations queue', () => {
  beforeEach(() => clearPendingTranslations());

  it('queues rows and drains them into {key,language,value}[]', () => {
    addPendingTranslation('custom.config.a.errors.min', { 'en-GB': 'Too short', 'it-IT': 'Troppo corto' });
    expect(pendingTranslationCount()).toBe(2);
    const rows = takePendingTranslations();
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({ key: 'custom.config.a.errors.min', language: 'en-GB', value: 'Too short' });
    expect(pendingTranslationCount()).toBe(0);
  });

  it('merges languages on repeated adds, later value wins', () => {
    addPendingTranslation('k', { 'en-GB': 'a' });
    addPendingTranslation('k', { 'en-GB': 'b', 'it-IT': 'c' });
    const rows = takePendingTranslations();
    expect(rows).toContainEqual({ key: 'k', language: 'en-GB', value: 'b' });
    expect(rows).toContainEqual({ key: 'k', language: 'it-IT', value: 'c' });
  });

  it('drop removes a single key', () => {
    addPendingTranslation('k1', { 'en-GB': 'a' });
    addPendingTranslation('k2', { 'en-GB': 'b' });
    dropPendingTranslation('k1');
    expect(hasPendingTranslation('k1')).toBe(false);
    expect(hasPendingTranslation('k2')).toBe(true);
  });

  it('clear empties the queue (page destroy / cancel)', () => {
    addPendingTranslation('k', { 'en-GB': 'a' });
    clearPendingTranslations();
    expect(takePendingTranslations()).toEqual([]);
  });
});
