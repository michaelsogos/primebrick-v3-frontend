<script lang="ts">
	import { cn } from "$lib/utils.js";
	import Input from "$lib/components/ui/input/input.svelte";
	import * as Popover from "$lib/components/ui/popover";
	import * as Command from "$lib/components/ui/command";
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	type Option = { value: string; label: string; idp_name?: string };

	type Props = {
		value?: string;
		onChange?: (value: string) => void;
		options: Option[];
		placeholder?: string;
		disabled?: boolean;
		loading?: boolean;
		error?: string;
		id?: string;
		name?: string;
	};

	let {
		value = $bindable(),
		onChange,
		options,
		placeholder = "Select...",
		disabled = false,
		loading = false,
		error,
		id,
		name,
	}: Props = $props();

	// Internal state with default
	let internalValue = $state(value ?? "");
	let search = $state("");

	// Sync external changes to internal state
	$effect(() => {
		internalValue = value ?? "";
	});

	// Sync internal changes to external
	function handleChange(v: string) {
		internalValue = v;
		value = v;
		onChange?.(v);
	}

	let open = $state(false);

	let filteredOptions = $derived.by(() => {
		if (!search) return options;
		const lowerSearch = search.toLowerCase();
		return options.filter(opt =>
			opt.label.toLowerCase().includes(lowerSearch) ||
			opt.idp_name?.toLowerCase().includes(lowerSearch)
		);
	});

	let selectedOption = $derived(options.find(opt => opt.value === internalValue));

	function handleSelect(opt: Option) {
		handleChange(opt.value);
		open = false;
		search = "";
	}

	function handleClear() {
		handleChange("");
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props: triggerProps })}
			<div class="relative">
				<Input
					{...triggerProps}
					{id}
					{name}
					value={selectedOption?.label || internalValue}
					{placeholder}
					{disabled}
					readonly
					class="cursor-pointer pr-10"
				/>
				<div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
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
				placeholder="Search organizations..."
			/>
			<Command.List>
				{#if filteredOptions.length === 0}
					<Command.Empty>No organizations found</Command.Empty>
				{:else}
					{#each filteredOptions as option (option.value)}
						<Command.Item
							value={option.value}
							onSelect={() => handleSelect(option)}
						>
							<div class="flex flex-col">
								<span class="font-medium">{option.label}</span>
								{#if option.idp_name}
									<span class="text-xs text-muted-foreground">{option.idp_name}</span>
								{/if}
							</div>
						</Command.Item>
					{/each}
				{/if}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>

{#if error}
	<p class="text-destructive text-xs mt-1">{error}</p>
{/if}
