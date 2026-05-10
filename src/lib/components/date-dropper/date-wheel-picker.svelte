<script lang="ts">
	import * as Popover from "$lib/components/ui/popover";
	import { Button } from "$lib/components/ui/button";
	import { Calendar, ChevronsUpDown } from "lucide-svelte";
	import { DateFormatter, getLocalTimeZone, today, now, CalendarDate, CalendarDateTime } from "@internationalized/date";
	import { cn } from "$lib/utils";
	import { inputControlHoverClasses } from "$lib/components/ui/input/input-chrome";
	import WheelPicker from "$lib/components/ui/wheel-picker/wheel-picker.svelte";
	import WheelPickerItem from "$lib/components/ui/wheel-picker/wheel-picker-item.svelte";
	import WheelPickerGroup from "$lib/components/ui/wheel-picker/wheel-picker-group.svelte";
	import { t } from "$lib/i18n";
	import { uiLang } from "$lib/i18n/store.svelte";
	import {
		Tabs,
		TabsList,
		TabsTrigger,
		TabsContent,
	} from "$lib/components/ui/tabs/index.js";
	import { getResolvedIanaTimeZone } from "$lib/browser-iana-timezone";
	import { onMount } from "svelte";
	import { Input } from "$lib/components/ui/input";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import { dropdownMenuItemWithSelectedClass } from "$lib/components/ui/dropdown-menu/dropdown-menu-item-selected";

	let { value = $bindable(), placeholder = $t("common.selectDate"), includeTime = false, defaultTime = undefined, timezone = $bindable() } = $props();
	let isOpen = $state(false);
	let activeTab = $derived(includeTime ? "date" : "date");

	let df = $derived(new DateFormatter($uiLang, includeTime ? { dateStyle: "long", timeStyle: "medium" } : { dateStyle: "long" }));
	let monthFormatter = $derived(new DateFormatter($uiLang, { month: "short" }));
	let timeFormatter = $derived(new DateFormatter($uiLang, { timeStyle: "short" }));

	// Generate date data
	const days = Array.from({ length: 31 }, (_, i) => (i + 1).toString());
	const months = Array.from({ length: 12 }, (_, i) =>
		monthFormatter.format(new CalendarDate(today(getLocalTimeZone()).year, i + 1, 1).toDate(getLocalTimeZone()))
	);
	const currentYear = today(getLocalTimeZone()).year;
	const years = Array.from({ length: 100 }, (_, i) => (currentYear - 50 + i).toString());
	const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
	const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));
	const seconds = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));

	// Compute initial time values
	function getInitialTime() {
		if (defaultTime) {
			const [hours, minutes, seconds] = defaultTime.split(":").map(Number);
			return {
				hour: hours.toString().padStart(2, "0"),
				minute: minutes.toString().padStart(2, "0"),
				second: (seconds || 0).toString().padStart(2, "0")
			};
		} else if (includeTime) {
			const currentTime = now(getLocalTimeZone());
			return {
				hour: currentTime.hour.toString().padStart(2, "0"),
				minute: currentTime.minute.toString().padStart(2, "0"),
				second: currentTime.second.toString().padStart(2, "0")
			};
		}
		return { hour: "00", minute: "00", second: "00" };
	}

	const initialTime = getInitialTime();

	let selectedDay = $state("");
	let selectedMonth = $state("");
	let selectedYear = $state("");
	let selectedHour = $state(initialTime.hour);
	let selectedMinute = $state(initialTime.minute);
	let selectedSecond = $state(initialTime.second);
	let hasUserInteracted = $state(false);

	// Timezone state
	let selectedTimezone = $state<string>("UTC");
	let browserTimezone = $state<string | null>(null);
	let timezoneSearch = $state("");

	onMount(() => {
		browserTimezone = getResolvedIanaTimeZone();
		if (browserTimezone) {
			selectedTimezone = browserTimezone;
		}
	});

	// Sync timezone with prop
	$effect(() => {
		timezone = selectedTimezone;
	});

	// Get all IANA timezones supported by the browser
	const allTimezones = $derived(() => {
		let timezones: string[];
		try {
			timezones = Intl.supportedValuesOf('timeZone').sort();
		} catch {
			// Fallback to common timezones if Intl.supportedValuesOf is not supported
			timezones = [
				"UTC",
				"Europe/Rome",
				"Europe/London",
				"Europe/Paris",
				"Europe/Berlin",
				"Europe/Madrid",
				"America/New_York",
				"America/Los_Angeles",
				"America/Chicago",
				"Asia/Tokyo",
				"Asia/Shanghai",
				"Asia/Dubai",
				"Australia/Sydney",
				"Australia/Melbourne",
			];
		}
		return timezones;
	});

	// Filter timezones based on search
	const filteredTimezones = $derived(() => {
		if (!timezoneSearch) return allTimezones();
		const search = timezoneSearch.toLowerCase();
		return allTimezones().filter(tz => tz.toLowerCase().includes(search));
	});

	// Refresh time to NOW each time the popover opens (if user hasn't interacted and no value set)
	$effect(() => {
		if (isOpen && includeTime && !hasUserInteracted && !value) {
			const fresh = getInitialTime();
			selectedHour = fresh.hour;
			selectedMinute = fresh.minute;
			selectedSecond = fresh.second;
		}
	});

	// Initialize wheelers to today if no value provided, otherwise sync with value
	$effect(() => {
		if (value) {
			selectedDay = value.day.toString();
			selectedMonth = months[value.month - 1];
			selectedYear = value.year.toString();
			if (includeTime && "hour" in value) {
				selectedHour = value.hour.toString().padStart(2, "0");
				selectedMinute = value.minute.toString().padStart(2, "0");
				selectedSecond = value.second.toString().padStart(2, "0");
			}
		} else if (!hasUserInteracted) {
			const todayDate = today(getLocalTimeZone());
			selectedDay = todayDate.day.toString();
			selectedMonth = months[todayDate.month - 1];
			selectedYear = todayDate.year.toString();
		}
	});

	// Reset to today when value is cleared
	$effect(() => {
		if (!value && hasUserInteracted) {
			hasUserInteracted = false;
			const todayDate = today(getLocalTimeZone());
			selectedDay = todayDate.day.toString();
			selectedMonth = months[todayDate.month - 1];
			selectedYear = todayDate.year.toString();
			selectedHour = "00";
			selectedMinute = "00";
			selectedSecond = "00";
		}
	});

	// Update value when selections change
	function updateValue() {
		hasUserInteracted = true;
		if (selectedDay && selectedMonth && selectedYear) {
			const monthIndex = months.indexOf(selectedMonth);
			if (monthIndex !== -1) {
				try {
					if (includeTime) {
						value = new CalendarDateTime(
							parseInt(selectedYear),
							monthIndex + 1,
							parseInt(selectedDay),
							parseInt(selectedHour),
							parseInt(selectedMinute),
							parseInt(selectedSecond)
						);
					} else {
						value = new CalendarDate(
							parseInt(selectedYear),
							monthIndex + 1,
							parseInt(selectedDay)
						);
					}
				} catch (e) {
					// Handle invalid dates (e.g., Feb 30)
					const tempDate = new CalendarDate(
						parseInt(selectedYear),
						monthIndex + 1,
						1
					);
					const lastDay = tempDate.calendar.getDaysInMonth(tempDate);
					const validDay = Math.min(parseInt(selectedDay), lastDay);
					if (includeTime) {
						value = new CalendarDateTime(
							parseInt(selectedYear),
							monthIndex + 1,
							validDay,
							parseInt(selectedHour),
							parseInt(selectedMinute),
							parseInt(selectedSecond)
						);
					} else {
						value = new CalendarDate(
							parseInt(selectedYear),
							monthIndex + 1,
							validDay
						);
					}
				}
			}
		}
	}
