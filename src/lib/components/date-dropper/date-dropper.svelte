<script lang="ts">
	import * as Popover from "$lib/components/ui/popover";
	import { Button } from "$lib/components/ui/button";
	import { Calendar } from "lucide-svelte";
	import { DateFormatter, getLocalTimeZone, today, CalendarDate } from "@internationalized/date";
	import { cn } from "$lib/utils";
	import { inputControlHoverClasses } from "$lib/components/ui/input/input-chrome";

	let { value = $bindable() } = $props();
	let isOpen = $state(false);
	let isInitialScroll = $state(false);

	const df = new DateFormatter("en-US", { dateStyle: "long" });

	// Refs for scroll containers
	let dayScrollContainer: HTMLElement;
	let monthScrollContainer: HTMLElement;
	let yearScrollContainer: HTMLElement;

	/**
	 * Intersection Observer to detect centered element
	 */
	function setupScrollObserver(container: HTMLElement, part: "day" | "month" | "year", items: any[]) {
		const observer = new IntersectionObserver(
			(entries) => {
				// Skip updates during initial scroll
				if (isInitialScroll) return;

				entries.forEach((entry) => {
					if (entry.isIntersecting && entry.intersectionRatio > 0.8) {
						const index = Array.from(container.children[0].children).indexOf(entry.target as HTMLElement);
						if (index !== -1) {
							const val = part === "month" ? index + 1 : items[index];
							if (!value) value = today(getLocalTimeZone());
							try {
								value = value.set({ [part]: val });
							} catch (e) {
								if (part === "month" || part === "year") {
									value = new CalendarDate(value.year, value.month, 1).set({ [part]: val });
								}
							}
						}
					}
				});
			},
			{
				root: container,
				threshold: [0.8, 1],
				rootMargin: "-100px 0px -100px 0px"
			}
		);

		// Observe all buttons in the container
		const buttons = container.querySelectorAll("button");
		buttons.forEach((btn) => observer.observe(btn));

		return () => observer.disconnect();
	}

	// Setup observers when popover opens
	$effect(() => {
		if (isOpen && dayScrollContainer && monthScrollContainer && yearScrollContainer) {
			// Scroll to current value position on open
			if (value) {
				isInitialScroll = true;

				const dayButton = dayScrollContainer.querySelector(`button:nth-child(${value.day})`) as HTMLElement;
				const monthButton = monthScrollContainer.querySelector(`button:nth-child(${value.month})`) as HTMLElement;
				const yearIndex = years.indexOf(value.year);
				const yearButton = yearScrollContainer.querySelector(`button:nth-child(${yearIndex + 1})`) as HTMLElement;

				// Scroll to position without triggering observer
				requestAnimationFrame(() => {
					dayButton?.scrollIntoView({ behavior: "auto", block: "center" });
					monthButton?.scrollIntoView({ behavior: "auto", block: "center" });
					yearButton?.scrollIntoView({ behavior: "auto", block: "center" });

					// Re-enable observer after scroll
					setTimeout(() => {
						isInitialScroll = false;
					}, 150);
				});
			}

			const cleanupDay = setupScrollObserver(dayScrollContainer, "day", days);
			const cleanupMonth = setupScrollObserver(monthScrollContainer, "month", months);
			const cleanupYear = setupScrollObserver(yearScrollContainer, "year", years);

			return () => {
				cleanupDay();
				cleanupMonth();
				cleanupYear();
			};
		}
	});

	/**
	 * Dataset generation 
	 */
	const days = Array.from({ length: 31 }, (_, i) => i + 1);
	const months = [
		"January", "February", "March", "April", "May", "June",
		"July", "August", "September", "October", "November", "December"
	];
	const currentYear = today(getLocalTimeZone()).year;
	const years = Array.from({ length: 100 }, (_, i) => currentYear - 80 + i);

	/**
	 * Mouse Drag-to-Scroll Logic
	 * Removes resistance and handles mouse movement like touch input
	 */
	function dragToScroll(node: HTMLElement) {
		let isDown = false;
		let startY: number;
		let scrollTop: number;

		const onMouseDown = (e: MouseEvent) => {
			isDown = true;
			node.style.cursor = "grabbing";
			node.style.scrollSnapType = "none";
			node.style.scrollBehavior = "auto";
			startY = e.pageY - node.offsetTop;
			scrollTop = node.scrollTop;
		};

		const onMouseLeave = () => {
			if (!isDown) return;
			isDown = false;
			node.style.cursor = "grab";
			// Find nearest snap position and scroll to it
			snapToNearest(node);
		};

		const onMouseUp = () => {
			if (!isDown) return;
			isDown = false;
			node.style.cursor = "grab";
			// Find nearest snap position and scroll to it
			snapToNearest(node);
		};

		const onMouseMove = (e: MouseEvent) => {
			if (!isDown) return;
			e.preventDefault();
			const y = e.pageY - node.offsetTop;
			const walk = (y - startY) * 1.5;
			node.scrollTop = scrollTop - walk;
		};

		node.addEventListener("mousedown", onMouseDown);
		window.addEventListener("mouseup", onMouseUp);
		node.addEventListener("mouseleave", onMouseLeave);
		node.addEventListener("mousemove", onMouseMove);

		return {
			destroy() {
				node.removeEventListener("mousedown", onMouseDown);
				window.removeEventListener("mouseup", onMouseUp);
				node.removeEventListener("mouseleave", onMouseLeave);
				node.removeEventListener("mousemove", onMouseMove);
			}
		};
	}

	// Helper to snap to nearest item after drag ends
	function snapToNearest(container: HTMLElement) {
		const itemHeight = 48;
		const padding = 116;
		const containerHeight = 280;
		const center = containerHeight / 2;

		const currentScroll = container.scrollTop;
		// Calculate which item is closest to center
		// Item position in content: padding + index * itemHeight
		// We want: padding + index * itemHeight - currentScroll = center
		// So: index = (currentScroll + center - padding) / itemHeight
		const index = Math.round((currentScroll + center - padding) / itemHeight);
		const targetScroll = (index * itemHeight) - center + padding;

		container.style.scrollSnapType = "y mandatory";
		container.style.scrollBehavior = "smooth";
		container.scrollTop = Math.max(0, targetScroll);
	}

	function updateDate(part: "day" | "month" | "year", val: number, element?: HTMLElement) {
		if (!value) value = today(getLocalTimeZone());
		try {
			value = value.set({ [part]: val });
		} catch (e) {
			// Fallback for short months (e.g. Feb 31st -> Feb 1st)
			if (part === "month" || part === "year") {
				value = new CalendarDate(value.year, value.month, 1).set({ [part]: val });
			}
		}
		
		// Scroll the clicked element to center
		if (element) {
			element.scrollIntoView({ behavior: "smooth", block: "center" });
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
				<span class={cn(!value && "text-muted-foreground")}>
					{value ? df.format(value.toDate(getLocalTimeZone())) : "Select date"}
				</span>
				<Calendar class="ml-2 h-4 w-4 opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content class="w-[320px] p-0 shadow-2xl border-border rounded-2xl overflow-hidden bg-popover" align="start">
		<div class="relative flex h-[280px] bg-background select-none">
			<!-- Selection Indicator -->
			<div class="pointer-events-none absolute top-1/2 left-0 h-12 w-full -translate-y-1/2 border-y border-border/50 bg-sky-100/50 dark:bg-zinc-800/30 z-0"></div>

			<!-- DAY COLUMN -->
			<div bind:this={dayScrollContainer} use:dragToScroll class="flex-1 overflow-y-auto snap-y snap-mandatory scrollbar-hide z-20 cursor-grab active:cursor-grabbing">
				<div class="py-[116px]">
					{#each days as d}
						<button
							class={cn("h-12 w-full flex items-center justify-center snap-center text-sm transition-all", value?.day === d ? "text-primary font-bold text-lg" : "opacity-40 hover:opacity-100")}
							onclick={(e) => updateDate("day", d, e.currentTarget as HTMLElement)}
						>
							{d}
						</button>
					{/each}
				</div>
			</div>

			<!-- MONTH COLUMN -->
			<div bind:this={monthScrollContainer} use:dragToScroll class="flex-[1.5] overflow-y-auto snap-y snap-mandatory scrollbar-hide z-20 border-x border-border/50 cursor-grab active:cursor-grabbing">
				<div class="py-[116px]">
					{#each months as m, i}
						<button
							class={cn("h-12 w-full flex items-center justify-center snap-center text-sm transition-all px-1 text-center", value?.month === i + 1 ? "text-primary font-bold text-lg" : "opacity-40 hover:opacity-100")}
							onclick={(e) => updateDate("month", i + 1, e.currentTarget as HTMLElement)}
						>
							{m}
						</button>
					{/each}
				</div>
			</div>

			<!-- YEAR COLUMN -->
			<div bind:this={yearScrollContainer} use:dragToScroll class="flex-1 overflow-y-auto snap-y snap-mandatory scrollbar-hide z-20 cursor-grab active:cursor-grabbing">
				<div class="py-[116px]">
					{#each years as y}
						<button
							class={cn("h-12 w-full flex items-center justify-center snap-center text-sm transition-all", value?.year === y ? "text-primary font-bold text-lg" : "opacity-40 hover:opacity-100")}
							onclick={(e) => updateDate("year", y, e.currentTarget as HTMLElement)}
						>
							{y}
						</button>
					{/each}
				</div>
			</div>
		</div>

		<!-- Footer -->
		<div class="p-3 border-t bg-muted/10 flex gap-2">
			<Button variant="ghost" size="sm" class="flex-1 text-muted-foreground" onclick={() => (isOpen = false)}>Cancel</Button>
			<Button variant="ghost" size="sm" class="flex-1 text-primary font-medium" onclick={() => (isOpen = false)}>Confirm</Button>
		</div>
	</Popover.Content>
</Popover.Root>

<style>
	.scrollbar-hide::-webkit-scrollbar { display: none; }
	.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
	.overflow-y-auto { 
		scroll-behavior: smooth; 
		-webkit-overflow-scrolling: touch;
	}
</style>