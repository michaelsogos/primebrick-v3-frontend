<script lang="ts">
	import { cn } from "$lib/utils.js";
	import type { WithElementRef } from "bits-ui";
	import type { Snippet } from "svelte";
	import type { HTMLAnchorAttributes } from "svelte/elements";
	import {
		menuListHoverNeutral,
		menuSidebarActiveChrome,
		menuSoftRowBorderBase,
	} from "../menu-row-chrome.js";

	let {
		ref = $bindable(null),
		children,
		child,
		class: className,
		size = "md",
		isActive,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> & {
		child?: Snippet<[{ props: Record<string, unknown> }]>;
		size?: "sm" | "md";
		isActive?: boolean;
	} = $props();

	const mergedProps = $derived({
		class: cn(
			"text-sidebar-foreground ring-sidebar-ring [&>svg]:text-muted-foreground hover:[&>svg]:text-foreground flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
			menuListHoverNeutral,
			"active:bg-zinc-300/90 dark:active:bg-zinc-600/75",
			menuSoftRowBorderBase,
			menuSidebarActiveChrome,
			size === "sm" && "text-xs",
			size === "md" && "text-sm",
			"group-data-[collapsible=icon]:hidden",
			className
		),
		"data-sidebar": "menu-sub-button",
		"data-size": size,
		"data-active": isActive,
		...restProps,
	});
</script>

{#if child}
	{@render child({ props: mergedProps })}
{:else}
	<a bind:this={ref} {...mergedProps}>
		{@render children?.()}
	</a>
{/if}
