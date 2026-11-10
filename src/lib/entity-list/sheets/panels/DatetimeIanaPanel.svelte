<script lang="ts">
  /**
   * DatetimeIanaPanel — per-field `browser | record` datetime display
   * toggles for `datetime_iana_toggle` columns. Mirrors the SearchInPanel
   * anatomy (SheetPanelLayout + icon/title/actions + one row per field);
   * replaces the unbounded inline switch row the card sub-toolbar used to
   * grow horizontally per IANA column. The mode toggle is the sanctioned
   * panel anatomy — ButtonGroup segmented + aria-pressed (panel-switch).
   */
  import { t } from '$lib/i18n';
  import { Button, ButtonGroup, DynamicIcon, SheetPanelLayout } from '@primebrick/ui';
  import SheetHeaderAction from '$lib/shell/sheets/SheetHeaderAction.svelte';
  import { CalendarClock, Eraser } from '@primebrick/ui/vendor/lucide';
  import type { MetaColumn } from '$lib/entity-list/types';

  interface Props {
    datetimeIanaColumns: MetaColumn[];
    modeByKey: Record<string, 'browser' | 'record'>;
    onToggle: (col: MetaColumn) => void;
    disabled?: boolean;
  }

  let { datetimeIanaColumns, modeByKey, onToggle, disabled }: Props = $props();

  const modes = [
    { key: 'browser', icon: 'globe', label: 'system.entities.list.datetime_iana.mode_browser', hint: 'system.entities.list.datetime_iana.hint_browser' },
    { key: 'record', icon: 'map-pin', label: 'system.entities.list.datetime_iana.mode_record', hint: 'system.entities.list.datetime_iana.hint_record' }
  ] as const;

  function setMode(col: MetaColumn, mode: 'browser' | 'record') {
    if ((modeByKey[col.key] ?? 'browser') !== mode) onToggle(col);
  }
</script>

<SheetPanelLayout contentClass="p-0">
  {#snippet icon()}
    <CalendarClock class="size-4" />
  {/snippet}
  {#snippet title()}
    {$t('system.entities.list.datetime_iana.title')}
  {/snippet}
  {#snippet actions()}
    <SheetHeaderAction
      title={$t('app.common.reset')}
      onclick={() => datetimeIanaColumns.forEach((col) => setMode(col, 'browser'))}
    >
      <Eraser class="size-4" />
    </SheetHeaderAction>
  {/snippet}

  {#each datetimeIanaColumns as col (col.key)}
    {@const mode = modeByKey[col.key] ?? 'browser'}
    <div class="flex w-full items-center gap-3 px-3 py-2" data-testid="iana-field-{col.key}">
      <span class="min-w-0 flex-1 truncate text-sm" title={$t(col.label_key)}>{$t(col.label_key)}</span>
      <div class="w-44 shrink-0">
        <ButtonGroup segmented class="w-full">
          {#each modes as m (m.key)}
            <Button
              variant="ghost"
              size="sm"
              type="button"
              class="flex-1 {mode === m.key ? 'bg-foreground/10 text-foreground shadow-xs' : 'text-muted-foreground'}"
              aria-pressed={mode === m.key}
              title={$t(m.hint)}
              disabled={disabled}
              data-testid="iana-mode-{col.key}-{m.key}"
              onclick={() => setMode(col, m.key)}
            >
              <DynamicIcon name={m.icon} size={14} class="shrink-0" />
              {$t(m.label)}
            </Button>
          {/each}
        </ButtonGroup>
      </div>
    </div>
  {/each}
</SheetPanelLayout>
