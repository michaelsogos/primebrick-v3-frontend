/**
 * Re-export Bits UI tooltip primitives without `import { Tooltip } from "bits-ui"`.
 * Vite 8 SSR can evaluate that namespace as undefined in barrels, breaking `Tooltip.Root`.
 */
export {
	Root,
	Trigger,
	Provider,
	Content,
} from '../../../node_modules/bits-ui/dist/bits/tooltip/exports.js';
export type { ContentProps } from '../../../node_modules/bits-ui/dist/bits/tooltip/exports.js';
