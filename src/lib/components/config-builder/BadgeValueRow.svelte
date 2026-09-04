<script lang="ts">
  import { Label } from '$lib/components/ui/label';
  import { TextInput } from '$lib/components/ui/input';
  import type { ConfigEntryType } from '$lib/api-types';
  import { autoErrorLabelKey } from '$lib/config/type-config-schema';
  import type { useTypeConfigBuilder } from '$lib/config/type-config-builder.svelte';

  let {
    value,
    labelKey,
    color,
    onValueChange,
    onLabelKeyChange,
    onColorChange,
    onRemove,
  }: {
    value: string;
    labelKey: string;
    color: string;
    onValueChange: (v: string) => void;
    onLabelKeyChange: (v: string) => void;
    onColorChange: (v: string) => void;
    onRemove: () => void;
  } = $props();
</script>

<div class="flex items-center gap-2">
  <TextInput
    value={value}
    oninput={(e) => onValueChange(e.currentTarget.value)}
    placeholder="value"
    class="text-xs flex-1"
    data-testid="tcb-badge-value"
  />
  <TextInput
    value={labelKey}
    oninput={(e) => onLabelKeyChange(e.currentTarget.value)}
    placeholder="label_key"
    class="text-xs flex-1"
    data-testid="tcb-badge-label"
  />
  <TextInput
    value={color}
    oninput={(e) => onColorChange(e.currentTarget.value)}
    placeholder="color"
    class="text-xs w-20"
    data-testid="tcb-badge-color"
  />
  <button
    type="button"
    onclick={onRemove}
    class="text-destructive text-xs hover:underline"
    data-testid="tcb-badge-remove"
  >
    Remove
  </button>
</div>
