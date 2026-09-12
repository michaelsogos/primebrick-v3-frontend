<script lang="ts">
  /**
   * 5-bar vertical power level indicator for AI models.
   *
   * Bars 1-N are "lit" with their color (N = level).
   * Bars N+1 to 5 are muted/grey (disabled appearance).
   *
   * Colors left → right: red, orange, yellow, lime, green.
   * Level 5 (all green) is reserved for future powerful BE models.
   */
  let { level }: { level: number } = $props();

  const BAR_COLORS = [
    'bg-red-500',
    'bg-orange-500',
    'bg-yellow-400',
    'bg-lime-400',
    'bg-green-500',
  ];
</script>

<div class="flex items-end gap-0.5" data-testid="power-level-bars">
  {#each BAR_COLORS as color, i (i)}
    <div
      class="w-[3px] h-3 rounded-sm transition-opacity {i < level ? color + ' opacity-100' : 'bg-muted-foreground/30 opacity-100'}"
    ></div>
  {/each}
</div>
