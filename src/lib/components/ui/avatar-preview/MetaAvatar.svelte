<script lang="ts">
	/**
	 * MetaAvatar — the `type:"avatar"` metadata renderer. Pure display:
	 * initials carried by the column's own value, color read from the
	 * sibling `avatar.color_field` column (same pattern as `uom.field`).
	 * Used by TableCell (list) and FormFieldDispatcher (record-sheet
	 * preview) — never an input, no user interaction.
	 */
	import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
	import { cn } from '$lib/utils';
	import {
		avatarFallbackChromeClasses,
		avatarGradientCss,
		computeAvatarGradient,
	} from '$lib/avatar-chrome-palette';

	let {
		initials,
		color,
		size = 'md',
	}: {
		/** The avatar column's own value — the stored initials. */
		initials: string | undefined;
		/** The sibling `avatar.color_field` value — a hex color. */
		color: string | undefined;
		size?: 'sm' | 'md';
	} = $props();

	const gradientStyle = $derived.by(() => {
		if (!color) return '';
		const g = computeAvatarGradient(color);
		return `background: ${avatarGradientCss(color)}; color: ${g.textColor};`;
	});
	const seed = $derived(initials?.trim() ? initials.trim() : '??');
</script>

<Avatar
	class={cn('rounded-none avatar-hex', size === 'sm' ? 'size-7' : 'size-10')}
>
	<AvatarFallback
		class={cn(
			'rounded-none font-semibold',
			size === 'sm' ? 'text-xs' : 'text-base',
			color ? '' : avatarFallbackChromeClasses(seed),
		)}
		style={gradientStyle}
	>
		{seed}
	</AvatarFallback>
</Avatar>
