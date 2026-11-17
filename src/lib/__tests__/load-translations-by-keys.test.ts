/**
 * loadTranslationsByKeys — the findTranslations consumer contract:
 *
 * - Callers pass the exact keys (or `ns.*` prefixes) they are about to
 *   render; ONE governed call fetches every language's rows and the
 *   en-GB floor layers in for free (dict = floor → en-GB → current lang).
 * - The matches-signature dedups for the loader TTL — repeat calls with
 *   the same key set do not refetch.
 * - Sets beyond the BE's ≤64-matches wire bound are chunked.
 * - A failed fetch never throws: labels degrade to raw keys and the
 *   failure surfaces as a non-blocking notification.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const fetchTranslationsFind = vi.fn();
const pushNotification = vi.fn();

vi.mock('$lib/api', () => ({
  fetchTranslationsFind: (...args: unknown[]) => fetchTranslationsFind(...args),
  fetchModuleTranslations: vi.fn(),
  fetchPublicTranslations: vi.fn(),
}));
vi.mock('$lib/errors/app-errors', () => ({
  pushNotification: (...args: unknown[]) => pushNotification(...args),
}));
vi.mock('$lib/app-connectivity-events', () => ({ onConnectivityRestored: () => () => {} }));
vi.mock('$lib/shell/modules-shell.svelte', () => ({
  shellNav: { resolveDictModuleFromRoute: () => null },
}));

import { loadTranslationsByKeys } from '../i18n/use-module-translations.svelte';
import { t } from '../i18n';
import { uiLang } from '../i18n/store.svelte';

const row = (key: string, language: string, value: string) => ({
  uuid: `u-${key}-${language}`,
  key,
  language,
  value,
  module: key.split('.')[0],
});

describe('loadTranslationsByKeys', () => {
  beforeEach(() => {
    fetchTranslationsFind.mockReset();
    pushNotification.mockReset();
    uiLang.set('en-GB');
  });

  it('fetches the cited keys once and merges rows into the dict by language', async () => {
    fetchTranslationsFind.mockResolvedValue([
      row('job.module.name', 'en-GB', 'Process Management'),
      row('job.module.name', 'it-IT', 'Gestione Processi'),
    ]);
    await loadTranslationsByKeys(['job.module.name']);
    expect(fetchTranslationsFind).toHaveBeenCalledTimes(1);
    expect(fetchTranslationsFind).toHaveBeenCalledWith(['job.module.name']);
    expect(get(t)('job.module.name')).toBe('Process Management');
  });

  it('lets the current-language row win over the en-GB floor', async () => {
    uiLang.set('it-IT');
    fetchTranslationsFind.mockResolvedValue([
      row('ai.module.name', 'en-GB', 'AI Assistants Management'),
      row('ai.module.name', 'it-IT', 'Gestione Assistenti AI'),
    ]);
    await loadTranslationsByKeys(['ai.module.name']);
    expect(get(t)('ai.module.name')).toBe('Gestione Assistenti AI');
    uiLang.set('en-GB');
    expect(get(t)('ai.module.name')).toBe('AI Assistants Management');
  });

  it('dedups the matches signature — repeat calls do not refetch', async () => {
    fetchTranslationsFind.mockResolvedValue([row('crm.module.name', 'en-GB', 'CRM')]);
    await loadTranslationsByKeys(['crm.module.name', 'crm.module.name', 'crm.module.name']);
    await loadTranslationsByKeys(['crm.module.name']);
    expect(fetchTranslationsFind).toHaveBeenCalledTimes(1);
    expect(fetchTranslationsFind).toHaveBeenCalledWith(['crm.module.name']);
  });

  it('chunks match sets beyond the 64-matcher wire bound', async () => {
    const matches = Array.from({ length: 65 }, (_, i) => `job.settings.config.k${i}.label`);
    fetchTranslationsFind.mockResolvedValue([]);
    await loadTranslationsByKeys(matches);
    expect(fetchTranslationsFind).toHaveBeenCalledTimes(2);
    expect(fetchTranslationsFind.mock.calls[0]![0]).toHaveLength(64);
    expect(fetchTranslationsFind.mock.calls[1]![0]).toHaveLength(1);
  });

  it('does not refetch the same signature until the TTL expires', async () => {
    fetchTranslationsFind.mockResolvedValue([]);
    await loadTranslationsByKeys(['webhook.settings.config.a.label']);
    await loadTranslationsByKeys(['webhook.settings.config.a.label']);
    expect(fetchTranslationsFind).toHaveBeenCalledTimes(1);
  });

  it('swallows fetch failures — notification fired, labels stay raw', async () => {
    fetchTranslationsFind.mockRejectedValue(new Error('boom'));
    await expect(loadTranslationsByKeys(['emailsender.module.name'])).resolves.toBeUndefined();
    expect(pushNotification).toHaveBeenCalledTimes(1);
    expect(pushNotification.mock.calls[0]![0]).toMatchObject({ impact: 'MEDIUM', scope: 'i18n' });
    expect(get(t)('emailsender.module.name')).toBe('emailsender.module.name');
    // The failure is deduped too — no hammering on the next call.
    await loadTranslationsByKeys(['emailsender.module.name']);
    expect(fetchTranslationsFind).toHaveBeenCalledTimes(1);
  });

  it('no-ops on an empty matcher set', async () => {
    await loadTranslationsByKeys([]);
    await loadTranslationsByKeys(['', '']);
    expect(fetchTranslationsFind).not.toHaveBeenCalled();
  });
});
