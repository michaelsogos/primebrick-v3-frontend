/**
 * Shared menu list chrome (dropdown, command palette, sidebar items):
 * - **Hover / keyboard highlight**: neutral pill, slightly darker than `sidebar-accent`
 *   (≈ zinc-100) — `zinc-200` light, `zinc-700` on dark surfaces
 * - **Selected**: `neutral` surface + `border-input` + `shadow-xs` (aligned with dark neutral shell, not sky)
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
	'aria-selected:border-input aria-selected:bg-neutral-100 aria-selected:text-neutral-950 aria-selected:shadow-xs',
	'dark:aria-selected:bg-neutral-800 dark:aria-selected:text-neutral-50',
	'aria-selected:[&_svg]:text-neutral-950 dark:aria-selected:[&_svg]:text-neutral-50',
].join(' ');

/** `Command.Item`: layout + soft frame + highlight + aria-selected */
export const commandMenuItemClassName = [
	'relative flex w-full cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none',
	'data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
	menuSoftRowBorderBase,
	menuSoftRowHighlightData,
	menuSoftAriaSelected,
].join(' ');

/** Sidebar: selected row (neutral + border); hover when active stays on neutral scale */
export const menuSidebarActiveChrome = [
	'data-[active=true]:border-input data-[active=true]:bg-neutral-100 data-[active=true]:text-neutral-950 data-[active=true]:shadow-xs',
	'dark:data-[active=true]:bg-neutral-800 dark:data-[active=true]:text-neutral-50',
	'data-[active=true]:hover:bg-neutral-200 data-[active=true]:hover:text-neutral-950',
	'dark:data-[active=true]:hover:bg-neutral-700 dark:data-[active=true]:hover:text-neutral-50',
	'data-[active=true]:[&>svg]:text-neutral-950 dark:data-[active=true]:[&>svg]:text-neutral-50',
	'data-[active=true]:font-semibold',
].join(' ');
