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

  const hasRealError = (v: unknown): boolean => {
    if (v === undefined || v === null || v === '') return false;
    if (Array.isArray(v)) return v.some(hasRealError);
    if (typeof v === 'object') return Object.values(v).some(hasRealError);
    return true;
  };

  const canSave = $derived.by(() => {
    if (!hasChanges) return false;
    const errorsValue = errors() as Record<string, unknown>;
    for (const key in errorsValue) {
      // Array/object fields produce nested error containers — a node whose
      // leaves are all empty (e.g. roles:{} after the last error cleared)
      // carries no real error.
      if (hasRealError(errorsValue[key])) return false;
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
