<script lang="ts">
  import { t } from '$lib/i18n';
  import { untrack } from 'svelte';
  import { SheetPanelLayout } from '@primebrick/ui';
  import { SwitchField } from '@primebrick/ui';
  import { Flag } from '@primebrick/ui/vendor/lucide';

  interface Props {
    current_flags: string;
    config_type: 'string' | 'text' | 'secret' | 'url' | 'email' | 'phone';
    on_flags_change: (flags: string) => void;
  }

  let { current_flags, config_type, on_flags_change }: Props = $props();

  // The toggles are user-mutable drafts initialized once from the prop —
  // the panel remounts on each open (keepMountedState defaults false), so
  // untrack expresses the intentional read-once, no suppression needed.
  let flagG = $state(untrack(() => current_flags.includes('g')));
  let flagI = $state(untrack(() => current_flags.includes('i')));
  let flagM = $state(untrack(() => current_flags.includes('m')));

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
      tooltip={$t('app.smart.regex.flags.global_help')}
      tooltipPriority="INFORMATION"
      data-testid="smart-regex-flag-g"
    />

    <!-- Ignore case flag -->
    <SwitchField
      bind:checked={flagI}
      onCheckedChange={handleToggle}
      label={$t('app.smart.regex.flags.ignore_case')}
      tooltip={$t('app.smart.regex.flags.ignore_case_help')}
      tooltipPriority="INFORMATION"
      data-testid="smart-regex-flag-i"
    />

    <!-- Multiline flag (only for text type) -->
    {#if showMultiline}
      <SwitchField
        bind:checked={flagM}
        onCheckedChange={handleToggle}
        label={$t('app.smart.regex.flags.multiline')}
        tooltip={$t('app.smart.regex.flags.multiline_help')}
        tooltipPriority="INFORMATION"
        data-testid="smart-regex-flag-m"
      />
    {/if}
</SheetPanelLayout>
