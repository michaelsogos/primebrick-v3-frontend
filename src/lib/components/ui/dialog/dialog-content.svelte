<script lang="ts">
	import { Dialog as DialogPrimitive } from "bits-ui";
	import DialogPortal from "./dialog-portal.svelte";
	import type { Snippet } from "svelte";
	import * as Dialog from "./index.js";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";
	import type { ComponentProps } from "svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import XIcon from '@lucide/svelte/icons/x';

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		children,
		showCloseButton = true,
		...restProps
	}: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DialogPortal>>;
		children: Snippet;
		showCloseButton?: boolean;
	} = $props();
</script>

<style>
	/* Applichiamo :global perché le classi vengono iniettate dinamicamente da BitsUI */
	:global([data-slot="dialog-content"][data-state="open"]) {
		animation: bounceIn 0.6s cubic-bezier(0.215, 0.61, 0.355, 1) forwards;
	}

	:global([data-slot="dialog-content"][data-state="closed"]) {
		animation: bounceOut 0.4s ease-in forwards;
	}

	@keyframes bounceIn {
		0% { opacity: 0; transform: scale3d(0.3, 0.3, 0.3); }
		20% { transform: scale3d(1.1, 1.1, 1.1); }
		40% { transform: scale3d(0.9, 0.9, 0.9); }
		60% { opacity: 1; transform: scale3d(1.03, 1.03, 1.03); }
		80% { transform: scale3d(0.97, 0.97, 0.97); }
		100% { opacity: 1; transform: scale3d(1, 1, 1); }
	}

	@keyframes bounceOut {
		20% { transform: scale3d(0.9, 0.9, 0.9); }
		50%, 55% { opacity: 1; transform: scale3d(1.1, 1.1, 1.1); }
		100% { opacity: 0; transform: scale3d(0.3, 0.3, 0.3); }
	}
</style>

<DialogPortal {...portalProps}>
	<Dialog.Overlay />
	<DialogPrimitive.Content
		bind:ref
		data-slot="dialog-content"
		class={cn(
			"bg-popover text-popover-foreground ring-foreground/10 grid max-w-[calc(100%-2rem)] gap-4 rounded-xl p-4 text-sm ring-1 shadow-2xl sm:max-w-sm fixed top-1/2 left-1/2 z-100 w-full -translate-x-1/2 -translate-y-1/2 outline-none",
			className
		)}
		{...restProps}
	>
		{@render children?.()}
		{#if showCloseButton}
			<DialogPrimitive.Close data-slot="dialog-close">
				{#snippet child({ props })}
					<Button variant="ghost" class="absolute top-2 right-2" size="icon-sm" {...props}>
						<XIcon  />
						<span class="sr-only">Close</span>
					</Button>
				{/snippet}
			</DialogPrimitive.Close>
		{/if}
	</DialogPrimitive.Content>
</DialogPortal>
