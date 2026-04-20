/**
 * Shared menu list chrome (dropdown, command palette, sidebar items):
 * - **Hover / keyboard highlight**: neutral pill, slightly darker than `sidebar-accent`
 *   (≈ zinc-100) — `zinc-200` light, `zinc-700` on dark surfaces
 * - **Selected**: `bg-sky-100` + `border-input` + `shadow-xs`
 * Inactive rows keep `border border-transparent` so highlight/selection does not reflow.
 */

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
	'aria-selected:border-input aria-selected:bg-sky-100 aria-selected:text-sky-950 aria-selected:shadow-xs',
	'aria-selected:[&_svg]:text-sky-950',
].join(' ');

/** `Command.Item`: layout + soft frame + highlight + aria-selected */
export const commandMenuItemClassName = [
	'relative flex w-full cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none',
	'data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
	menuSoftRowBorderBase,
	menuSoftRowHighlightData,
	menuSoftAriaSelected,
].join(' ');

/** Sidebar: selected row (sky + border); hover when active stays on sky scale */
export const menuSidebarActiveChrome = [
	'data-[active=true]:border-input data-[active=true]:bg-sky-100 data-[active=true]:text-sky-950 data-[active=true]:shadow-xs',
	'data-[active=true]:hover:bg-sky-200 data-[active=true]:hover:text-sky-950 data-[active=true]:[&>svg]:text-sky-950',
	'data-[active=true]:font-semibold',
].join(' ');
