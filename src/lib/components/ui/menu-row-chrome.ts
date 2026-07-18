/**
 * Shared menu list chrome (dropdown, command palette, sidebar items):
 * - **Hover / keyboard highlight**: neutral pill — `zinc-200` light, `zinc-700` on dark surfaces
 * - **Selected**: sky fill in light, neutral fill in dark — **no outline border** (`border-transparent`),
 *   same surface as single-select `DropdownMenu` rows (`menuListSelectedSurfaceDropdownClasses`).
 * Inactive rows keep `border border-transparent` so highlight/selection does not reflow.
 */

/** `DropdownMenu.Item` when selected (unprefixed; merged last on the item). */
export const menuListSelectedSurfaceDropdownClasses = [
	'border-primary-gradient-soft font-semibold text-foreground shadow-xs',
	'data-highlighted:brightness-105',
	'dark:border-primary-gradient-soft dark:text-foreground dark:shadow-xs',
].join(' ');

/** Sidebar buttons & menu links: same neutral hover as list rows */
export const menuListHoverNeutral =
	'hover:bg-zinc-200/95 hover:text-foreground dark:hover:bg-zinc-700/70 dark:hover:text-foreground';

/** Pressed / open trigger (optional pairing with `menuListHoverNeutral`) */
export const menuListOpenSurface =
	'data-[state=open]:bg-zinc-200/90 data-[state=open]:text-foreground dark:data-[state=open]:bg-zinc-700/65 dark:data-[state=open]:text-foreground';

export const menuSoftRowBorderBase = 'border border-transparent shadow-none';

export const menuSoftRowHighlightData = [
	'data-highlighted:border-transparent data-highlighted:shadow-none',
	'data-highlighted:bg-zinc-200/95',
	'dark:data-highlighted:bg-zinc-700/70',
	'[&_svg:not([class*="text-"])]:data-highlighted:text-muted-foreground',
].join(' ');

export const menuSoftSubTriggerOpenData = [
	'data-[state=open]:border-transparent data-[state=open]:shadow-none',
	'data-[state=open]:bg-zinc-200/95 data-[state=open]:text-foreground',
	'dark:data-[state=open]:bg-zinc-700/70 dark:data-[state=open]:text-foreground',
	'[&_svg:not([class*="text-"])]:data-[state=open]:text-muted-foreground',
].join(' ');

export const menuSoftFocusKeyboard = [
	'focus-visible:border-transparent focus-visible:shadow-none',
	'focus-visible:bg-zinc-200/95 focus-visible:text-foreground',
	'dark:focus-visible:bg-zinc-700/70 dark:focus-visible:text-foreground',
	'[&_svg:not([class*="text-"])]:focus-visible:text-muted-foreground',
].join(' ');

export const menuSoftAriaSelected = [
	'aria-selected:border-primary-gradient-soft aria-selected:font-semibold aria-selected:text-foreground aria-selected:shadow-xs',
	'dark:aria-selected:border-primary-gradient-soft dark:aria-selected:text-foreground',
	'aria-selected:data-highlighted:brightness-105',
].join(' ');

/** `Command.Item`: layout + soft frame + highlight + aria-selected */
export const commandMenuItemClassName = [
	'relative flex w-full cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden',
	'data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
	menuSoftRowBorderBase,
	menuSoftRowHighlightData,
	menuSoftAriaSelected,
].join(' ');

/** Sidebar: active route row — same selected surface as dropdowns / command list */
export const menuSidebarActiveChrome = [
	'data-[active=true]:border-primary-gradient-soft data-[active=true]:font-semibold data-[active=true]:text-foreground data-[active=true]:shadow-xs',
	'dark:data-[active=true]:border-primary-gradient-soft dark:data-[active=true]:text-foreground',
	'data-[active=true]:hover:brightness-105',
].join(' ');
