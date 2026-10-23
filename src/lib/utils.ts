/**
 * Canonical implementations live in `@primebrick/ui` (`utils/cn.ts`,
 * `utils/types.ts`) — this barrel re-exports them under the historical
 * `$lib/utils` path so vendored components and remote-proxied code keep a
 * single, uniform import surface.
 */
export { cn } from '@primebrick/ui';
export type {
	WithoutChild,
	WithoutChildren,
	WithoutChildrenOrChild,
	WithElementRef,
} from '@primebrick/ui';
