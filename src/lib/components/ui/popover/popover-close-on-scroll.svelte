<script lang="ts">
	/**
	 * PopoverCloseOnScroll — `Popover.Root` wrapper for display-only popovers
	 * that must close when the page scrolls.
	 *
	 * Rationale: a portaled popover anchored to an offscreen trigger serves no
	 * purpose, and leaving it open triggers a bits-ui focus-trap artifact — the
	 * outside-press dismiss is debounced ~10ms, so a click on another trigger
	 * fires `focusin` while the old scope still traps focus, scrolls the
	 * offscreen popover back into view, and swallows the click.
	 *
	 * Safe inside `{#each}` rows: each instance owns its `open` state.
	 *
	 * Usage: drop-in replacement for `Popover.Root`.
	 */
	import { Popover as PopoverPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { popoverCloseOnScroll } from './close-on-scroll.svelte';

	let { children, ...restProps }: PopoverPrimitive.RootProps & { children: Snippet } = $props();

	const pop = popoverCloseOnScroll();
</script>

<PopoverPrimitive.Root bind:open={pop.open} {...restProps}>
	{@render children()}
</PopoverPrimitive.Root>
