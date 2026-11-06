/**
 * useCensusSubjectOptions — the ONE derivation of census subject
 * vocabularies from the module census. Consumed by every surface that
 * resolves `options_source` columns: the entity form today, the filter
 * panel next — never two copies of the mapping.
 *
 * `options_source:"census.emits"` → union of every module's
 * `events.emits`; `"census.callables"` → union of `callables.callables`.
 * Both render as the 3-line `display="detailed"` ComboSelect anatomy —
 * translated display name on the label line, italic description
 * underneath, raw subject last — behind a fixed archetype icon
 * (`zap` amber = an event that HAPPENED; `send` sky = a destination
 * you invoke).
 *
 * The composable also owns the contributor-dict side effect: a
 * callable/emit's `label_key`/`description_key` resolves in the
 * DECLARING module's namespace, which the route-aware loader never
 * fetches on a foreign module's page — every contributor's dict is
 * loaded best-effort so options never degrade to raw keys while the
 * contributor is reachable.
 */
import { fromStore } from 'svelte/store';
import type { CallableDecl, EmitDecl } from '@primebrick/ui';
import type { ModuleInfo } from '$lib/api';
import { t } from '$lib/i18n';
import { uiLang } from '$lib/i18n/store.svelte';
import { loadModuleTranslations } from '$lib/i18n/use-module-translations.svelte';

/** Detailed ComboSelect option for a census subject — the shape
 *  `display="detailed"` consumers render (`_desc` italic line, `_sub`
 *  raw-subject line, left icon). */
export type CensusSubjectOption = {
	value: string;
	label: string;
	_desc: string;
	_sub: string;
	_icon: string;
	_icon_color: string;
};

export interface CensusSubjectOptionsApi {
	readonly emitsOptions: CensusSubjectOption[];
	readonly callablesOptions: CensusSubjectOption[];
	/** Raw decls — `payload_map` reads the selected callable's
	 *  `payload_schema`/`permissions` and the event's payload schema;
	 *  option rows alone don't carry the contract. */
	readonly callableDecls: CallableDecl[];
	readonly emitDecls: EmitDecl[];
}

export function useCensusSubjectOptions(modules: () => ModuleInfo[]): CensusSubjectOptionsApi {
	// `fromStore` keeps the reads reactive — option labels re-translate on
	// language switch exactly like the `$t` auto-subscription did in the
	// component.
	const tr = fromStore(t);
	const lang = fromStore(uiLang);

	const emitDecls = $derived(modules().flatMap((m) => m.events?.emits ?? []));
	const callableDecls = $derived(modules().flatMap((m) => m.callables?.callables ?? []));

	const emitsOptions = $derived(
		emitDecls.map((e) => ({
			value: e.subject,
			label: e.label_key ? tr.current(e.label_key) : e.subject,
			_desc: e.description_key ? tr.current(e.description_key) : '',
			_sub: e.subject,
			_icon: 'zap',
			_icon_color: 'amber-500',
		})),
	);
	const callablesOptions = $derived(
		callableDecls.map((c) => ({
			value: c.subject,
			label: c.label_key ? tr.current(c.label_key) : c.subject,
			_desc: c.description_key ? tr.current(c.description_key) : '',
			_sub: c.subject,
			_icon: 'send',
			_icon_color: 'sky-500',
		})),
	);

	const censusContributors = $derived(
		new Set(
			modules()
				.filter((m) => (m.callables?.callables?.length ?? 0) > 0 || (m.events?.emits?.length ?? 0) > 0)
				.map((m) => m.id),
		),
	);
	$effect(() => {
		for (const code of censusContributors)
			void loadModuleTranslations(code, lang.current, { bestEffort: true });
	});

	return {
		get emitsOptions() {
			return emitsOptions;
		},
		get callablesOptions() {
			return callablesOptions;
		},
		get callableDecls() {
			return callableDecls;
		},
		get emitDecls() {
			return emitDecls;
		},
	};
}
