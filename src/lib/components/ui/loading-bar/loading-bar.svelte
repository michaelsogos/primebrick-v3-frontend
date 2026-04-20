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
		/** CSS variable time (e.g. `"1.2s"`). */
		duration?: string;
		/** CSS variable easing (e.g. `"ease-in-out"`). */
		easing?: string;
		barClass?: string;
	};

	let {
		ref = $bindable(null),
		class: className,
		size = "xs",
		variant = "muted",
		duration = "1.2s",
		easing = "ease-in-out",
		barClass,
		...restProps
	}: Props = $props();
</script>

<div
	bind:this={ref}
	data-slot="loading-bar"
	class={cn(loadingBarVariants({ size, variant }), className)}
	style={`--pb-loading-bar-duration: ${duration}; --pb-loading-bar-easing: ${easing};`}
	{...restProps}
>
	<div class={cn("h-full w-1/3 bg-info pb-loading-bar", barClass)}></div>
</div>

<style>
	@keyframes pb-indeterminate {
		0% {
			transform: translateX(-120%);
		}
		100% {
			transform: translateX(360%);
		}
	}

	.pb-loading-bar {
		animation: pb-indeterminate var(--pb-loading-bar-duration, 1.2s)
			var(--pb-loading-bar-easing, ease-in-out) infinite;
	}
</style>

