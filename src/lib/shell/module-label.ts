/**
 * The module's localized display name — the single source of truth for
 * EVERY surface that renders a module/service name: breadcrumbs, app
 * launcher columns, module menus, sidebars.
 *
 * Resolves the registry-declared `label_key` against the loaded
 * dictionaries (the module owns the key in its own translation
 * namespace, e.g. `system.settings.title` → "Impostazioni"). Falls back
 * to the raw registry `name` when `label_key` is absent or the key is
 * unresolved — `$t` echoes the key itself on a miss, so the comparison
 * `resolved === key` detects the miss without guessing.
 */
export function resolveModuleLabel(
	module: { name?: string; label_key?: string } | undefined,
	t: (key: string) => string
): string {
	if (!module) return '';
	if (!module.label_key) return module.name ?? '';
	const resolved = t(module.label_key);
	return resolved === module.label_key ? (module.name ?? '') : resolved;
}
