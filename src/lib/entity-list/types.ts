/**
 * Entity-list contract types — canonical definitions live in
 * `@primebrick/core` (re-exported through `@primebrick/ui`, which the FE
 * depends on). This module re-exports them so existing internal import sites
 * keep working.
 *
 * Naming: `EntityMeta` here aliases the SERVED shape (`EntityMetaResponse`) —
 * the FE only ever consumes the assembled meta, never the static authored
 * form.
 */

export type {
	SortDir,
	ViewName,
	DeletionFilterMode,
	SnakeCaseSingular,
	TooltipPriority,
	MetaColumn,
	MetaColumnType,
	RowCustomAction,
	TableMeta,
	EntityActionEndpoint,
	EntityAction,
	EntityActionSentinel,
	ActionsOverrides,
	CollaborationMeta,
	FilterOperator,
	AdvancedFilter,
	ListConnector,
	ListResponse,
	StandardOp,
	FilterPreset,
	FilterPresetOption,
	FilterCondition,
} from '@primebrick/ui';

export {
	isSnakeCaseSingular,
	asSnakeCaseSingular,
	orderedColumns,
	defaultVisibleColumnKeys,
	sanitizeVisibleKeys,
	searchableTextColumns,
	getOperatorsForColumnType,
	STANDARD_OPS,
	isEntityOpEnabled,
} from '@primebrick/ui';

import type { EntityMetaResponse } from '@primebrick/ui';

/**
 * The served `GET /api/v1/entities/{entity}/meta` response — static meta +
 * runtime-injected `display_name`, `actions`, `collaboration`.
 */
export type EntityMeta = EntityMetaResponse;
