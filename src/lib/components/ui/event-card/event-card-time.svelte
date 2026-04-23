<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";
	import { Clock } from "@lucide/svelte";
	import { cn, type WithElementRef } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="event-card-time"
	class={cn("mt-2 flex items-center gap-1.5 text-xs font-normal text-muted-foreground", className)}
	{...restProps}
>
	<Clock class="h-3.5 w-3.5" />
	{@render children?.()}
</div>

