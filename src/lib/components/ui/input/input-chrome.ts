/**
 * Hover chrome for text fields (`Input`) and any shell that mirrors the same control (e.g. command palette).
 * Light: subtle sky wash (brand). Dark: neutral lift on `--input` (same ramp as outline / soft in dark).
 */
export const inputControlHoverClasses =
	'hover:border-ring/40 hover:bg-sky-50/45 dark:hover:border-ring/40 dark:hover:bg-input/55';

/**
 * "Ghost" chrome — the FORMALIZED variant: a subtle always-visible neutral
 * border on a transparent background (NOT the borderless button ghost).
 * Same chrome as the entity-list toolbar SearchBar / ComboSelect
 * `variant="toolbar"`: `border-foreground/25`, hover `foreground/40`,
 * focus `foreground/50` + `ring-foreground/20`.
 * Use for controls embedded inside an already-bordered container
 * (color-picker footer, toolbar strips). For the rare truly borderless
 * case use `inputBorderlessChromeClasses` below.
 */
export const inputGhostChromeClasses =
	'border border-foreground/25 bg-transparent shadow-none ' +
	'hover:border-foreground/40 ' +
	'focus-visible:border-foreground/50 focus-visible:ring-2 focus-visible:ring-foreground/20 ' +
	'focus-within:border-foreground/50';

/**
 * Truly borderless chrome — button-ghost equivalent for inputs: no border
 * at rest, faint border only on hover/focus. Rarely appropriate (the control
 * is hard to discover); prefer `inputGhostChromeClasses`.
 */
export const inputBorderlessChromeClasses =
	'border border-transparent bg-transparent shadow-none ' +
	'hover:border-foreground/15 hover:bg-muted/30 ' +
	'focus-visible:border-foreground/15 focus-visible:ring-2 focus-visible:ring-ring/50 ' +
	'dark:border-foreground/10';

/**
 * Unified trailing-icon color/hover/focus classes for input trailing buttons.
 * - No background fill on hover (consistent across all trailing icons).
 * - Color shifts from muted-foreground → foreground on hover.
 * - Same focus ring as the rest of the UI.
 * - `[&>svg]:size-4` locks the icon glyph to 16px — the mandated size for ALL
 *   inner icon-only controls (clear, eye toggle, copy, status, etc.).
 *   Do NOT override the glyph size in individual components; only the hit
 *   area (button box) may vary.
 *
 * Use this for trailing icons that are positioned by their parent (e.g. inside a flex row).
 * For absolutely-positioned trailing icons inside a `relative` wrapper, use
 * `inputTrailingIconButtonClasses` instead, which adds the positioning classes.
 */
export const inputTrailingIconColorClasses =
	'inline-flex items-center justify-center p-0.5 [&>svg]:size-4 ' +
	'text-muted-foreground hover:text-foreground hover:bg-transparent ' +
	'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ' +
	'transition-colors cursor-pointer';

/**
 * Unified trailing-icon button classes for inputs (clear X, eye toggle, copy button, etc.).
 * Combines `inputTrailingIconColorClasses` with absolute positioning for use inside a
 * `<div class="relative">` wrapper around an input.
 * - size-7 to fit inside h-9 inputs with 1px border.
 * - Absolute-positioned, vertically centered, at `right-1.5` → the icon glyph
 *   sits 12px from the border, symmetric to the input's `px-3` left padding.
 *   SECOND slot (when a rightmost clear/copy coexists) uses `right-10`.
 *
 * Usage: pass as the `class` prop to a button that sits inside a `<div class="relative">`
 * wrapping an input.
 */
export const inputTrailingIconButtonClasses =
	'absolute top-1/2 right-1.5 -translate-y-1/2 z-10 size-7 min-w-0 ' +
	inputTrailingIconColorClasses;
