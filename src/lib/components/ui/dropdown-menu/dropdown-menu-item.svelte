<script lang="ts">
	import { cn } from "$lib/utils.js";
	import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
	import { menuSoftRowBorderBase, menuSoftRowHighlightData } from "../menu-row-chrome.js";

	let {
		ref = $bindable(null),
		class: className,
		inset,
		variant = "default",
		...restProps
	}: DropdownMenuPrimitive.ItemProps & {
		inset?: boolean;
		variant?: "default" | "destructive";
	} = $props();
</script>

<DropdownMenuPrimitive.Item
	bind:ref
	data-slot="dropdown-menu-item"
	data-inset={inset}
	data-variant={variant}
	class={cn(
		"relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:ps-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		menuSoftRowBorderBase,
		menuSoftRowHighlightData,
		"[&_svg:not([class*='text-'])]:text-muted-foreground",
		"data-[variant=destructive]:text-destructive data-[variant=destructive]:data-[highlighted]:border-destructive/25 data-[variant=destructive]:data-[highlighted]:bg-destructive/10 data-[variant=destructive]:data-[highlighted]:text-destructive data-[variant=destructive]:data-[highlighted]:shadow-xs dark:data-[variant=destructive]:data-[highlighted]:bg-destructive/20 data-[variant=destructive]:*:[svg]:!text-destructive",
		className
	)}
	{...restProps}
/>