</script>

<Popover.Root bind:open={isOpen}>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				class="w-full justify-between font-normal border-input bg-background dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] {inputControlHoverClasses}"
			>
				<span class={cn(!value && "text-muted-foreground/70 text-xs")}>
					{value ? df.format(value.toDate(getLocalTimeZone())) : placeholder}
				</span>
				<Calendar class="ml-2 h-4 w-4 opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content class="w-[320px] p-0 shadow-2xl border-border rounded-none overflow-hidden bg-popover" align="start">
		{#if includeTime}
			<Tabs bind:value={activeTab} class="flex flex-col h-full">
				<TabsList class="relative w-full h-10 py-1 px-4 bg-muted/50 flex-shrink-0 rounded-none border-b">
					<TabsTrigger
						value="date"
						class="relative z-10 rounded-full bg-transparent transition-colors data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:ring-0 flex-1"
					>
						{#if activeTab === "date"}
							<div
								class="absolute inset-0 z-[-1] rounded-full border border-neutral-300 bg-white shadow-sm dark:border-neutral-600 dark:bg-background dark:shadow-white/10"
							></div>
						{/if}
						<span class="relative z-20">{$t("common.date")}</span>
					</TabsTrigger>
					<TabsTrigger
						value="time"
						class="relative z-10 rounded-full bg-transparent transition-colors data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:ring-0 flex-1"
					>
						{#if activeTab === "time"}
							<div
								class="absolute inset-0 z-[-1] rounded-full border border-neutral-300 bg-white shadow-sm dark:border-neutral-600 dark:bg-background dark:shadow-white/10"
							></div>
						{/if}
						<span class="relative z-20">{$t("common.time")}</span>
					</TabsTrigger>
				</TabsList>

				{#if activeTab === "time" && includeTime}
					<div class="px-4 py-2 border-b border-border">
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<button
										{...props}
										class="w-full text-sm bg-background border border-input rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring flex justify-between items-center"
									>
										{selectedTimezone || "Select timezone"}
										<ChevronsUpDown class="ml-2 size-4 shrink-0 opacity-50" />
									</button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content class="w-full min-w-52 max-h-80 overflow-y-auto">
								<div class="p-2 sticky top-0 bg-background border-b">
									<Input
										bind:value={timezoneSearch}
										placeholder="Search timezone..."
										class="text-sm"
										onkeydown={(e) => e.stopPropagation()}
									/>
								</div>
								{#if filteredTimezones().length === 0}
									<div class="px-2 py-4 text-sm text-muted-foreground text-center">
										No timezone found
									</div>
								{:else}
									{#each filteredTimezones() as tz}
										<DropdownMenu.Item
											onSelect={() => {
												selectedTimezone = tz;
												timezoneSearch = "";
											}}
											class={dropdownMenuItemWithSelectedClass("flex items-center gap-2", tz === selectedTimezone)}
										>
											{tz}
										</DropdownMenu.Item>
									{/each}
								{/if}
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</div>
				{/if}

				<TabsContent value="date" class="flex-1 overflow-hidden mt-0">
					{#if activeTab === "date"}
						<WheelPicker>
							<WheelPickerGroup bind:value={selectedDay} onValueChange={updateValue}>
								{#each days as day}
									<WheelPickerItem value={day}>
										{day}
									</WheelPickerItem>
								{/each}
							</WheelPickerGroup>
							<WheelPickerGroup bind:value={selectedMonth} onValueChange={updateValue}>
								{#each months as month}
									<WheelPickerItem value={month}>
										{month.slice(0, 3)}
									</WheelPickerItem>
								{/each}
							</WheelPickerGroup>
							<WheelPickerGroup bind:value={selectedYear} onValueChange={updateValue}>
								{#each years as year}
									<WheelPickerItem value={year}>
										{year}
									</WheelPickerItem>
								{/each}
							</WheelPickerGroup>
						</WheelPicker>
					{/if}
				</TabsContent>

				<TabsContent value="time" class="flex-1 overflow-hidden mt-0">
					{#if activeTab === "time"}
						<WheelPicker>
							<WheelPickerGroup bind:value={selectedHour} onValueChange={updateValue}>
								{#each hours as hour}
									<WheelPickerItem value={hour}>
										{hour}
									</WheelPickerItem>
								{/each}
							</WheelPickerGroup>
							<WheelPickerGroup bind:value={selectedMinute} onValueChange={updateValue}>
								{#each minutes as minute}
									<WheelPickerItem value={minute}>
										{minute}
									</WheelPickerItem>
								{/each}
							</WheelPickerGroup>
							<WheelPickerGroup bind:value={selectedSecond} onValueChange={updateValue}>
								{#each seconds as second}
									<WheelPickerItem value={second}>
										{second}
									</WheelPickerItem>
								{/each}
							</WheelPickerGroup>
						</WheelPicker>
					{/if}
				</TabsContent>
			</Tabs>
		{:else}
			<WheelPicker>
				<WheelPickerGroup bind:value={selectedDay} onValueChange={updateValue}>
					{#each days as day}
						<WheelPickerItem value={day}>
							{day}
						</WheelPickerItem>
					{/each}
				</WheelPickerGroup>
				<WheelPickerGroup bind:value={selectedMonth} onValueChange={updateValue}>
					{#each months as month}
						<WheelPickerItem value={month}>
							{month.slice(0, 3)}
						</WheelPickerItem>
					{/each}
				</WheelPickerGroup>
				<WheelPickerGroup bind:value={selectedYear} onValueChange={updateValue}>
					{#each years as year}
						<WheelPickerItem value={year}>
							{year}
						</WheelPickerItem>
					{/each}
				</WheelPickerGroup>
			</WheelPicker>
		{/if}

		<!-- Footer -->
		<div class="p-3 border-t bg-muted/10 flex gap-2">
			<Button variant="ghost" size="sm" class="flex-1 text-muted-foreground" onclick={() => (isOpen = false)}>{$t("common.close")}</Button>
			<Button variant="ghost" size="sm" class="flex-1 text-primary font-medium" onclick={() => { updateValue(); isOpen = false; }}>{$t("common.done")}</Button>
		</div>
	</Popover.Content>
</Popover.Root>
