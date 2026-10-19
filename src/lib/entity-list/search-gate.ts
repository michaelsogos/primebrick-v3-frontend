/**
 * search-gate — canonical "should this search query hit the BE" predicate.
 *
 * Mirrors the backend list-search gate: ≥3 "real" characters, or an escaped
 * wildcard (`\*` / `\?`) with ≥1 real char. Prevents per-keystroke queries
 * while still allowing single-char wildcard searches.
 *
 * Canonical implementation: former `customerSearchShouldQuery` (customers
 * page), now the shared default for every entity list.
 *
 * @param trimmed the search string, already `.trim()`ed by the caller
 */
export function defaultSearchGate(trimmed: string): boolean {
  if (trimmed.length === 0) return false;
  if (trimmed.length >= 3) return true;
  let trueChars = 0;
  let hasEscapedWildcard = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    const next = trimmed[i + 1];
    if (ch === '\\' && (next === '*' || next === '?')) {
      hasEscapedWildcard = true;
      i++;
      continue;
    }
    if (ch === '\\' && next !== undefined) {
      trueChars++;
      i++;
      continue;
    }
    trueChars++;
  }
  return hasEscapedWildcard && trueChars >= 1;
}
