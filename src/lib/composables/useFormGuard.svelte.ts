/**
 * useFormGuard — composable that derives `hasChanges` and `canSave` from a
 * SuperForm object, consolidating the identical logic duplicated across all
 * 5 settings form pages.
 *
 * Store auto-subscription (`$tainted`, `$errors`) only works in `.svelte`
 * files, not in `.svelte.ts` files. Therefore the caller passes reactive
 * getters that read the stores via `$` prefix in the .svelte file.
 *
 * Follows the composable state exposure pattern from AGENTS.md:
 *   - $derived values exposed via individual getters
 */
export function useFormGuard(
  tainted: () => Record<string, unknown> | undefined,
  errors: () => Record<string, unknown>,
  isTainted: (path?: unknown) => boolean,
) {
  const hasChanges = $derived(isTainted(tainted()));

  const canSave = $derived.by(() => {
    if (!hasChanges) return false;
    const errorsValue = errors() as Record<string, unknown>;
    for (const key in errorsValue) {
      const err = errorsValue[key];
      if (err && (Array.isArray(err) ? err.length > 0 : true)) return false;
    }
    return true;
  });

  return {
    get hasChanges() {
      return hasChanges;
    },
    get canSave() {
      return canSave;
    },
  };
}
