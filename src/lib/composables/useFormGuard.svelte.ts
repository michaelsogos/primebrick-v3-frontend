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

/**
 * useForceFormValidation — keeps `$errors` fresh on every change so
 * `useFormGuard.canSave` (hasChanges && no errors) is truthful.
 *
 * Superforms only lists errors for fields it has already validated, and
 * untouched fields never emit events — on a CREATE form a required input
 * the user never focused would carry no error, so `hasChanges` alone
 * would unlock Save on an invalid form. Wiring the returned handler as
 * `onChange` forces a full-form `validateForm({ update: true })` on every
 * change (force=true bypasses the taint display checks), making errors
 * — and therefore canSave — always current. Pair with
 * `validationMethod: 'oninput'`.
 *
 * Debounced trailing-edge (250ms): `validateForm` internally calls
 * `Form.set(result.data)` with data captured at validation start —
 * overlapping validations resolving out of order would overwrite typed
 * input. One trailing validation per typing burst avoids the race.
 * Timer cleanup is handled here via `$effect` — callers must NOT wire
 * their own. Canonical pattern, previously duplicated inline in
 * users/create and configurations/create.
 */
export function useForceFormValidation(
  validateForm: (opts: { update?: boolean; focusOnError?: boolean }) => Promise<unknown>,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(timer));
  return () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void validateForm({ update: true, focusOnError: false });
    }, 250);
  };
}
