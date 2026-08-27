<script lang="ts">
  import { t } from '$lib/i18n';
  import type { ConfigEntry } from '$lib/api-types';
  import ConfigListRow from './ConfigListRow.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Undo2 from '@lucide/svelte/icons/undo-2';
  import Plus from '@lucide/svelte/icons/plus';
  import { buildConfigFormSchema } from '$lib/validation/config-validation';
  import { pushNotification } from '$lib/errors/app-errors';
  import { bulkUpdateConfigEntries } from '$lib/api';

  let {
    entries,
    loading = false,
    error = null,
    onSave,
    onDelete,
    onBulkDelete,
    onCreateAction,
  }: {
    entries: ConfigEntry[];
    loading?: boolean;
    error?: string | null;
    onSave: (entry: ConfigEntry, value: string) => Promise<void>;
    onDelete: (entry: ConfigEntry) => void;
    onBulkDelete: (entries: ConfigEntry[]) => void;
    onCreateAction?: () => void;
  } = $props();

  // ─── Form state with taint tracking ──────────────────────────────────────
  // Current form values keyed by entry UUID
  let formValues = $state<Record<string, string>>({});
  // Snapshot of original values for taint comparison
  let originalValues = $state<Record<string, string>>({});
  // Validation errors keyed by entry UUID
  let formErrors = $state<Record<string, string[]>>({});
  // Dynamic Zod schema built from entries' type_config.validation
  let schema = $derived(buildConfigFormSchema(entries));
  // Whether a bulk save is in progress
  let isBulkSaving = $state(false);

  // Initialize/reset form state when entries change
  // svelte-ignore state_referenced_locally -- intentional reset on entries change
  let lastEntriesKey = $state('');
  $effect(() => {
    const key = entries.map((e) => `${e.uuid}:${e.version}`).join('|');
    if (key !== lastEntriesKey) {
      formValues = Object.fromEntries(entries.map((e) => [e.uuid, e.value ?? '']));
      originalValues = { ...formValues };
      formErrors = {};
      lastEntriesKey = key;
    }
  });

  // Taint check: a field is tainted if its current value differs from original
  let taintedUuids = $derived.by<Set<string>>(() => {
    const tainted = new Set<string>();
    for (const entry of entries) {
      const orig = originalValues[entry.uuid] ?? '';
      const curr = formValues[entry.uuid] ?? '';
      if (orig !== curr) {
        tainted.add(entry.uuid);
      }
    }
    return tainted;
  });

  let hasChanges = $derived(taintedUuids.size > 0);
  let hasErrors = $derived(Object.values(formErrors).some((errs) => errs.length > 0));
  let canSave = $derived(hasChanges && !hasErrors && !isBulkSaving);

  // Tainted field keys (for footer display) — maps UUIDs to entry keys
  let taintedKeys = $derived.by<string[]>(() => {
    const keys: string[] = [];
    for (const entry of entries) {
      if (taintedUuids.has(entry.uuid)) keys.push(entry.key);
    }
    return keys;
  });

  // Validate a single field using the dynamic Zod schema
  function validateField(uuid: string) {
    const value = formValues[uuid] ?? '';
    const fieldSchema = (schema as any).shape[uuid];
    if (!fieldSchema) return;
    const result = fieldSchema.safeParse(value);
    if (result.success) {
      formErrors = { ...formErrors, [uuid]: [] };
    } else {
      formErrors = {
        ...formErrors,
        [uuid]: result.error.issues.map((issue: any) => issue.message),
      };
    }
  }

  // Called by ConfigValueInput when the user edits a field
  function handleFieldChange(uuid: string, value: string) {
    formValues = { ...formValues, [uuid]: value };
    validateField(uuid);
  }

  // Revert a single field to its original value (undo all changes on that field)
  function handleRevert(uuid: string) {
    const orig = originalValues[uuid] ?? '';
    formValues = { ...formValues, [uuid]: orig };
    formErrors = { ...formErrors, [uuid]: [] };
  }

  // Bulk save: collect all tainted entries and send in one API call
  async function handleBulkSave() {
    if (!canSave) return;
    isBulkSaving = true;
    try {
      const updates = entries
        .filter((e) => taintedUuids.has(e.uuid))
        .map((e) => ({
          uuid: e.uuid,
          value: formValues[e.uuid] ?? '',
          version: e.version,
        }));
      if (updates.length === 0) {
        isBulkSaving = false;
        return;
      }
      const updated = await bulkUpdateConfigEntries(updates);
      // Update original values to match current (clears taint)
      originalValues = { ...formValues };
      formErrors = {};
      pushNotification({
        impact: 'NONE',
        messageKey: 'common.saveSuccess',
        scope: $t('shell.settings.security.title'),
      });
      // Reload entries to get updated version/updated_at
      await onSave(entries[0], ''); // trigger parent reload
    } catch (err) {
      pushNotification({
        impact: 'HIGH',
        messageKey: 'common.saveFailed',
        scope: $t('shell.settings.security.title'),
        detail: err instanceof Error ? err.message : undefined,
      });
    } finally {
      isBulkSaving = false;
    }
  }

  // ─── Selection state (for bulk delete) ───────────────────────────────────
  let selectedUuids = $state<Set<string>>(new Set());

  let selectedEntries = $derived(
    entries.filter((e) => selectedUuids.has(e.uuid)),
  );

  function handleToggleSelect(entry: ConfigEntry, checked: boolean) {
    const next = new Set(selectedUuids);
    if (checked) {
      next.add(entry.uuid);
    } else {
      next.delete(entry.uuid);
    }
    selectedUuids = next;
  }

  function handleBulkDelete() {
    if (deletableSelectedEntries.length === 0) return;
    onBulkDelete(deletableSelectedEntries);
    selectedUuids = new Set();
  }

  // ─── Select-all ──────────────────────────────────────────────────────────
  // All entries are selectable (including reserved). Reserved entries cannot be
  // deleted, but they CAN be selected (e.g. for bulk revert).
  let allSelected = $derived(
    entries.length > 0 && entries.every((e) => selectedUuids.has(e.uuid)),
  );
  let someSelected = $derived(selectedUuids.size > 0 && !allSelected);

  function handleToggleSelectAll(checked: boolean) {
    if (checked) {
      selectedUuids = new Set(entries.map((e) => e.uuid));
    } else {
      selectedUuids = new Set();
    }
  }

  // ─── Bulk revert ─────────────────────────────────────────────────────────
  // Reverts all selected entries that have unsaved changes to their original values
  let selectedTaintedCount = $derived(
    [...selectedUuids].filter((uuid) => taintedUuids.has(uuid)).length,
  );

  function handleBulkRevert() {
    for (const uuid of selectedUuids) {
      if (taintedUuids.has(uuid)) {
        handleRevert(uuid);
      }
    }
  }

  // ─── Bulk delete ─────────────────────────────────────────────────────────
  // Reserved entries cannot be deleted — filter them out from the bulk delete payload.
  let deletableSelectedEntries = $derived(
    selectedEntries.filter((e) => !e.reserved),
  );

  // Clear selection when entries change (e.g. after delete)
  // svelte-ignore state_referenced_locally -- local mutable state initialized from a prop, then reassigned on change.
  let lastEntryCount = $state(entries.length);
  $effect(() => {
    if (entries.length !== lastEntryCount) {
      const validUuids = new Set(entries.map((e) => e.uuid));
      selectedUuids = new Set([...selectedUuids].filter((uuid) => validUuids.has(uuid)));
      lastEntryCount = entries.length;
    }
  });

  // ─── Grouping ────────────────────────────────────────────────────────────
  let ungroupedEntries = $derived(
    entries.filter((e) => !e.group_key || e.group_key.trim() === ''),
  );

  let groupedEntries = $derived(
    entries.filter((e) => e.group_key && e.group_key.trim() !== ''),
  );

  let groupKeys = $derived.by<string[]>(() => {
    const seen = new Set<string>();
    const keys: string[] = [];
    for (const e of groupedEntries) {
      const gk = e.group_key!;
      if (!seen.has(gk)) {
        seen.add(gk);
        keys.push(gk);
      }
    }
    return keys;
  });

  let entriesByGroup = $derived.by<Map<string, ConfigEntry[]>>(() => {
    const map = new Map<string, ConfigEntry[]>();
    for (const e of groupedEntries) {
      const gk = e.group_key!;
      if (!map.has(gk)) map.set(gk, []);
      map.get(gk)!.push(e);
    }
    return map;
  });
