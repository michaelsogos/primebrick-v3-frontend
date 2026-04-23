/**
 * Shared menu list chrome (dropdown, command palette, sidebar items):
 * - **Hover / keyboard highlight**: neutral pill — `zinc-200` light, `zinc-700` on dark surfaces
 * - **Selected**: sky fill in light, neutral fill in dark — **no outline border** (`border-transparent`),
 *   same surface as single-select `DropdownMenu` rows (`menuListSelectedSurfaceDropdownClasses`).
 * Inactive rows keep `border border-transparent` so highlight/selection does not reflow.
 */

/** `DropdownMenu.Item` when selected (unprefixed; merged last on the item). */
export const menuListSelectedSurfaceDropdownClasses = [
	'border-transparent bg-sky-100 font-semibold text-sky-950 shadow-xs',
	'data-[highlighted]:bg-sky-200 data-[highlighted]:text-sky-950',
	'[&_svg]:text-sky-950',
	'dark:border-transparent dark:bg-neutral-800 dark:text-neutral-50 dark:shadow-xs',
	'dark:data-[highlighted]:bg-neutral-700 dark:data-[highlighted]:text-neutral-50',
	'dark:[&_svg]:text-neutral-50',
].join(' ');

/** Sidebar buttons & menu links: same neutral hover as list rows */
export const menuListHoverNeutral =
	'hover:bg-zinc-200/95 hover:text-foreground dark:hover:bg-zinc-700/70 dark:hover:text-foreground';

/** Pressed / open trigger (optional pairing with `menuListHoverNeutral`) */
export const menuListOpenSurface =
	'data-[state=open]:bg-zinc-200/90 data-[state=open]:text-foreground dark:data-[state=open]:bg-zinc-700/65 dark:data-[state=open]:text-foreground';

export const menuSoftRowBorderBase = 'border border-transparent shadow-none';

export const menuSoftRowHighlightData = [
	'data-[highlighted]:border-transparent data-[highlighted]:shadow-none',
	'data-[highlighted]:bg-zinc-200/95 data-[highlighted]:text-foreground',
	'dark:data-[highlighted]:bg-zinc-700/70 dark:data-[highlighted]:text-foreground',
	'data-[highlighted]:[&_svg:not([class*="text-"])]:text-muted-foreground',
].join(' ');

export const menuSoftSubTriggerOpenData = [
	'data-[state=open]:border-transparent data-[state=open]:shadow-none',
	'data-[state=open]:bg-zinc-200/95 data-[state=open]:text-foreground',
	'dark:data-[state=open]:bg-zinc-700/70 dark:data-[state=open]:text-foreground',
	'data-[state=open]:[&_svg:not([class*="text-"])]:text-muted-foreground',
].join(' ');

export const menuSoftFocusKeyboard = [
	'focus-visible:border-transparent focus-visible:shadow-none',
	'focus-visible:bg-zinc-200/95 focus-visible:text-foreground',
	'dark:focus-visible:bg-zinc-700/70 dark:focus-visible:text-foreground',
	'focus-visible:[&_svg:not([class*="text-"])]:text-muted-foreground',
].join(' ');

export const menuSoftAriaSelected = [
	'aria-selected:border-transparent aria-selected:bg-sky-100 aria-selected:font-semibold aria-selected:text-sky-950 aria-selected:shadow-xs',
	'dark:aria-selected:border-transparent dark:aria-selected:bg-neutral-800 dark:aria-selected:text-neutral-50',
	'aria-selected:[&_svg]:text-sky-950 dark:aria-selected:[&_svg]:text-neutral-50',
	'aria-selected:data-[highlighted]:bg-sky-200 aria-selected:data-[highlighted]:text-sky-950',
	'dark:aria-selected:data-[highlighted]:bg-neutral-700 dark:aria-selected:data-[highlighted]:text-neutral-50',
].join(' ');

/** `Command.Item`: layout + soft frame + highlight + aria-selected */
export const commandMenuItemClassName = [
	'relative flex w-full cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none',
	'data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
	menuSoftRowBorderBase,
	menuSoftRowHighlightData,
	menuSoftAriaSelected,
].join(' ');

/** Sidebar: active route row — same selected surface as dropdowns / command list */
export const menuSidebarActiveChrome = [
	'data-[active=true]:border-transparent data-[active=true]:bg-sky-100 data-[active=true]:font-semibold data-[active=true]:text-sky-950 data-[active=true]:shadow-xs',
	'dark:data-[active=true]:border-transparent dark:data-[active=true]:bg-neutral-800 dark:data-[active=true]:text-neutral-50',
	'data-[active=true]:hover:bg-sky-200 data-[active=true]:hover:text-sky-950',
	'dark:data-[active=true]:hover:bg-neutral-700 dark:data-[active=true]:hover:text-neutral-50',
	'data-[active=true]:[&>svg]:text-sky-950 dark:data-[active=true]:[&>svg]:text-neutral-50',
].join(' ');
