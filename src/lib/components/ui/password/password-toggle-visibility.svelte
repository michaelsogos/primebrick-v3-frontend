<script lang="ts">
	import { Toggle } from '$lib/components/ui/toggle';
	import { Eye as EyeIcon } from '@primebrick/ui/vendor/lucide';
	import { EyeOff as EyeOffIcon } from '@primebrick/ui/vendor/lucide';
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
			'right-10 max-w-6': state.root.passwordState.copyMounted
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