</script>

{#if loading}
  <div class="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
    <p class="text-sm">{$t('common.loading')}</p>
  </div>
{:else if error}
  <div class="flex flex-col items-center justify-center py-8 text-center text-destructive">
    <p class="text-sm">{error}</p>
  </div>
{:else if entries.length === 0}
  <div class="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
    <p class="text-sm">{$t('shell.settings.security.noEntries')}</p>
  </div>
{:else}
  <div class="flex h-full flex-col min-h-0">
    <!-- Sticky toolbar: select-all + bulk actions (left) + create CTA (right) -->
    <div class="shrink-0 border-b bg-background/90 backdrop-blur-sm supports-backdrop-filter:bg-background/70 px-4 py-2">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <!-- Left: select-all checkbox + bulk action CTAs -->
        <div class="flex items-center gap-2">
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            onCheckedChange={() => handleToggleSelectAll(!allSelected)}
            data-testid="config-toolbar-select-all"
          />
          <span class="text-sm text-muted-foreground select-none mr-1">
            {#if allSelected}
              {$t('common.deselectAll')}
            {:else}
              {$t('common.selectAll')}
            {/if}
          </span>
          {#if selectedEntries.length > 0}
            <div class="h-5 w-px bg-border mx-1" aria-hidden="true"></div>
            {#if selectedTaintedCount > 0}
              <Button
                variant="soft"
                tone="warning"
                size="sm"
                onclick={handleBulkRevert}
                data-testid="config-toolbar-bulk-revert"
              >
                <Undo2 class="size-4" />
                {$t('common.bulkRevert')}
                <span class="ml-1 text-xs opacity-70">({selectedTaintedCount})</span>
              </Button>
            {/if}
            <Button
              variant="soft"
              tone="destructive"
              size="sm"
              onclick={handleBulkDelete}
              disabled={deletableSelectedEntries.length === 0}
              data-testid="config-toolbar-bulk-delete"
            >
              <Trash2 class="size-4" />
              {$t('common.delete')}
              <span class="ml-1 text-xs opacity-70">({selectedEntries.length})</span>
            </Button>
          {/if}
        </div>

        <!-- Right: create CTA (primary) -->
        {#if onCreateAction}
          <Button
            variant="default"
            size="sm"
            onclick={onCreateAction}
            data-testid="config-toolbar-create"
          >
            <Plus class="size-4" />
            {$t('shell.settings.security.addConfigKey')}
          </Button>
        {/if}
      </div>
    </div>

    <!-- Scrollable content area -->
    <div class="flex-1 overflow-auto p-4">
      <div class="space-y-3">
        {#each ungroupedEntries as entry (entry.uuid)}
          <ConfigListRow
            {entry}
            selected={selectedUuids.has(entry.uuid)}
            tainted={taintedUuids.has(entry.uuid)}
            value={formValues[entry.uuid] ?? ''}
            errors={formErrors[entry.uuid] ?? []}
            onChange={(value) => handleFieldChange(entry.uuid, value)}
            onRevert={() => handleRevert(entry.uuid)}
            {onDelete}
            onToggleSelect={handleToggleSelect}
          />
        {/each}
      </div>

      {#each groupKeys as groupKey (groupKey)}
        <div class="pt-4 first:pt-0">
          <h3 class="self-start text-xs font-semibold uppercase tracking-wide bg-linear-to-br from-sky-400 to-indigo-400 text-white px-3 pt-1 pb-1 rounded-t-md relative z-10 w-fit ml-3">
            {$t(`config.auth.group.${groupKey}`)}
          </h3>
          <div class="border-primary-gradient rounded-lg px-3 pt-3 pb-3 space-y-3">
            {#each entriesByGroup.get(groupKey) ?? [] as entry (entry.uuid)}
              <ConfigListRow
                {entry}
                selected={selectedUuids.has(entry.uuid)}
                tainted={taintedUuids.has(entry.uuid)}
                value={formValues[entry.uuid] ?? ''}
                errors={formErrors[entry.uuid] ?? []}
                onChange={(value) => handleFieldChange(entry.uuid, value)}
                onRevert={() => handleRevert(entry.uuid)}
                {onDelete}
                onToggleSelect={handleToggleSelect}
              />
            {/each}
          </div>
        </div>
      {/each}
    </div>

    <!-- Footer: solid, attached to bottom (like /profile FormPageLayout) -->
    <div class="bg-muted shrink-0 border-t p-4">
      <div class="grid grid-cols-2 gap-4">
        <!-- Left: taint status -->
        <div class="flex items-center gap-2">
          {#if hasChanges}
            <span class="text-xs text-primary">
              {$t('shell.settings.security.changesPendingFields')}
            </span>
            {#if taintedKeys.length <= 5}
              {#each taintedKeys as key (key)}
                <Badge variant="outline" class="text-xs font-mono border-warning/40 bg-warning/10 text-muted-foreground">
                  {key}
                </Badge>
              {/each}
            {:else}
              <Badge variant="outline" class="text-xs font-mono border-warning/40 bg-warning/10 text-muted-foreground">
                {taintedKeys.length}
              </Badge>
              <span class="text-xs text-primary">{$t('shell.settings.security.changesPendingCount')}</span>
            {/if}
          {:else}
            <span class="text-xs text-muted-foreground/60">
              {$t('shell.settings.security.noChanges')}
            </span>
          {/if}
        </div>
        <!-- Right: Save button -->
        <div class="flex items-center justify-end">
          <Button
            onclick={handleBulkSave}
            disabled={!canSave}
            data-testid="config-bulk-save"
          >
            {#if isBulkSaving}
              {$t('common.saving')}
            {:else}
              {$t('common.saveChanges')}
            {/if}
          </Button>
        </div>
      </div>
    </div>
  </div>
{/if}
