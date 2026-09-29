import { Popover as PopoverPrimitive } from "bits-ui";
import Content from "./popover-content.svelte";
import Trigger from "./popover-trigger.svelte";

const Root = PopoverPrimitive.Root;
const Close = PopoverPrimitive.Close;
const Portal = PopoverPrimitive.Portal;

export {
	Root,
	Close,
	Trigger,
	Content,
	Portal,
	//
	Root as Popover,
	Close as PopoverClose,
	Trigger as PopoverTrigger,
	Content as PopoverContent,
	Portal as PopoverPortal,
};
