/**
 * i18n-key-options — the ONE vocabulary for every translation-key
 * ComboSelect in the app (dict rows, config builders, entity form
 * `format:"i18n_key"` columns). Each surface only narrows the key family:
 * entity row keys keep the `.entities.<tk>.rows.` scope, auth-config keys
 * keep `system.settings.config.auth.` — the option anatomy is shared.
 *
 * Option shape mirrors the governed convention (`{key}` with `valueField/
 * labelField="key"`, `isLabelTranslated`, `allowCreate`, `defaultSearch`
 * carrying the surface's own suggestion formula).
 */

/** Canonical icon for i18n-key options — `languages` in `sky-500`, same
 *  pairing the auth-config ComboSelects already use. */
export const I18N_KEY_OPTION_ICON = "languages";
export const I18N_KEY_OPTION_COLOR = "sky-500";

export interface I18nKeyOption extends Record<string, unknown> {
	key: string;
	_icon: string;
	_icon_color: string;
}

export interface I18nKeyFilter {
	/** Substring the key must contain — entity row vocabulary uses
	 *  `.entities.<translation_key>.rows.`. */
	contains?: string;
	/** Prefix the key must start with — e.g. `system.settings.config.auth.`. */
	prefix?: string;
	/** Suffix the key must end with — e.g. `.label` / `.description`. */
	suffix?: string;
}

export function i18nKeyOptions(
	dict: Record<string, unknown>,
	filter: I18nKeyFilter = {},
	/** Keys merged in unconditionally (e.g. the bound value so a stored
	 *  non-vocabulary key stays selectable — the suggestion is excluded by
	 *  the caller since it renders as the created-value chip). */
	extra: readonly string[] = [],
): I18nKeyOption[] {
	const keys = new Set(
		Object.keys(dict)
			.filter(
				(k) =>
					(!filter.contains || k.includes(filter.contains)) &&
					(!filter.prefix || k.startsWith(filter.prefix)) &&
					(!filter.suffix || k.endsWith(filter.suffix)),
			)
			.concat(extra),
	);
	return [...keys]
		.sort()
		.map((k) => ({ key: k, _icon: I18N_KEY_OPTION_ICON, _icon_color: I18N_KEY_OPTION_COLOR }));
}

/** Shared `system.settings.config.auth.<configKey>.` prefix — both the
 *  configurations/create ComboSelects and the badge-value suggestion scope
 *  their keys under it; the `my_custom_setting` placeholder matches the
 *  surfaces' empty-key fallback. */
export function authConfigKeyPrefix(configKey: string): string {
	return `system.settings.config.auth.${configKey.trim() || "my_custom_setting"}.`;
}

const NAMESPACED_ENTITIES_KEY = /^[a-z_]+\.entities\./;

/**
 * The ONE commit coercion for translation-key picks — a fully namespaced
 * `*.entities.*` key (existing option or typed full key) passes verbatim:
 * selecting an existing key selects IT, never rewrites it. A namespace-
 * less `entities.<tk>.rows.<leaf>` (the defaultSearch seed / Create offer)
 * scopes under `custom.*` — the only user-writable namespace. Free text
 * becomes the `custom.<scope><slug>` convention key. `rowsScope` carries
 * the family — `entities.<tk>.rows.` for row labels, `entities.` broad
 * when the translation_key is unknown.
 */
export function coerceI18nKeyChange(
	raw: string,
	rowsScope: string,
	slugify: (text: string) => string,
): string {
	const trimmed = raw.trim();
	if (!trimmed) return "";
	if (NAMESPACED_ENTITIES_KEY.test(trimmed)) return trimmed;
	if (trimmed.startsWith("entities.")) return `custom.${trimmed}`;
	const slug = slugify(trimmed);
	return slug ? `custom.${rowsScope}${slug}` : trimmed;
}
