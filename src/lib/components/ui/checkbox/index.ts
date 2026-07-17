import Root, { type CheckboxTone } from "./checkbox.svelte";

/**
 * Base checkbox styling for consistent appearance across the application.
 * Provides border styling that changes color when checked.
 */
export const checkboxBaseClass =
	'border-foreground/50 shadow-sm dark:border-foreground/35 data-[state=checked]:border-primary';

/**
 * Non-interactive checkbox class for sheet menus where the parent element handles clicks.
 * The checkbox is visual-only; pointer-events are disabled to prevent interference.
 */
export const checkboxVisualOnlyClass =
	`pointer-events-none shrink-0 ${checkboxBaseClass}`;

/**
 * Interactive checkbox class for table row selection and other interactive checkboxes.
 * The checkbox handles its own click events.
 */
export const checkboxInteractiveClass =
	checkboxBaseClass;

export { Root, Root as Checkbox, type CheckboxTone };
