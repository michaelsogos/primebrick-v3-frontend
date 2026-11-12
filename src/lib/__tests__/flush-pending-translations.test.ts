import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('$lib/api', () => ({
  createTranslation: vi.fn(async () => ({})),
  updateTranslation: vi.fn(async () => ({})),
}));

import { createTranslation, updateTranslation } from '$lib/api';
import {
  addPendingTranslation,
  takePendingTranslations,
  pendingTranslationCount,
  clearPendingTranslations,
} from '$lib/i18n/pending-translations.svelte';
import { flushPendingTranslations } from '$lib/i18n/flush-pending-translations';

const OWNER = 'owner-a';
const OTHER = 'owner-b';

describe('flushPendingTranslations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPendingTranslations(OWNER);
    clearPendingTranslations(OTHER);
  });

  it('drains only the given owner and splits create vs update', async () => {
    addPendingTranslation(OWNER, 'custom.entities.t.rows.a', {
      'en-GB': { value: 'new' },
      'it-IT': { value: 'upd', uuid: 'u-1', version: 4 },
    });
    addPendingTranslation(OTHER, 'custom.entities.t.rows.b', { 'en-GB': { value: 'other' } });

    const failed = await flushPendingTranslations(OWNER);

    expect(failed).toEqual([]);
    // create path — POST on the key's module prefix.
    expect(createTranslation).toHaveBeenCalledWith('custom', {
      key: 'custom.entities.t.rows.a',
      language: 'en-GB',
      value: 'new',
    });
    // update path — PUT with uuid + observed version (CAS).
    expect(updateTranslation).toHaveBeenCalledWith('custom', 'u-1', {
      value: 'upd',
      version: 4,
    });
    // The other owner is untouched.
    expect(pendingTranslationCount(OTHER)).toBe(1);
    expect(pendingTranslationCount(OWNER)).toBe(0);
  });

  it('requeues failed rows and returns them — nothing silently dropped', async () => {
    vi.mocked(updateTranslation).mockRejectedValueOnce(
      Object.assign(new Error('conflict'), { status: 409 }),
    );
    addPendingTranslation(OWNER, 'custom.entities.t.rows.a', {
      'en-GB': { value: 'new' },
      'it-IT': { value: 'upd', uuid: 'u-1', version: 4 },
    });

    const failed = await flushPendingTranslations(OWNER);

    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ uuid: 'u-1', version: 4 });
    // The failed row went back into the queue — user text preserved.
    const requeued = takePendingTranslations(OWNER);
    expect(requeued).toContainEqual({
      key: 'custom.entities.t.rows.a',
      language: 'it-IT',
      value: 'upd',
      uuid: 'u-1',
      version: 4,
    });
  });

  it('empty owner — no calls, no error', async () => {
    expect(await flushPendingTranslations(OWNER)).toEqual([]);
    expect(createTranslation).not.toHaveBeenCalled();
    expect(updateTranslation).not.toHaveBeenCalled();
  });
});
