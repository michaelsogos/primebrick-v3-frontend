<script lang="ts">
  import { t } from '$lib/i18n';
  import SheetPanelLayout from '$lib/shell/sheets/SheetPanelLayout.svelte';
  import { SwitchField } from '$lib/components/ui/switch-field';
  import Flag from '@lucide/svelte/icons/flag';

  interface Props {
    current_flags: string;
    config_type: 'string' | 'text' | 'secret' | 'url' | 'email' | 'phone';
    on_flags_change: (flags: string) => void;
  }

  let { current_flags, config_type, on_flags_change }: Props = $props();

  // Parse current flags into individual toggles.
  // Panel is mounted fresh each time the sheet opens, so capturing the initial
  // prop value is intentional — the toggles are then user-mutable.
  // svelte-ignore state_referenced_locally
  let flagG = $state(current_flags.includes('g'));
  // svelte-ignore state_referenced_locally
  let flagI = $state(current_flags.includes('i'));
  // svelte-ignore state_referenced_locally
  let flagM = $state(current_flags.includes('m'));

  // Show multiline flag only for text type (textarea)
  let showMultiline = $derived(config_type === 'text');

  function buildFlags(): string {
    let flags = '';
    if (flagG) flags += 'g';
    if (flagI) flags += 'i';
    if (flagM && showMultiline) flags += 'm';
    return flags;
  }

  function handleToggle() {
    on_flags_change(buildFlags());
  }
</script>

<SheetPanelLayout contentClass="p-4 space-y-4">
  {#snippet icon()}
    <Flag class="size-4" />
  {/snippet}
  {#snippet title()}
    {$t('app.smart.regex.flags.title')}
  {/snippet}
    <!-- Global flag -->
    <SwitchField
      bind:checked={flagG}
      onCheckedChange={handleToggle}
      label={$t('app.smart.regex.flags.global')}
      description={$t('app.smart.regex.flags.globalHelp')}
      data-testid="smart-regex-flag-g"
    />

    <!-- Ignore case flag -->
    <SwitchField
      bind:checked={flagI}
      onCheckedChange={handleToggle}
      label={$t('app.smart.regex.flags.ignoreCase')}
      description={$t('app.smart.regex.flags.ignoreCaseHelp')}
      data-testid="smart-regex-flag-i"
    />

    <!-- Multiline flag (only for text type) -->
    {#if showMultiline}
      <SwitchField
        bind:checked={flagM}
        onCheckedChange={handleToggle}
        label={$t('app.smart.regex.flags.multiline')}
        description={$t('app.smart.regex.flags.multilineHelp')}
        data-testid="smart-regex-flag-m"
      />
    {/if}
</SheetPanelLayout>
