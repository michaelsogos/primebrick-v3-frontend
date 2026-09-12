<script lang="ts">
  /**
   * SelectableRow — row container with left border coloring + click-to-toggle.
   *
   * Matches ConfigListRow pattern (lines 54-74) but generic — content goes
   * in a slot. The consumer controls the inner layout via the `class` prop.
   *
   * Left border (5px) colors based on state:
   * - `warning` prop (yellow) — e.g. tainted form fields
   * - `selected` prop (primary) — when row is selected
   * - default (border) — unselected
   *
   * Click-to-toggle: clicking anywhere on the row toggles selection,
   * EXCEPT when clicking on interactive elements (input, button, a, combobox,
   * etc.). This logic is copied verbatim from ConfigListRow line 64.
   */
  import type { Snippet } from 'svelte';

  let {
    id,
    selected = false,
    warning = false,
    disabled = false,
    on_toggle_select,
    children,
    class: klass = '',
  }: {
    id: string;
    selected?: boolean;
    warning?: boolean;
    disabled?: boolean;
    on_toggle_select: (id: string, checked: boolean) => void;
    children: Snippet;
    class?: string;
  } = $props();
</script>

<div
  class="rounded-lg border bg-background p-3 border-l-[5px] cursor-pointer select-none {warning ? 'border-l-warning' : selected ? 'border-l-primary' : 'border-l-border'} {klass}"
  role="button"
  tabindex={disabled ? -1 : 0}
  aria-pressed={selected}
  data-testid="selectable-row-{id}"
  onclick={(e) => {
    if (disabled) return;
    const target = e.target as HTMLElement;
    const interactive = target.closest('input, button, a, [role="combobox"], [role="listbox"], [role="option"], textarea, select, [data-no-row-toggle]');
    if (interactive && interactive !== e.currentTarget) return;
    on_toggle_select(id, !selected);
  }}
  onkeydown={(e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      on_toggle_select(id, !selected);
    }
  }}
>
  {@render children()}
</div>
