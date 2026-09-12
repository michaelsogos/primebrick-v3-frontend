<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";

	export const loadingBarVariants = tv({
		base: "w-full overflow-hidden rounded-full",
		variants: {
			size: {
				xs: "h-0.5",
				sm: "h-1",
			},
			variant: {
				muted: "bg-muted",
			},
		},
		defaultVariants: {
			size: "xs",
			variant: "muted",
		},
	});

	export type LoadingBarSize = VariantProps<typeof loadingBarVariants>["size"];
	export type LoadingBarVariant = VariantProps<typeof loadingBarVariants>["variant"];
</script>

<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";

	type Props = WithElementRef<HTMLAttributes<HTMLDivElement>, HTMLDivElement> & {
		size?: LoadingBarSize;
		variant?: LoadingBarVariant;
		barClass?: string;
	};

	let {
		ref = $bindable(null),
		class: className,
		size = "xs",
		variant = "muted",
		barClass,
		...restProps
	}: Props = $props();
</script>

<div
	bind:this={ref}
	data-slot="loading-bar"
	class={cn(loadingBarVariants({ size, variant }), className)}
	{...restProps}
>
	<div
		class={cn("h-full w-full animate-gradient-pan", barClass)}
		style="background-image: linear-gradient(to right, #38bdf8, #6366f1, #8b5cf6, #6366f1, #38bdf8);"
	></div>
</div>

<style>
	/* Indeterminate translateX animation removed — replaced by
	   animate-gradient-pan (background-position panning) which gives
	   the same "flowing" effect with the primary gradient. */
</style>

