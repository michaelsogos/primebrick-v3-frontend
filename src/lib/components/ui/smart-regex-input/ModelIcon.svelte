<script lang="ts">
  /**
   * ModelIcon — picks the right brand icon based on the model family.
   *
   * Model families are detected from the model_id (case-insensitive):
   *   - qwen                -> QwenIcon
   *   - llama               -> MetaIcon
   *   - phi                 -> MicrosoftIcon
   *   - nvidia / nemotron   -> NvidiaIcon
   *   - granite             -> IbmIcon
   *   - gemma               -> GemmaIcon
   *   - deepseek            -> DeepSeekIcon
   *   - smollm              -> HuggingFaceIcon
   *   - anything else       -> Cpu (fallback)
   *
   * Usage: <ModelIcon model_id={model.model_id} class="size-5" />
   */
  import QwenIcon from '$lib/components/ui/smart-regex-input/QwenIcon.svelte';
  import MetaIcon from '$lib/components/ui/smart-regex-input/MetaIcon.svelte';
  import MicrosoftIcon from '$lib/components/ui/smart-regex-input/MicrosoftIcon.svelte';
  import NvidiaIcon from '$lib/components/ui/smart-regex-input/NvidiaIcon.svelte';
  import IbmIcon from '$lib/components/ui/smart-regex-input/IbmIcon.svelte';
  import GemmaIcon from '$lib/components/ui/smart-regex-input/GemmaIcon.svelte';
  import DeepSeekIcon from '$lib/components/ui/smart-regex-input/DeepSeekIcon.svelte';
  import HuggingFaceIcon from '$lib/components/ui/smart-regex-input/HuggingFaceIcon.svelte';
  import Cpu from '@lucide/svelte/icons/cpu';

  let {
    model_id,
    class: className = 'size-4',
  }: {
    model_id: string;
    class?: string;
  } = $props();

  const family = $derived.by(() => {
    const id = model_id ?? '';
    if (/qwen/i.test(id)) return 'qwen';
    if (/llama/i.test(id)) return 'meta';
    if (/phi/i.test(id)) return 'microsoft';
    if (/nvidia|nemotron/i.test(id)) return 'nvidia';
    if (/granite/i.test(id)) return 'ibm';
    if (/gemma/i.test(id)) return 'gemma';
    if (/deepseek/i.test(id)) return 'deepseek';
    if (/smollm/i.test(id)) return 'huggingface';
    return 'generic';
  });
</script>

{#if family === 'qwen'}
  <QwenIcon class={className} />
{:else if family === 'meta'}
  <MetaIcon class={className} />
{:else if family === 'microsoft'}
  <MicrosoftIcon class={className} />
{:else if family === 'nvidia'}
  <NvidiaIcon class={className} />
{:else if family === 'ibm'}
  <IbmIcon class={className} />
{:else if family === 'gemma'}
  <GemmaIcon class={className} />
{:else if family === 'deepseek'}
  <DeepSeekIcon class={className} />
{:else if family === 'huggingface'}
  <HuggingFaceIcon class={className} />
{:else}
  <Cpu class={className} />
{/if}
