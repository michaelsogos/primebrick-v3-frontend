<script lang="ts">
  /**
   * BadgeValuesEditor — TODO-style list editor for badge values.
   *
   * Page anatomy (sortable — the ONLY place ordering happens):
   *   [grip][Badge preview] code · label_key …            [✏️ edit][🗑]
   *   [+ Add value] — opens the right sheet in add mode
   *
   * The add/edit form lives in the typed sheet registry
   * (`config.badgeValueEdit` → BadgeValuePanel). Local Sheet.Root usage
   * is banned by ESLint outside the sheets infrastructure — always go
   * through `openSheet()`.
   */
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import * as Sortable from '$lib/components/ui/sortable';
  import { badgeClassesFromToken } from '$lib/colors/badge';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Plus from '@lucide/svelte/icons/plus';
  import type { useTypeConfigBuilder } from '$lib/config/type-config-builder.svelte';

  let {
    builder,
    configKey,
  }: {
    builder: ReturnType<typeof useTypeConfigBuilder>;
    /** Current config key — scopes the label_key suggestion prefix. */
    configKey: string;
  } = $props();

  interface BadgeRow { value: string; label_key: string; color: string; }

  // Saved rows — read straight from the builder (single source of truth; the
  // values map preserves insertion order, which is what Sortable reorders).
  const rows = $derived<BadgeRow[]>(
    Object.entries(builder.values ?? {}).map(([value, cfg]) => ({
      value,
      label_key: cfg.label_key ?? '',
      color: cfg.color ?? '',
    })),
  );

  function openAdd() {
    openSheet('config.badgeValueEdit', {
      mode: 'add',
      value_key: null,
      config_key: configKey,
      builder,
    });
  }

  function openEdit(row: BadgeRow) {
    openSheet('config.badgeValueEdit', {
      mode: 'edit',
      value_key: row.value,
      config_key: configKey,
      builder,
    });
  }

  function handleSort(items: { id: string }[]) {
    builder.reorderBadgeValues(items.map((i) => i.id));
  }

  function previewText(row: { value: string; label_key: string }) {
    if (row.label_key.trim()) {
      const translated = $t(row.label_key.trim());
      if (translated !== row.label_key.trim()) return translated;
    }
    return row.value;
  }
</script>

<div class="space-y-2">
  <!-- ── Items — sortable list (ordering lives only here) ── -->
  <Sortable.Root items={rows.map((r) => ({ id: r.value }))} onSort={handleSort}>
    <div role="list" class="flex flex-col gap-2">
      {#each rows as row (row.value)}
        <Sortable.Item id={row.value}>
            {@const c = badgeClassesFromToken(row.color || null)}
            <div class="rounded-md border p-2">
              <div class="flex items-center gap-2">
                  <Sortable.Handle />
                  <Badge
                    class="shadow-none shrink-0 max-w-32 truncate-start"
                    style="background-color:{c.bgColor};color:{c.textColor};border-color:{c.borderColor};"
                  >
                    {previewText(row)}
                  </Badge>
                  {#if row.label_key}
                    <span class="font-mono text-xs text-muted-foreground/70 truncate-start min-w-0 flex-1">{row.label_key}</span>
                  {:else}
                    <span class="flex-1"></span>
                  {/if}
                  <button
                    type="button"
                    onclick={() => openEdit(row)}
                    class="shrink-0 text-muted-foreground hover:text-foreground p-1"
                    title={$t('app.common.edit')}
                    aria-label={$t('app.common.edit')}
                    data-testid="tcb-badge-edit"
                  >
                    <Pencil class="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onclick={() => builder.removeBadgeValue(row.value)}
                    class="shrink-0 text-destructive hover:text-destructive/80 p-1"
                    title={$t('app.common.remove')}
                    aria-label={$t('app.common.remove')}
                    data-testid="tcb-badge-remove"
                  >
                    <Trash2 class="h-4 w-4" />
                  </button>
              </div>
            </div>
        </Sortable.Item>
      {/each}
    </div>
  </Sortable.Root>

  {#if rows.length === 0}
    <p class="text-xs text-muted-foreground">{$t('system.settings.config.typeConfig.noBadgeValues')}</p>
  {/if}

  <!-- ── Add CTA — opens the right sheet in add mode ── -->
  <Button
    type="button"
    variant="outline"
    size="sm"
    class="w-full border-dashed"
    onclick={openAdd}
    data-testid="tcb-badge-open-add"
  >
    <Plus class="h-4 w-4" />
    {$t('system.settings.config.typeConfig.addValue')}
  </Button>
</div>
