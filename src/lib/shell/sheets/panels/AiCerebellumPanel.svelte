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
  import { SliderField } from '$lib/components/ui/slider-field';
  import { SwitchField } from '$lib/components/ui/switch-field';
  import { SelectableFieldset } from '$lib/components/ui/selectable-fieldset';
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
  let enable_thinking = $state(false);
  let temperature = $state<number | null>(null);
  let top_p = $state<number | null>(null);
  let max_tokens = $state<number | null>(null);
  let repetition_penalty = $state<number | null>(null);
  let kv_cache_reuse = $state(false);
  let sliding_window = $state(true);
  let intent_detection = $state(false);
  let max_history_turns = $state<number | null>(null);
  let is_enabled = $state(true);
  let recommendation = $state<'RECOMMENDED' | 'NOT_RECOMMENDED' | ''>('');
  let saving = $state(false);

  // Fallback slider defaults for a NEW cerebellum (or when the selected model
  // lacks the value) — the values that performed best in our repeated tests.
  const CREATE_DEFAULTS = { temperature: 0.1, top_p: 0.8, max_tokens: 256, repetition_penalty: 1.1, max_history_turns: 6 };

  const assistantOptions = $derived(assistants.map((a) => ({ key: a.key, label: $t(a.name) })));

  /** Existing row for the selected pair — non-null = edit mode. */
  const existing = $derived(
    rows.find((r) => r.assistant_key === assistant_key && r.model_id === model_id) ?? null,
  );

  /** Selected model — its defaults are the values inherited when a field is NULL. */
  const selectedModel = $derived(models.find((m) => m.model_id === model_id) ?? null);

  // Prepopulate when the selected pair matches an existing row (edit mode).
  $effect(() => {
    const row = existing;
    if (!row) return;
    enable_thinking = row.enable_thinking ?? selectedModel?.enable_thinking ?? false;
    temperature = row.temperature ?? null;
    top_p = row.top_p ?? null;
    max_tokens = row.max_tokens ?? null;
    repetition_penalty = row.repetition_penalty ?? null;
    is_enabled = row.is_enabled;
    recommendation = row.recommendation ?? '';
  });

  // execution_config: cerebellum override ?? model config ?? tested defaults.
  $effect(() => {
    const cfg = existing?.execution_config ?? selectedModel?.execution_config ?? null;
    kv_cache_reuse = cfg?.kv_cache_reuse ?? false;
    sliding_window = cfg?.sliding_window ?? true;
    intent_detection = cfg?.intent_detection ?? false;
    max_history_turns = cfg?.max_history_turns ?? null;
  });

  async function save() {
    saving = true;
    const storedName = assistants.find((a) => a.key === assistant_key)?.name
      ?? `app.smart.${assistant_key}.ai.cerebellum_name`;
    const entity = {
      assistant_key,
      model_id,
      name: existing?.name ?? storedName,
      enable_thinking,
      temperature,
      top_p,
      max_tokens,
      repetition_penalty,
      execution_config: {
        kv_cache_reuse,
        sliding_window,
        intent_detection,
        ...(max_history_turns != null ? { max_history_turns } : {}),
      },
      is_enabled,
      recommendation: recommendation || null,
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
          {#if recommendation}
            <CerebellumRecommendationBadge recommendation={recommendation} />
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
          display="custom"
          data-testid="ai-cerebellum-model"
        >
          {#snippet itemSnippet({ option })}
            {@const rec = (rows ?? []).find((r) => r.assistant_key === assistant_key && r.model_id === (option as AiModel).model_id)?.recommendation}
            <div class="flex min-w-0 flex-1 items-center gap-2">
              <div class="min-w-0 flex-1">
                <AiModelOption model={option as AiModel} />
              </div>
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
        <SliderField size="sm" id="cerebellum-temperature" bind:value={temperature} label={$t(`${fieldNs}.temperature`)} defaultValue={selectedModel?.temperature ?? CREATE_DEFAULTS.temperature} min={0} max={2} step={0.1} decimals={1} data-testid="ai-cerebellum-temperature" />
        <SliderField size="sm" id="cerebellum-top-p" bind:value={top_p} label={$t(`${fieldNs}.top_p`)} defaultValue={selectedModel?.top_p ?? CREATE_DEFAULTS.top_p} min={0.01} max={1} step={0.01} decimals={2} data-testid="ai-cerebellum-top-p" />
        <SliderField size="sm" id="cerebellum-max-tokens" bind:value={max_tokens} label={$t(`${fieldNs}.max_tokens`)} defaultValue={selectedModel?.max_tokens ?? CREATE_DEFAULTS.max_tokens} steps={[128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768]} data-testid="ai-cerebellum-max-tokens" />
        <SliderField size="sm" id="cerebellum-rep-penalty" bind:value={repetition_penalty} label={$t(`${fieldNs}.repetition_penalty`)} defaultValue={selectedModel?.repetition_penalty ?? CREATE_DEFAULTS.repetition_penalty} min={1} max={2} step={0.01} decimals={2} data-testid="ai-cerebellum-repetition-penalty" />
      </div>

      <SwitchField
        size="sm"
        id="cerebellum-thinking"
        bind:checked={enable_thinking}
        label={$t(`${fieldNs}.enable_thinking`)}
        data-testid="ai-cerebellum-thinking"
      />

      <SelectableFieldset label={$t(`${fieldNs}.execution_config`)}>
        <div class="grid grid-cols-2 gap-3">
          <SwitchField
            size="sm"
            id="cerebellum-kv-cache"
            bind:checked={kv_cache_reuse}
            label={$t(`${fieldNs}.kv_cache_reuse`)}
            data-testid="ai-cerebellum-kv-cache-reuse"
          />
          <SwitchField
            size="sm"
            id="cerebellum-sliding-window"
            bind:checked={sliding_window}
            label={$t(`${fieldNs}.sliding_window`)}
            data-testid="ai-cerebellum-sliding-window"
          />
          <SwitchField
            size="sm"
            id="cerebellum-intent-detection"
            bind:checked={intent_detection}
            label={$t(`${fieldNs}.intent_detection`)}
            data-testid="ai-cerebellum-intent-detection"
          />
          <SliderField size="sm" id="cerebellum-max-history" bind:value={max_history_turns} label={$t(`${fieldNs}.max_history_turns`)} defaultValue={selectedModel?.execution_config?.max_history_turns ?? CREATE_DEFAULTS.max_history_turns} min={1} max={16} step={1} data-testid="ai-cerebellum-max-history-turns" />
        </div>
      </SelectableFieldset>

      <div class="space-y-1.5">
        <label class="text-xs font-medium text-muted-foreground" for="cerebellum-recommendation">
          {$t(`${fieldNs}.recommendation`)}
        </label>
        <ComboSelect
          id="cerebellum-recommendation"
          mode="single"
          bind:value={recommendation}
          options={[
            { value: 'RECOMMENDED', label: $t('app.smart.ai.cerebellum.recommended'), color: 'emerald-500' },
            { value: 'NOT_RECOMMENDED', label: $t('app.smart.ai.cerebellum.not_recommended'), color: 'amber-500' },
          ]}
          valueField="value"
          labelField="label"
          searchable={false}
          display="badge"
          placeholder={$t(`${fieldNs}.recommendation`)}
          data-testid="ai-cerebellum-recommendation"
        />
      </div>

      <SwitchField
        size="sm"
        id="cerebellum-enabled"
        bind:checked={is_enabled}
        label={$t(`${fieldNs}.is_enabled`)}
        data-testid="ai-cerebellum-enabled"
      />
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
