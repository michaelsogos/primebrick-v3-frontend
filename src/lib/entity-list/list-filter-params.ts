/**
 * list-filter-params — canonical serializer for entity `/list` filter params.
 * Implementation lives in @primebrick/core (env-neutral — remote module
 * pages bundle the same wire format). This module re-exports it so existing
 * `$lib/entity-list` imports keep working.
 */
export { appendListFilterParams, type ListFilterParamsOptions } from '@primebrick/ui';
