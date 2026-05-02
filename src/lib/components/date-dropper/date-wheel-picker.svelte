<script lang="ts">
	import * as Popover from "$lib/components/ui/popover";
	import { Button } from "$lib/components/ui/button";
	import { Calendar } from "lucide-svelte";
	import { DateFormatter, getLocalTimeZone, today, CalendarDate } from "@internationalized/date";
	import { cn } from "$lib/utils";
	import { inputControlHoverClasses } from "$lib/components/ui/input/input-chrome";
	import WheelPicker from "$lib/components/ui/wheel-picker/wheel-picker.svelte";
	import WheelPickerItem from "$lib/components/ui/wheel-picker/wheel-picker-item.svelte";
	import WheelPickerGroup from "$lib/components/ui/wheel-picker/wheel-picker-group.svelte";

	let { value = $bindable() } = $props();
	let isOpen = $state(false);

	const df = new DateFormatter("en-US", { dateStyle: "long" });

	// Generate date data
	const days = Array.from({ length: 31 }, (_, i) => (i + 1).toString());
	const months = [
		"January", "February", "March", "April", "May", "June",
		"July", "August", "September", "October", "November", "December"
	];
	const currentYear = today(getLocalTimeZone()).year;
	const years = Array.from({ length: 100 }, (_, i) => (currentYear - 80 + i).toString());

	let selectedDay = $state("");
	let selectedMonth = $state("");
	let selectedYear = $state("");

	// Initialize from value
	$effect(() => {
		if (value) {
			selectedDay = value.day.toString();
			selectedMonth = months[value.month - 1];
			selectedYear = value.year.toString();
		}
	});

	// Update value when selections change
	function updateValue() {
		if (selectedDay && selectedMonth && selectedYear) {
			const monthIndex = months.indexOf(selectedMonth);
			if (monthIndex !== -1) {
				try {
					value = new CalendarDate(
						parseInt(selectedYear),
						monthIndex + 1,
						parseInt(selectedDay)
					);
				} catch (e) {
					// Handle invalid dates (e.g., Feb 30)
					const tempDate = new CalendarDate(
						parseInt(selectedYear),
						monthIndex + 1,
						1
					);
					const lastDay = tempDate.calendar.getDaysInMonth(tempDate);
					value = new CalendarDate(
						parseInt(selectedYear),
						monthIndex + 1,
						Math.min(parseInt(selectedDay), lastDay)
					);
				}
			}
		}
	}

	$effect(() => {
		updateValue();
	});
</script>

<Popover.Root bind:open={isOpen}>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				class="w-full justify-between font-normal border-input bg-background dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] {inputControlHoverClasses}"
			>
				<span class={cn(!value && "text-muted-foreground")}>
					{value ? df.format(value.toDate(getLocalTimeZone())) : "Select date"}
				</span>
				<Calendar class="ml-2 h-4 w-4 opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content class="w-[320px] p-0 shadow-2xl border-border rounded-2xl overflow-hidden bg-popover" align="start">
		<WheelPicker>
			<WheelPickerGroup bind:value={selectedDay} onValueChange={() => {}}>
				{#each days as day}
					<WheelPickerItem value={day}>
						{day}
					</WheelPickerItem>
				{/each}
			</WheelPickerGroup>
			<WheelPickerGroup bind:value={selectedMonth} onValueChange={() => {}}>
				{#each months as month}
					<WheelPickerItem value={month}>
						{month.slice(0, 3)}
					</WheelPickerItem>
				{/each}
			</WheelPickerGroup>
			<WheelPickerGroup bind:value={selectedYear} onValueChange={() => {}}>
				{#each years as year}
					<WheelPickerItem value={year}>
						{year}
					</WheelPickerItem>
				{/each}
			</WheelPickerGroup>
		</WheelPicker>

		<!-- Footer -->
		<div class="p-3 border-t bg-muted/10 flex gap-2">
			<Button variant="ghost" size="sm" class="flex-1 text-muted-foreground" onclick={() => (isOpen = false)}>Cancel</Button>
			<Button variant="ghost" size="sm" class="flex-1 text-primary font-medium" onclick={() => (isOpen = false)}>Confirm</Button>
		</div>
	</Popover.Content>
</Popover.Root>
