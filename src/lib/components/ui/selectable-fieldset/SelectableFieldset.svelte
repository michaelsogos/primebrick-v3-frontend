<script lang="ts">
  /**
   * SelectableFieldset — visual wrapper with gradient label + gradient border.
   *
   * Matches the ConfigList group pattern (ConfigList.svelte lines 351-371):
   * - Gradient label: sky-400 → indigo-400, uppercase, positioned over the border
   * - Gradient border container: border-primary-gradient utility from app.css
   *
   * Position-agnostic: no sticky/absolute positioning. The consumer controls
   * layout (flex sibling, inline, etc.).
   */
  import type { Snippet } from 'svelte';

  let {
    label,
    children,
    class: klass = '',
  }: {
    label: string;
    children: Snippet;
    class?: string;
  } = $props();
</script>

<div class="pt-4 first:pt-0">
  <h3 class="self-start text-xs font-semibold uppercase tracking-wide bg-linear-to-br from-sky-400 to-indigo-400 text-white px-3 pt-1 pb-1 rounded-t-md relative z-10 w-fit ml-3">
    {label}
  </h3>
  <div class="border-primary-gradient rounded-lg px-3 pt-3 pb-3 space-y-3 {klass}">
    {@render children()}
  </div>
</div>
