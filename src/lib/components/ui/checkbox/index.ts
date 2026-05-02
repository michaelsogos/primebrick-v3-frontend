import Root from "./checkbox.svelte";

/**
 * Non-interactive checkbox class for sheet menus where the parent element handles clicks.
 * The checkbox is visual-only; pointer-events are disabled to prevent interference.
 */
export const checkboxVisualOnlyClass =
	'pointer-events-none shrink-0 border-foreground/50 shadow-sm dark:border-foreground/35 data-[state=checked]:border-primary';

export { Root, Root as Checkbox };
