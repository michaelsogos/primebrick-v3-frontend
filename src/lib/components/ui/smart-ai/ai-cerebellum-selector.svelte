<script lang="ts">
  /**
   * AiCerebellumSelector — footer dropdown for switching the model tuning
   * ("cerebellum") of the active assistant+model pair.
   *
   * Items: a virtual "Model defaults" entry (null selection) plus every
   * enabled cerebellum row for the current model. The selection drives the
   * effective generation params shown in the model details popover and sent
   * to the worker.
   *
   * Rendered only when the active model has ≥1 enabled tuning.
   * Shared by all Smart* assistant panels (i18n_ns + testid_prefix props).
   */
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
  import { dropdownMenuItemWithSelectedClass } from '$lib/components/ui/dropdown-menu/dropdown-menu-item-selected';
  import type { AiCerebellum } from '$lib/api-types';
  import { t } from '$lib/i18n';
  import CircuitBoard from '@lucide/svelte/icons/circuit-board';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';

  let {
    tunings,
    selected_tuning_uuid,
    on_select,
    i18n_ns,
    testid_prefix,
  }: {
    /** Enabled tunings for the active model+assistant (sorted). */
    tunings: readonly AiCerebellum[];
    /** Currently selected tuning uuid — null = model defaults. */
    selected_tuning_uuid: string | null;
    /** Called when the user picks a tuning (null = model defaults). */
    on_select: (uuid: string | null) => void;
    /** i18n namespace, e.g. 'app.smart.regex.ai'. */
    i18n_ns: string;
    /** data-testid prefix, e.g. 'smart-regex-ai'. */
    testid_prefix: string;
  } = $props();

  /**
   * Cerebellum `name` holds an i18n KEY (e.g.
   * 'app.smart.json.ai.cerebellum_name') — it is the assistant's display
   * name and must read identical to the sheet title. $t() falls back to
   * the raw string when it isn't a key, so plain names still work.
   */
  let selectedName = $derived(
    selected_tuning_uuid
      ? $t(tunings.find((x) => x.uuid === selected_tuning_uuid)?.name ?? '')
      : '',
  );
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    class="min-w-0 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-foreground/70 hover:bg-accent hover:text-foreground transition-colors"
    title={$t(`app.smart.ai.cerebellum.title`)}
    aria-label={$t(`app.smart.ai.cerebellum.title`)}
    data-testid="{testid_prefix}-cerebellum-trigger"
  >
    <CircuitBoard class="size-3.5 shrink-0" />
    {#if selectedName}
      <span class="truncate font-medium">{selectedName}</span>
    {/if}
    <ChevronDown class="size-3 shrink-0" />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="start" class="min-w-[10rem]">
    <DropdownMenu.Item
      onclick={() => on_select(null)}
      class={dropdownMenuItemWithSelectedClass(
        'flex items-center gap-2 text-xs',
        selected_tuning_uuid === null,
      )}
      data-testid="{testid_prefix}-cerebellum-model-defaults"
    >
      {$t(`app.smart.ai.cerebellum.model_defaults`)}
    </DropdownMenu.Item>
    <DropdownMenu.Separator />
    {#each tunings as tuning (tuning.uuid)}
      <DropdownMenu.Item
        onclick={() => on_select(tuning.uuid)}
        class={dropdownMenuItemWithSelectedClass(
          'flex items-center justify-between gap-2 text-xs',
          selected_tuning_uuid === tuning.uuid,
        )}
        data-testid="{testid_prefix}-cerebellum-{tuning.assistant_key}"
      >
        <span>{$t(tuning.name)}</span>
        {#if tuning.is_default}
          <span class="text-[10px] text-muted-foreground">
            {$t(`app.smart.ai.cerebellum.default`)}
          </span>
        {/if}
      </DropdownMenu.Item>
    {/each}
  </DropdownMenu.Content>
</DropdownMenu.Root>
