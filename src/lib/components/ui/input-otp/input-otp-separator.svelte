<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";
	import type { WithElementRef } from "$lib/utils.js";
	import Minus from "@lucide/svelte/icons/minus";

	let {
		ref = $bindable(null),
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div bind:this={ref} data-slot="input-otp-separator" role="separator" {...restProps}>
	{#if children}
		{@render children()}
	{:else}
		<Minus />
	{/if}
</div>
