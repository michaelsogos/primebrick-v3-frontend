// Import primitives via `$lib/vendor/...` (not `import { Tooltip } from "bits-ui"`): under Vite 8 SSR
// that namespace can be undefined when this barrel is evaluated, so `Tooltip.Root` throws.
import { Root, Trigger, Provider } from "$lib/vendor/bits-ui-tooltip-exports";
import Content from "./tooltip-content.svelte";
import PriorityContent from "./priority-tooltip-content.svelte";
import type { TooltipPriority } from "@primebrick/ui";

export {
	Root,
	Trigger,
	Content,
	PriorityContent,
	Provider,
	//
	Root as Tooltip,
	Content as TooltipContent,
	PriorityContent as PriorityTooltipContent,
	Trigger as TooltipTrigger,
	Provider as TooltipProvider,
};

export type { TooltipPriority };
