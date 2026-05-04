<script lang="ts">
	import { cn } from "$lib/utils.js";
	import type { HTMLInputAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		type = "text",
		...props
	}: HTMLInputAttributes & { type?: string; ref?: HTMLInputElement | null } = $props();
</script>

<input
	bind:this={ref}
	data-slot="input-group-control"
	{type}
	class={cn("flex-1 w-full bg-transparent border-none outline-hidden disabled:cursor-not-allowed disabled:opacity-50", className)}
	bind:value
	{...props}
/>
