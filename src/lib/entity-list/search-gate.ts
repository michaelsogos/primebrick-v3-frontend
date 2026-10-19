/**
 * search-gate — canonical "should this search query hit the BE" predicate.
 * Implementation lives in @primebrick/core (env-neutral — remote module
 * pages bundle the same gate). Re-exported for `$lib/entity-list` consumers.
 */
export { defaultSearchGate } from '@primebrick/ui';
