<script lang="ts" module>
  /**
   * Donut gauge — SVG ring with numeric score at center.
   *
   * Used for POWER, AFFIDABILITY, and RANK indicators on the AI models page.
   * Value range is 0-5 by default. Color scales with value:
   *   0-1 red, 2 orange, 3 yellow, 4 lime, 5 green.
   */
  export function gaugeColor(value: number, max: number): string {
    const ratio = value / max;
    if (ratio >= 0.9) return '#22c55e'; // green-500
    if (ratio >= 0.7) return '#84cc16'; // lime-500
    if (ratio >= 0.5) return '#eab308'; // yellow-500
    if (ratio >= 0.3) return '#f97316'; // orange-500
    return '#ef4444'; // red-500
  }
</script>

<script lang="ts">
  let {
    value,
    max = 5,
    label,
    size = 36,
  }: {
    value: number;
    max?: number;
    label?: string;
    size?: number;
  } = $props();

  const stroke = $derived(Math.max(3, size * 0.1));
  const radius = $derived((size - stroke) / 2);
  const circumference = $derived(2 * Math.PI * radius);
  const ratio = $derived(Math.max(0, Math.min(1, value / max)));
  const dashOffset = $derived(circumference * (1 - ratio));
  const color = $derived(gaugeColor(value, max));
  const displayValue = $derived(
    Number.isInteger(value) ? String(value) : value.toFixed(1),
  );
  const fontSize = $derived(Math.round(size * 0.32));
</script>

<div
  class="inline-flex flex-col items-center gap-0.5"
  data-testid="score-gauge"
  title={label ?? ''}
>
  <div class="relative" style="width:{size}px; height:{size}px;">
    <svg
      width={size}
      height={size}
      viewBox="0 0 {size} {size}"
      class="-rotate-90"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        stroke-width={stroke}
        class="text-muted-foreground/20"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        stroke-width={stroke}
        stroke-linecap="round"
        stroke-dasharray={circumference}
        stroke-dashoffset={dashOffset}
        class="transition-all duration-500"
      />
    </svg>
    <span
      class="absolute inset-0 flex items-center justify-center font-bold leading-none"
      style="font-size:{fontSize}px;"
    >
      {displayValue}
    </span>
  </div>
  {#if label}
    <span class="text-[8px] text-muted-foreground uppercase tracking-wide">{label}</span>
  {/if}
</div>
