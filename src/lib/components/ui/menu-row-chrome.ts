/**
 * Shared menu list chrome (dropdown, command palette, sidebar items):
 * - **Hover / keyboard highlight**: neutral pill — `zinc-200` light, `zinc-700` on dark surfaces
 * - **Selected**: Button `outline`-style surface — `border-primary-gradient`,
 *   white/`input` background, `font-semibold`, `shadow-selected-primary`
 *   (outer drop + subtle sky→indigo inner glow).
 * Inactive rows keep `border border-transparent` so highlight/selection does not reflow.
 */

/** `DropdownMenu.Item` when selected (unprefixed; merged last on the item). */
export const menuListSelectedSurfaceDropdownClasses = [
	'border-primary-gradient bg-background font-semibold text-foreground shadow-selected-primary',
	'data-highlighted:brightness-105',
	'dark:bg-input/30 dark:text-foreground',
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
	'aria-selected:border-primary-gradient aria-selected:bg-background aria-selected:font-semibold aria-selected:text-foreground aria-selected:shadow-selected-primary',
	'dark:aria-selected:bg-input/30 dark:aria-selected:text-foreground',
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
	'data-[active=true]:border-primary-gradient data-[active=true]:bg-background data-[active=true]:font-semibold data-[active=true]:text-foreground data-[active=true]:shadow-selected-primary',
	'dark:data-[active=true]:bg-input/30 dark:data-[active=true]:text-foreground',
	'data-[active=true]:hover:brightness-105',
].join(' ');
