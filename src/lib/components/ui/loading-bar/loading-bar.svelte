<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";
	import {
		loadingBarVariants,
		type LoadingBarSize,
		type LoadingBarVariant,
	} from "./variants.js";

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
	<!-- Dim brand-gradient underlay — keeps the original pan animation as a
	     faint ambient layer under the comet. -->
	<div
		class={cn("lt-underlay animate-gradient-pan", barClass)}
		style="background-image: linear-gradient(to right, #38bdf8, #6366f1, #8b5cf6, #6366f1, #38bdf8);"
	></div>
	<!-- Larson-scanner comet: symmetric brand blob that sweeps left→right→left,
	     decelerating at the edges (KITT-style ping-pong via `alternate`). -->
	<div class="kitt-comet"></div>
</div>

<style>
	.lt-underlay {
		position: absolute;
		inset: 0;
		opacity: 0.15;
	}

	.kitt-comet {
		position: absolute;
		inset-block: 0;
		left: 0;
		width: 25%;
		border-radius: 9999px;
		background: linear-gradient(
			to right,
			transparent 0%,
			#38bdf8 35%,
			#6366f1 50%,
			#8b5cf6 65%,
			transparent 100%
		);
		box-shadow: 0 0 6px 1px rgba(99, 102, 241, 0.9);
		animation: kitt-scan 0.85s cubic-bezier(0.45, 0, 0.55, 1) infinite alternate;
	}

	/* translateX % is relative to the comet's own width (25%): 300% moves it
	   exactly 75% of the track — flush to the right edge. `alternate` reverses
	   each iteration → the ping-pong sweep; the symmetric ease-in-out yields
	   KITT's deceleration at both ends. */
	@keyframes kitt-scan {
		from { transform: translateX(0%); }
		to   { transform: translateX(300%); }
	}

	@media (prefers-reduced-motion: reduce) {
		.lt-underlay,
		.kitt-comet {
			animation: none;
		}
		.kitt-comet {
			width: 100%;
			box-shadow: none;
		}
	}
</style>
