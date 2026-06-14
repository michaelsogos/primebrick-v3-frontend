<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { t } from '$lib/i18n';
  import { useAuditBox, type AuditField } from '$lib/composables/useAuditBox';
  import type { EntityMetadata } from '$lib/composables/useEntityMetadata.svelte';

  type Props = {
    title?: string;
    headerExtras?: Snippet;
    header?: Snippet;
    children: Snippet;
    footerActions: Snippet;
    entity: string;
    rowUuid: string;
    auditData: Record<string, any>;
    auditingColumns: AuditField[];
    isCreatePage?: boolean;
    meta?: EntityMetadata;
  };

  let {
    title,
    headerExtras,
    header,
    children,
    footerActions,
    entity,
    rowUuid,
    auditData,
    auditingColumns,
    isCreatePage = false,
    meta
  }: Props = $props();

  const showAuditBox = $derived(!isCreatePage);
  const deletedFields = $derived.by(() => useAuditBox({ auditData, auditingColumns, isCreatePage, entity, rowUuid }).getDeletedFields(auditingColumns));
  const updatedFields = $derived.by(() => useAuditBox({ auditData, auditingColumns, isCreatePage, entity, rowUuid }).getUpdatedFields(auditingColumns));
  const syncFields = $derived.by(() => useAuditBox({ auditData, auditingColumns, isCreatePage, entity, rowUuid }).getSyncFields(auditingColumns));
  const createdFields = $derived.by(() => useAuditBox({ auditData, auditingColumns, isCreatePage, entity, rowUuid }).getCreatedFields(auditingColumns));
  const versionField = $derived.by(() => useAuditBox({ auditData, auditingColumns, isCreatePage, entity, rowUuid }).getVersionField(auditingColumns));
  const hasDeletedFields = $derived.by(() => deletedFields.length > 0 && !!auditData.deleted_at);
  const auditBox = $derived.by(() => useAuditBox({ auditData, auditingColumns, isCreatePage, entity, rowUuid }));

  // Column visibility
  const showPrimaryCol = $derived(hasDeletedFields || updatedFields.length > 0);
  const showCreatedCol = $derived(createdFields.length > 0);
  const showLastCol = $derived((meta?.uid && auditData[meta.uid]) || (syncFields.length > 0 && auditData.last_synced_at));

  const gridCols = $derived(
    `grid-cols-[auto_${showPrimaryCol ? '1fr' : '0'}_${showCreatedCol ? '1fr' : '0'}_${showLastCol ? '1fr' : '0'}]`
  );
</script>

<div class="h-full p-2 sm:p-3">
  <div class="flex h-full w-full flex-col gap-4 min-h-0">
    {#if header}
      <header class="shrink-0">{@render header()}</header>
    {:else if title || headerExtras}
      <header class="shrink-0">
        {#if title}
          <h1 class="truncate text-xl font-semibold leading-tight">{title}</h1>
        {/if}
        {#if headerExtras}
          {@render headerExtras()}
        {/if}
      </header>
    {/if}

    {#if children}
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
        <div class="flex-1 overflow-hidden">
          {@render children()}
        </div>
        
        <!-- Footer: 50/50 split -->
        <div class="bg-muted/50 shrink-0 border-t p-4">
          <div class="grid grid-cols-2 gap-4">
            <!-- Left: Audit Box (50%) -->
            <div class="flex items-center">
              {#if showAuditBox}
                <div class="grid {gridCols} gap-x-4 gap-y-2 text-xs w-full">
                  <!-- Column 0: Version Badge (spans 2 rows) -->
                  {#if versionField && auditData.version}
                    <div class="row-span-2 flex items-center">
                      <button
                        type="button"
                        onclick={auditBox.openVersionHistory}
                        class="inline-flex"
                        title={$t('entities.versionHistory.title')}
                      >
                        <Badge class="text-xs font-semibold border border-sky-600 dark:border-sky-400 cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-950/20" variant="outline">
                          v{auditData.version}
                        </Badge>
                      </button>
                    </div>
                  {/if}

                  <!-- Column 1: Primary fields (Deleted if present, otherwise Updated) -->
                  {#if hasDeletedFields}
                    {#each deletedFields as field (field.key)}
                      <div class="flex items-center gap-x-2">
                        <span class="text-primary">{$t(field.labelKey)}:</span>
                        <span class="italic text-muted-foreground">{auditBox.formatValue(auditData[field.key])}</span>
                      </div>
                    {/each}
                  {:else if updatedFields.length > 0}
                    {#each updatedFields as field (field.key)}
                      <div class="flex items-center gap-x-2">
                        <span class="text-primary">{$t(field.labelKey)}:</span>
                        <span class="italic text-muted-foreground">{auditBox.formatValue(auditData[field.key])}</span>
                      </div>
                    {/each}
                  {/if}

                  <!-- Column 2: Created fields (always shown if present) -->
                  {#if createdFields.length > 0}
                    {#each createdFields as field (field.key)}
                      <div class="flex items-center gap-x-2">
                        <span class="text-primary">{$t(field.labelKey)}:</span>
                        <span class="italic text-muted-foreground">{auditBox.formatValue(auditData[field.key])}</span>
                      </div>
                    {/each}
                  {/if}

                  <!-- Column 3: Entity ID (row 1) + Sync field (row 2) -->
                  <!-- Entity ID - row 1 -->
                  {#if meta?.uid && auditData[meta.uid]}
                    <div class="flex items-center gap-x-2">
                      <span class="text-primary">ID:</span>
                      <span class="italic text-muted-foreground">{auditData[meta.uid]}</span>
                    </div>
                  {/if}

                  <!-- Sync field - row 2 (conditional on last_synced_at presence) -->
                  {#if syncFields.length > 0 && auditData.last_synced_at}
                    {#each syncFields as field (field.key)}
                      <div class="flex items-center gap-x-2">
                        <span class="text-primary">{$t(field.labelKey)}:</span>
                        <span class="italic text-muted-foreground">{auditBox.formatValue(auditData[field.key])}</span>
                      </div>
                    {/each}
                  {:else if meta?.uid && auditData[meta.uid]}
                    <!-- Spacer if no sync but ID present -->
                    <div class="flex items-center gap-x-2">
                      <span class="text-muted-foreground">&nbsp;</span>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>

            <!-- Right: Actions (50%) -->
            <div class="flex items-center justify-end">
              {@render footerActions()}
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
