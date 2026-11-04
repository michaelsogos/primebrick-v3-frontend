/**
 * i18n fallback chain — the offline contract:
 *
 *   dict = static app.* EN floor → fetched en-GB → fetched current-lang
 *
 * - With NOTHING fetched (BE down, empty cache): app.* keys render the
 *   static EN floor; non-app keys stay raw (missing-translation detector).
 * - With a lang dict fetched: it wins per key over both EN layers.
 * - Missing lang keys covered by fetched en-GB fall back to English;
 *   keys missing everywhere stay raw.
 */

import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { dict, t, mergeModuleDict, getFallbackDict } from '../i18n';
import { uiLang } from '../i18n/store.svelte';
import { DEFAULT_LANG } from '../i18n/languages';

describe('i18n fallback chain', () => {
	it('renders the static EN floor for app.* when nothing is fetched', () => {
		uiLang.set('it-IT');
		const translate = get(t);
		// A key that exists in the generated file must render English.
		expect(translate('app.serverUnreachable')).toBe(
			'Unable to reach the server. Make sure your network connection can reach the server.',
		);
		// Non-app keys are NOT floored — they stay raw (the detector).
		expect(translate('system.entities.list.columns')).toBe('system.entities.list.columns');
	});

	it('lets the fetched lang dict win per key over the EN floor', () => {
		uiLang.set('it-IT');
		mergeModuleDict('it-IT', { 'app.retry': 'Riprova' });
		expect(get(t)('app.retry')).toBe('Riprova');
	});

	it('fills missing lang keys from the fetched en-GB layer', () => {
		uiLang.set('it-IT');
		mergeModuleDict(DEFAULT_LANG, { 'x.test.enOnly': 'EN only value' });
		expect(get(t)('x.test.enOnly')).toBe('EN only value');
	});

	it('keeps raw keys for keys missing in every layer', () => {
		uiLang.set('it-IT');
		expect(get(t)('totally.missing.key')).toBe('totally.missing.key');
	});

	it('en-GB uiLang also sees the static floor offline', () => {
		uiLang.set(DEFAULT_LANG);
		const translate = get(t);
		expect(translate('app.serverUnreachable')).not.toBe('app.serverUnreachable');
	});

	it('fallback dict exposes the full generated app.* surface', () => {
		const fallback = getFallbackDict();
		expect(Object.keys(fallback).length).toBeGreaterThan(500);
		expect(Object.keys(fallback).every((k) => k.startsWith('app.'))).toBe(true);
	});
});
