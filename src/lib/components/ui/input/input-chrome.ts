/**
 * Hover chrome for text fields (`Input`) and any shell that mirrors the same control (e.g. command palette).
 * Light: subtle sky wash (brand). Dark: neutral lift on `--input` (same ramp as outline / soft in dark).
 */
export const inputControlHoverClasses =
	'hover:border-ring/40 hover:bg-sky-50/45 dark:hover:border-ring/40 dark:hover:bg-input/55';

/**
 * Unified trailing-icon color/hover/focus classes for input trailing buttons.
 * - No background fill on hover (consistent across all trailing icons).
 * - Color shifts from muted-foreground → foreground on hover.
 * - Same focus ring as the rest of the UI.
 *
 * Use this for trailing icons that are positioned by their parent (e.g. inside a flex row).
 * For absolutely-positioned trailing icons inside a `relative` wrapper, use
 * `inputTrailingIconButtonClasses` instead, which adds the positioning classes.
 */
export const inputTrailingIconColorClasses =
	'inline-flex items-center justify-center p-0.5 ' +
	'text-muted-foreground hover:text-foreground hover:bg-transparent ' +
	'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ' +
	'transition-colors cursor-pointer';

/**
 * Unified trailing-icon button classes for inputs (clear X, eye toggle, copy button, etc.).
 * Combines `inputTrailingIconColorClasses` with absolute positioning for use inside a
 * `<div class="relative">` wrapper around an input.
 * - size-7 to fit inside h-9 inputs with 1px border.
 * - Absolute-positioned at the right edge, vertically centered.
 *
 * Usage: pass as the `class` prop to a button that sits inside a `<div class="relative">`
 * wrapping an input.
 */
export const inputTrailingIconButtonClasses =
	'absolute top-1/2 right-0 -translate-y-1/2 size-7 min-w-0 ' +
	inputTrailingIconColorClasses;
