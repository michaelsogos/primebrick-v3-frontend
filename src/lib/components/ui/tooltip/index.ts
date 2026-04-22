// Import primitives via `$lib/vendor/...` (not `import { Tooltip } from "bits-ui"`): under Vite 8 SSR
// that namespace can be undefined when this barrel is evaluated, so `Tooltip.Root` throws.
import { Root, Trigger, Provider } from "$lib/vendor/bits-ui-tooltip-exports";
import Content from "./tooltip-content.svelte";

export {
	Root,
	Trigger,
	Content,
	Provider,
	//
	Root as Tooltip,
	Content as TooltipContent,
	Trigger as TooltipTrigger,
	Provider as TooltipProvider,
};
