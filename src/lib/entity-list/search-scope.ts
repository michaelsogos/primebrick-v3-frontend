/**
 * Search-scope (`search_in`) toggle semantics — the single source for the
 * "check/uncheck one column in the scope" transition used by the list
 * toolbar search sheet (`entity.searchIn`) on both ELT and dict pages.
 *
 * null/empty = "all fields" (no explicit scope); toggling the last key off
 * returns to null rather than an empty array.
 */
export function nextSearchScopeKeys(current: string[] | null, key: string): string[] | null {
  if (!current || current.length === 0) return [key];
  if (current.includes(key)) {
    const next = current.filter((k) => k !== key);
    return next.length ? next : null;
  }
  return [...current, key];
}
