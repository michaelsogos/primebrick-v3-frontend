<script lang="ts">
	import * as Popover from "$lib/components/ui/popover";
	import { Button } from "$lib/components/ui/button";
	import { Calendar } from "lucide-svelte";
	import { DateFormatter, getLocalTimeZone, today, CalendarDate } from "@internationalized/date";
	import { cn } from "$lib/utils";

	let { value = $bindable() } = $props();
	let isOpen = $state(false);

	const df = new DateFormatter("en-US", { dateStyle: "long" });

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
			node.style.scrollSnapType = "y mandatory";
			node.style.scrollBehavior = "smooth";
		};

		const onMouseUp = () => {
			if (!isDown) return;
			isDown = false;
			node.style.cursor = "grab";
			node.style.scrollSnapType = "y mandatory";
			node.style.scrollBehavior = "smooth";
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

	function updateDate(part: "day" | "month" | "year", val: number) {
		if (!value) value = today(getLocalTimeZone());
		try {
			value = value.set({ [part]: val });
		} catch (e) {
			// Fallback for short months (e.g. Feb 31st -> Feb 1st)
			if (part === "month" || part === "year") {
				value = new CalendarDate(value.year, value.month, 1).set({ [part]: val });
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
				class="h-12 w-full justify-between px-4 text-base font-normal border-border/50 hover:border-primary/50 transition-all"
			>
				<span class={cn(!value && "text-muted-foreground")}>
					{value ? df.format(value.toDate(getLocalTimeZone())) : "Select date"}
				</span>
				<Calendar class="ml-2 h-4 w-4 opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content class="w-[320px] p-0 shadow-2xl border-border rounded-2xl overflow-hidden bg-popover" align="start">
		<div class="bg-muted/30 p-3 text-center border-b text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground select-none">
			Scroll to select
		</div>

		<div class="relative flex h-[280px] bg-background select-none">
			<!-- Selection Indicator -->
			<div class="pointer-events-none absolute top-1/2 left-0 h-12 w-full -translate-y-1/2 border-y border-border/50 bg-muted/5 z-0"></div>

			<!-- DAY COLUMN -->
			<div use:dragToScroll class="flex-1 overflow-y-auto snap-y snap-mandatory scrollbar-hide z-20 cursor-grab active:cursor-grabbing">
				<div class="py-[116px]">
					{#each days as d}
						<button
							class={cn("h-12 w-full flex items-center justify-center snap-center text-sm transition-all", value?.day === d ? "text-primary font-bold text-lg" : "opacity-40 hover:opacity-100")}
							onclick={() => updateDate("day", d)}
						>
							{d}
						</button>
					{/each}
				</div>
			</div>

			<!-- MONTH COLUMN -->
			<div use:dragToScroll class="flex-[1.5] overflow-y-auto snap-y snap-mandatory scrollbar-hide z-20 border-x border-border/50 cursor-grab active:cursor-grabbing">
				<div class="py-[116px]">
					{#each months as m, i}
						<button
							class={cn("h-12 w-full flex items-center justify-center snap-center text-sm transition-all px-1 text-center", value?.month === i + 1 ? "text-primary font-bold text-lg" : "opacity-40 hover:opacity-100")}
							onclick={() => updateDate("month", i + 1)}
						>
							{m}
						</button>
					{/each}
				</div>
			</div>

			<!-- YEAR COLUMN -->
			<div use:dragToScroll class="flex-1 overflow-y-auto snap-y snap-mandatory scrollbar-hide z-20 cursor-grab active:cursor-grabbing">
				<div class="py-[116px]">
					{#each years as y}
						<button
							class={cn("h-12 w-full flex items-center justify-center snap-center text-sm transition-all", value?.year === y ? "text-primary font-bold text-lg" : "opacity-40 hover:opacity-100")}
							onclick={() => updateDate("year", y)}
						>
							{y}
						</button>
					{/each}
				</div>
			</div>
		</div>

		<!-- Footer -->
		<div class="p-3 border-t bg-muted/10 flex gap-2">
			<Button variant="ghost" class="flex-1 h-10" onclick={() => (isOpen = false)}>Cancel</Button>
			<Button class="flex-1 h-10 shadow-lg shadow-primary/20 font-semibold" onclick={() => (isOpen = false)}>Confirm</Button>
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