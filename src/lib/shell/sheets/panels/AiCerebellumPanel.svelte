<script lang="ts">
  /**
   * AiCerebellumPanel — create form for a new `ai_cerebellum` tuning row.
   *
   * A cerebellum is a per-(assistant_key, model_id) preset of optional
   * generation-param overrides; NULL fields inherit the model defaults.
   * `name` is NOT user-editable: it is the assistant's i18n key
   * (`app.smart.<ns>.ai.cerebellum_name`) derived from `assistant_key`
   * (lookup of an existing row's name for that assistant).
   *
   * If the (assistant_key, model_id) pair already exists in `rows`, the sheet
   * becomes an EDIT: fields are prepopulated from the row and save() issues
   * PUT /:uuid with the mandatory optimistic-lock `version`.
   *
   * Opened via `openSheet('shell.aiCerebellum', { models, assistants, rows, onCreated })`
   * from the /ai models-section toolbar dropdown.
   */
  import { apiFetch } from '$lib/api';
  import type { AiCerebellum, AiModel } from '$lib/api-types';
  import ComboSelect from '$lib/components/ui/combo-select/combo-select.svelte';
  import AiModelOption from '$lib/components/ui/smart-ai/ai-model-option.svelte';
  import CerebellumRecommendationBadge from '$lib/components/ui/smart-ai/cerebellum-recommendation-badge.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Slider from '$lib/components/ui/slider/slider.svelte';
  import Switch from '$lib/components/ui/switch/switch.svelte';
  import { pushNotification } from '$lib/errors/app-errors';
  import { t } from '$lib/i18n';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetPanelLayout from '$lib/shell/sheets/SheetPanelLayout.svelte';
  import CircuitBoard from '@lucide/svelte/icons/circuit-board';

  let {
    models,
    assistants,
    rows = [],
    onCreated,
  }: {
    /** Enabled ai_model rows for the model ComboSelect. */
    models: readonly AiModel[];
    /** Known assistants: key + stored `name` i18n key for that assistant. */
    assistants: readonly { key: string; name: string }[];
    /** Existing cerebellum rows — a matching (assistant, model) pair turns the sheet into edit mode. */
    rows?: readonly AiCerebellum[];
    /** Called after a successful create so the caller can reload rows. */
    onCreated?: () => void;
    modal?: boolean;
  } = $props();

  const fieldNs = 'system.entities.ai_cerebellum.fields';

  let assistant_key = $state('');
  let model_id = $state('');
  let enable_thinking = $state<'inherit' | 'true' | 'false'>('inherit');
  let temperature = $state('');
  let top_p = $state('');
  let max_tokens = $state('');
  let repetition_penalty = $state('');
  let sort_order = $state('100');
  let is_enabled = $state(true);
  let saving = $state(false);

  const assistantOptions = $derived(assistants.map((a) => ({ key: a.key, label: $t(a.name) })));

  /** Existing row for the selected pair — non-null = edit mode. */
  const existing = $derived(
    rows.find((r) => r.assistant_key === assistant_key && r.model_id === model_id) ?? null,
  );

  // Prepopulate when the selected pair matches an existing row (edit mode).
  $effect(() => {
    const row = existing;
    if (!row) return;
    enable_thinking = row.enable_thinking == null ? 'inherit' : row.enable_thinking ? 'true' : 'false';
    temperature = row.temperature == null ? '' : String(row.temperature);
    top_p = row.top_p == null ? '' : String(row.top_p);
    max_tokens = row.max_tokens == null ? '' : String(row.max_tokens);
    repetition_penalty = row.repetition_penalty == null ? '' : String(row.repetition_penalty);
    sort_order = String(row.sort_order);
    is_enabled = row.is_enabled;
  });

  function numOrNull(v: string): number | null {
    const n = Number(v);
    return v.trim() !== '' && Number.isFinite(n) ? n : null;
  }

  // Temperature slider (0–2 step 0.1) mirrors the string input: an empty
  // input = inherit (slider sits at 0); dragging the slider writes a value.
  let tempSlider = $state(0);
  $effect(() => {
    tempSlider = numOrNull(temperature) ?? 0;
  });

  async function save() {
    saving = true;
    const storedName = assistants.find((a) => a.key === assistant_key)?.name
      ?? `app.smart.${assistant_key}.ai.cerebellum_name`;
    const entity = {
      assistant_key,
      model_id,
      name: existing?.name ?? storedName,
      enable_thinking: enable_thinking === 'inherit' ? null : enable_thinking === 'true',
      temperature: numOrNull(temperature),
      top_p: numOrNull(top_p),
      max_tokens: numOrNull(max_tokens),
      repetition_penalty: numOrNull(repetition_penalty),
      is_enabled,
      sort_order: numOrNull(sort_order) ?? 100,
    };
    // Edit mode → PUT /:uuid with mandatory optimistic-lock version.
    const resp = existing
      ? await apiFetch(`/api/v1/entities/ai_cerebellum/${encodeURIComponent(existing.uuid)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity: { ...entity, version: existing.version } }),
        })
      : await apiFetch('/api/v1/entities/ai_cerebellum', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity }),
        });
    saving = false;
    if (resp.ok) {
      closeSheet();
      onCreated?.();
    } else {
      pushNotification({
        impact: 'MEDIUM',
        messageKey: 'app.common.saveFailed',
        scope: 'AI Cerebellum',
        detail: `Save failed (${resp.status})`,
        toast: true,
      });
    }
  }
</script>

<SheetPanelLayout contentClass="p-0">
  {#snippet icon()}
    <CircuitBoard class="size-4" />
  {/snippet}

  {#snippet title()}
    {$t('system.entities.ai_cerebellum.title')}
  {/snippet}

  <div class="space-y-4 p-4" data-testid="ai-cerebellum-panel">
      <div class="space-y-1.5">
        <label class="text-xs font-medium text-muted-foreground" for="cerebellum-assistant">
          {$t(`${fieldNs}.assistant_key`)}
        </label>
        <ComboSelect
          id="cerebellum-assistant"
          mode="single"
          bind:value={assistant_key}
          options={assistantOptions}
          valueField="key"
          labelField="label"
          placeholder={$t(`${fieldNs}.assistant_key`)}
          data-testid="ai-cerebellum-assistant"
        />
      </div>

      <div class="space-y-1.5">
        <label class="flex items-center gap-2 text-xs font-medium text-muted-foreground" for="cerebellum-model">
          {$t(`${fieldNs}.model_id`)}
          {#if existing?.recommendation}
            <CerebellumRecommendationBadge recommendation={existing.recommendation} />
          {/if}
        </label>
        <ComboSelect
          id="cerebellum-model"
          mode="single"
          bind:value={model_id}
          options={models as AiModel[]}
          valueField="model_id"
          labelField="name"
          placeholder={$t(`${fieldNs}.model_id`)}
          data-testid="ai-cerebellum-model"
        >
          {#snippet itemSnippet({ option })}
            {@const rec = (rows ?? []).find((r) => r.assistant_key === assistant_key && r.model_id === (option as AiModel).model_id)?.recommendation}
            <div class="flex items-center gap-2">
              <AiModelOption model={option as AiModel} />
              {#if rec}
                <CerebellumRecommendationBadge recommendation={rec} />
              {/if}
            </div>
          {/snippet}
          {#snippet selectedSnippet({ option })}
            <AiModelOption model={option as AiModel} />
          {/snippet}
        </ComboSelect>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-muted-foreground" for="cerebellum-temperature">
            {$t(`${fieldNs}.temperature`)}
          </label>
          <div class="flex items-center gap-2">
            <Slider
              bind:value={tempSlider}
              min={0}
              max={2}
              step={0.1}
              class="flex-1"
              onValueChange={(v: number) => (temperature = String(v))}
              data-testid="ai-cerebellum-temperature-slider"
            />
            <Input id="cerebellum-temperature" type="number" step="0.1" min="0" max="2" bind:value={temperature} placeholder="inherit" class="w-16" data-testid="ai-cerebellum-temperature" />
          </div>
        </div>
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-muted-foreground" for="cerebellum-top-p">
            {$t(`${fieldNs}.top_p`)}
          </label>
          <Input id="cerebellum-top-p" type="number" step="0.01" min="0.01" max="1" bind:value={top_p} placeholder="inherit" data-testid="ai-cerebellum-top-p" />
        </div>
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-muted-foreground" for="cerebellum-max-tokens">
            {$t(`${fieldNs}.max_tokens`)}
          </label>
          <Input id="cerebellum-max-tokens" type="number" step="1" min="1" max="32768" bind:value={max_tokens} placeholder="inherit" data-testid="ai-cerebellum-max-tokens" />
        </div>
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-muted-foreground" for="cerebellum-rep-penalty">
            {$t(`${fieldNs}.repetition_penalty`)}
          </label>
          <Input id="cerebellum-rep-penalty" type="number" step="0.01" min="1" max="2" bind:value={repetition_penalty} placeholder="inherit" data-testid="ai-cerebellum-repetition-penalty" />
        </div>
      </div>

      <div class="space-y-1.5">
        <label class="text-xs font-medium text-muted-foreground" for="cerebellum-thinking">
          {$t(`${fieldNs}.enable_thinking`)}
        </label>
        <ComboSelect
          id="cerebellum-thinking"
          mode="single"
          bind:value={enable_thinking}
          options={[
            { value: 'inherit', label: 'inherit' },
            { value: 'true', label: $t('system.entities.ai_cerebellum.thinking.true') },
            { value: 'false', label: $t('system.entities.ai_cerebellum.thinking.false') },
          ]}
          valueField="value"
          labelField="label"
          searchable={false}
          data-testid="ai-cerebellum-thinking"
        />
      </div>

      <div class="flex items-center justify-between gap-3">
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-muted-foreground" for="cerebellum-sort-order">
            {$t(`${fieldNs}.sort_order`)}
          </label>
          <Input id="cerebellum-sort-order" type="number" step="1" min="0" max="9999" bind:value={sort_order} class="w-24" data-testid="ai-cerebellum-sort-order" />
        </div>
        <div class="flex items-center gap-2 pt-4">
          <Switch bind:checked={is_enabled} data-testid="ai-cerebellum-enabled" />
          <span class="text-xs text-muted-foreground">{$t(`${fieldNs}.is_enabled`)}</span>
        </div>
      </div>
    </div>

  {#snippet footer()}
    <div class="flex items-center justify-end gap-2 border-t border-border/60 px-4 py-3">
      <Button variant="outline" tone="primary" size="sm" onclick={closeSheet} disabled={saving} data-testid="ai-cerebellum-cancel">
        {$t('app.common.cancel')}
      </Button>
      <Button variant="default" size="sm" onclick={save} disabled={saving || !assistant_key || !model_id} data-testid="ai-cerebellum-save">
        {$t('app.common.save')}
      </Button>
    </div>
  {/snippet}
</SheetPanelLayout>
