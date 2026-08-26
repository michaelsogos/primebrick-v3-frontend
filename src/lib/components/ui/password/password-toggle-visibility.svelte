<script lang="ts">
	import { Toggle } from '$lib/components/ui/toggle';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import { usePasswordToggleVisibility } from './password.svelte.js';
	import type { PasswordToggleVisibilityProps } from './types.js';
	import { cn } from '$lib/utils.js';
	import { inputTrailingIconButtonClasses } from '$lib/components/ui/input/input-chrome.js';

	let { ref = $bindable(null), class: className }: PasswordToggleVisibilityProps = $props();

	const state = usePasswordToggleVisibility();
</script>

<Toggle
	bind:ref
	aria-label={state.root.opts.hidden.current ? 'Show password' : 'Hide password'}
	bind:pressed={state.root.opts.hidden.current}
	class={cn(
		inputTrailingIconButtonClasses,
		'z-10',
		'data-[state=on]:bg-transparent',
		{
			'right-9 max-w-6': state.root.passwordState.copyMounted
		},
		className
	)}
	tabindex={-1}
>
	{#if state.root.opts.hidden.current}
		<EyeIcon class="size-4" />
	{:else}
		<EyeOffIcon class="size-4" />
	{/if}
</Toggle>
