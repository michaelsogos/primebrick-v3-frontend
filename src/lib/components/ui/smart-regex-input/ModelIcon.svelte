<script lang="ts">
  /**
   * ModelIcon — picks the right brand icon based on the model family.
   *
   * Model families are detected from the model_id prefix:
   *   - Qwen*  → QwenIcon (brand logo)
   *   - Llama* → Cpu (generic, no Llama brand icon available)
   *   - Phi*   → Cpu
   *   - Gemma* → Cpu
   *   - *      → Cpu (fallback)
   *
   * Usage: <ModelIcon model_id={model.model_id} class="size-5" />
   */
  import QwenIcon from '$lib/components/ui/smart-regex-input/QwenIcon.svelte';
  import Cpu from '@lucide/svelte/icons/cpu';

  let {
    model_id,
    class: className = 'size-4',
  }: {
    model_id: string;
    class?: string;
  } = $props();

  const isQwen = $derived(model_id?.startsWith('Qwen'));
</script>

{#if isQwen}
  <QwenIcon class={className} />
{:else}
  <Cpu class={className} />
{/if}
