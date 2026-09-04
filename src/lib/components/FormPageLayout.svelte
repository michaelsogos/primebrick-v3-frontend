<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { t } from '$lib/i18n';
  import { useAuditBox } from '$lib/composables/useAuditBox';
  import type { MetaColumn } from '$lib/entity-list/types';
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
    auditingColumns: MetaColumn[];
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
</script>

<div class="h-full p-2 sm:p-3 contain-layout">
  <div class="flex h-full w-full flex-col gap-4 min-h-0 overflow-hidden">
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
        <div class="flex-1 overflow-auto">
          {@render children()}
        </div>
        
        <!-- Footer: 50/50 split -->
        <div class="bg-muted/50 shrink-0 border-t p-4">
          <div class="grid grid-cols-2 gap-4">
            <!-- Left: Audit Box (50%) -->
            <div class="flex items-center">
              {#if showAuditBox}
                <div class="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-4 gap-y-2 text-xs w-full">
                  <!-- Version Badge (spans 2 rows) -->
                  {#if versionField && auditData.version}
                    <div class="row-span-2 flex items-center">
                      <button
                        type="button"
                        onclick={auditBox.openVersionHistory}
                        class="inline-flex"
                        title={$t('system.entities.versionHistory.title')}
                      >
                        <Badge class="text-xs font-semibold border border-primary cursor-pointer hover:bg-primary/10" variant="outline">
                          v{auditData.version}
                        </Badge>
                      </button>
                    </div>
                  {/if}

                  <!-- ROW 1 -->
                  <!-- Column 1: _at field (deleted_at or updated_at) -->
                  {#if hasDeletedFields && deletedFields.length > 0}
                    <div class="flex items-center gap-x-2 whitespace-nowrap">
                      <span class="text-primary">{$t(deletedFields[0].labelKey)}:</span>
                      <span class="italic text-muted-foreground">{auditBox.formatValue(auditData[deletedFields[0].key], deletedFields[0])}</span>
                    </div>
                  {:else if updatedFields.length > 0}
                    <div class="flex items-center gap-x-2 whitespace-nowrap">
                      <span class="text-primary">{$t(updatedFields[0].labelKey)}:</span>
                      <span class="italic text-muted-foreground">{auditBox.formatValue(auditData[updatedFields[0].key], updatedFields[0])}</span>
                    </div>
                  {:else}
                    <div class="flex items-center gap-x-2 whitespace-nowrap">
                      <span class="text-muted-foreground">&nbsp;</span>
                    </div>
                  {/if}

                  <!-- Column 2: created_at -->
                  {#if createdFields.length > 0}
                    <div class="flex items-center gap-x-2 whitespace-nowrap">
                      <span class="text-primary">{$t(createdFields[0].labelKey)}:</span>
                      <span class="italic text-muted-foreground">{auditBox.formatValue(auditData[createdFields[0].key], createdFields[0])}</span>
                    </div>
                  {:else}
                    <div class="flex items-center gap-x-2 whitespace-nowrap">
                      <span class="text-muted-foreground">&nbsp;</span>
                    </div>
                  {/if}

                  <!-- Column 3: Entity ID -->
                  {#if meta?.uid && auditData[meta.uid]}
                    <div class="flex items-center gap-x-2 whitespace-nowrap">
                      <span class="text-primary">ID:</span>
                      <span class="italic text-muted-foreground">{auditData[meta.uid]}</span>
                    </div>
                  {:else}
                    <div class="flex items-center gap-x-2 whitespace-nowrap">
                      <span class="text-muted-foreground">&nbsp;</span>
                    </div>
                  {/if}

                  <!-- ROW 2 -->
                  <!-- Column 1: _by field (deleted_by or updated_by) -->
                  {#if hasDeletedFields && deletedFields.length > 1}
                    <div class="flex items-center gap-x-2 whitespace-nowrap">
                      <span class="text-primary">{$t(deletedFields[1].labelKey)}:</span>
                      <span class="italic text-muted-foreground">{auditBox.formatValue(auditData[deletedFields[1].key], deletedFields[1])}</span>
                    </div>
                  {:else if hasDeletedFields && deletedFields.length === 1}
                    <div class="flex items-center gap-x-2 whitespace-nowrap">
                      <span class="text-muted-foreground">&nbsp;</span>
                    </div>
                  {:else if updatedFields.length > 1}
                    <div class="flex items-center gap-x-2 whitespace-nowrap">
                      <span class="text-primary">{$t(updatedFields[1].labelKey)}:</span>
                      <span class="italic text-muted-foreground">{auditBox.formatValue(auditData[updatedFields[1].key], updatedFields[1])}</span>
                    </div>
                  {:else if updatedFields.length === 1}
                    <div class="flex items-center gap-x-2 whitespace-nowrap">
                      <span class="text-muted-foreground">&nbsp;</span>
                    </div>
                  {:else}
                    <div class="flex items-center gap-x-2 whitespace-nowrap">
                      <span class="text-muted-foreground">&nbsp;</span>
                    </div>
                  {/if}

                  <!-- Column 2: created_by -->
                  {#if createdFields.length > 1}
                    <div class="flex items-center gap-x-2 whitespace-nowrap">
                      <span class="text-primary">{$t(createdFields[1].labelKey)}:</span>
                      <span class="italic text-muted-foreground">{auditBox.formatValue(auditData[createdFields[1].key], createdFields[1])}</span>
                    </div>
                  {:else if createdFields.length === 1}
                    <div class="flex items-center gap-x-2 whitespace-nowrap">
                      <span class="text-muted-foreground">&nbsp;</span>
                    </div>
                  {:else}
                    <div class="flex items-center gap-x-2 whitespace-nowrap">
                      <span class="text-muted-foreground">&nbsp;</span>
                    </div>
                  {/if}

                  <!-- Column 3: last_synced_at -->
                  {#if syncFields.length > 0 && auditData.last_synced_at}
                    <div class="flex items-center gap-x-2 whitespace-nowrap">
                      <span class="text-primary">{$t(syncFields[0].labelKey)}:</span>
                      <span class="italic text-muted-foreground">{auditBox.formatValue(auditData[syncFields[0].key], syncFields[0])}</span>
                    </div>
                  {:else}
                    <div class="flex items-center gap-x-2 whitespace-nowrap">
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
