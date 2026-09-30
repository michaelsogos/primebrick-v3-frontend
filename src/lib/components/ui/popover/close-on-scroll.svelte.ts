/**
 * close-on-scroll — bindable `open` state for display-only popovers that must
 * close when the page scrolls.
 *
 * Rationale: a portaled popover anchored to an offscreen trigger serves no
 * purpose, and leaving it open triggers a bits-ui focus-trap artifact — the
 * outside-press dismiss is debounced ~10ms, so a click on another trigger
 * fires `focusin` while the old scope still traps focus, scrolls the
 * offscreen popover back into view, and swallows the click.
 *
 * Usage:
 *   const pop = popoverCloseOnScroll();
 *   <Popover.Root bind:open={pop.open}> …
 */
export function popoverCloseOnScroll() {
	const state = $state({ open: false });

	$effect(() => {
		if (!state.open) return;
		const close = () => {
			state.open = false;
		};
		// capture: the scroll may happen in a nested scrollable container.
		window.addEventListener('scroll', close, { capture: true, passive: true });
		return () => window.removeEventListener('scroll', close, { capture: true });
	});

	return state;
}
