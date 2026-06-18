<script lang="ts">
	import { cn } from "$lib/utils.js";
	import * as Popover from "$lib/components/ui/popover";
	import * as Command from "$lib/components/ui/command";
	import Badge from "$lib/components/ui/badge/badge.svelte";
	import X from '@lucide/svelte/icons/x';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	type Props = {
		value?: string[];
		onChange?: (value: string[]) => void;
		options: string[];
		placeholder?: string;
		disabled?: boolean;
		loading?: boolean;
		id?: string;
		name?: string;
	};

	let {
		value = $bindable(),
		onChange,
		options,
		placeholder = "Select roles...",
		disabled = false,
		loading = false,
		id,
		name,
	}: Props = $props();

	// Internal state with default
	let internalValue = $state(value ?? []);
	let search = $state("");

	// Sync external changes to internal state
	$effect(() => {
		internalValue = value ?? [];
	});

	// Sync internal changes to external
	function handleChange(v: string[]) {
		internalValue = v;
		value = v;
		onChange?.(v);
	}

	let open = $state(false);

	let filteredOptions = $derived.by(() => {
		if (!search) return options;
		const lowerSearch = search.toLowerCase();
		return options.filter(opt =>
			opt.toLowerCase().includes(lowerSearch) &&
			!internalValue.includes(opt)
		);
	});

	function handleToggle(role: string) {
		if (internalValue.includes(role)) {
			handleChange(internalValue.filter(r => r !== role));
		} else {
			handleChange([...internalValue, role]);
		}
	}

	function handleRemove(role: string) {
		handleChange(internalValue.filter(r => r !== role));
	}
</script>

<div class="space-y-2">
	<Popover.Root bind:open>
		<Popover.Trigger>
			{#snippet child({ props: triggerProps })}
				<div
					{...triggerProps}
					{id}
					class={cn(
						"min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
						"focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
						"disabled:cursor-not-allowed disabled:opacity-50",
						"cursor-pointer flex flex-wrap gap-2 items-center"
					)}
				>
					{#if internalValue.length === 0}
						<span class="text-muted-foreground">{placeholder}</span>
					{:else}
						{#each internalValue as role (role)}
							<Badge variant="secondary" class="gap-1">
								{role}
								<button
									type="button"
									onclick={(e) => {
										e.stopPropagation();
										handleRemove(role);
									}}
									class="rounded-full hover:bg-destructive/20 p-0.5"
								>
									<X class="h-3 w-3" />
								</button>
							</Badge>
						{/each}
					{/if}
					<div class="ml-auto">
						{#if loading}
							<div class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
						{:else}
							<ChevronDown class="h-4 w-4 text-muted-foreground" />
						{/if}
					</div>
				</div>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-full p-0">
			<Command.Root>
				<Command.Input
					bind:value={search}
					placeholder="Search roles..."
				/>
				<Command.List>
					{#if filteredOptions.length === 0}
						<Command.Empty>No roles found</Command.Empty>
					{:else}
						{#each filteredOptions as option (option)}
							<Command.Item
								value={option}
								onSelect={() => handleToggle(option)}
							>
								<div class="flex items-center gap-2">
									<div class={cn(
										"h-4 w-4 rounded border",
										internalValue.includes(option) ? "bg-primary border-primary" : "border-input"
									)}>
										{#if internalValue.includes(option)}
											<svg class="h-3 w-3 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
												<path d="M20 6L9 17l-5-5" />
											</svg>
										{/if}
									</div>
									<span>{option}</span>
								</div>
							</Command.Item>
						{/each}
					{/if}
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>
</div>
