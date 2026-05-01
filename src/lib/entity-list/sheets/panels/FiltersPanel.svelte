<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Sheet from "$lib/components/ui/sheet";
  import { t } from "$lib/i18n";
  import { closeSheet } from "$lib/shell/sheets/sheet-manager.svelte";
  import SheetHeader from "$lib/shell/sheets/SheetHeader.svelte";
  import XIcon from "@lucide/svelte/icons/x";
  import { RotateCcw } from "lucide-svelte";

  type ColumnLike = { key: string; labelKey: string; type?: string };

  interface $$Props {
    content: any;
    filterableColumns?: ColumnLike[];
    filterValues?: Record<string, any>;
    onFilterValuesChange?: (values: Record<string, any>) => void;
    onResetFilters?: () => void;
    sheetMenuCheckboxClass?: string;
  }

  let { 
    content,
    filterableColumns = [],
    filterValues = {},
    onFilterValuesChange,
    onResetFilters,
    sheetMenuCheckboxClass = "h-4 w-4"
  }: $$Props = $props();

  function updateFilterValue(key: string, value: any) {
    const newValues = { ...filterValues, [key]: value };
    onFilterValuesChange?.(newValues);
  }

  function clearFilter(key: string) {
    const newValues = { ...filterValues };
    delete newValues[key];
    onFilterValuesChange?.(newValues);
  }

  function resetAllFilters() {
    onResetFilters?.();
  }
</script>

{#snippet headerActions()}
  <Button
    variant="ghost"
    size="icon-sm"
    class="text-muted-foreground opacity-70 hover:bg-accent hover:text-accent-foreground hover:opacity-100"
    onclick={resetAllFilters}
    title={$t("common.reset")}
  >
    <RotateCcw class="size-4" />
  </Button>
  <Sheet.Close
    class="ring-offset-background focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
    title={$t("common.done")}
    onclick={() => closeSheet()}
  >
    <XIcon class="size-4" />
  </Sheet.Close>
{/snippet}

{#snippet headerTitle()}
  {$t("entities.list.filters")}
{/snippet}

<div class="flex h-full flex-col">
  <SheetHeader title={headerTitle} actions={headerActions} />

  <div class="min-h-0 flex-1 overflow-auto px-2 py-2">
    {#each filterableColumns as col (col.key)}
      <div class="mb-4">
        <div class="mb-2 flex items-center justify-between">
          <label for="filter-{col.key}" class="text-sm font-medium text-foreground">
            {$t(col.labelKey)}
          </label>
          {#if filterValues[col.key]}
            <Button
              variant="ghost"
              size="sm"
              class="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              onclick={() => clearFilter(col.key)}
            >
              {$t("common.clear")}
            </Button>
          {/if}
        </div>
        
        <Input
          id="filter-{col.key}"
          type="text"
          placeholder={$t(`entities.list.filterPlaceholder`)}
          value={filterValues[col.key] || ''}
          oninput={(e) => updateFilterValue(col.key, e.currentTarget.value)}
          class="w-full"
        />
      </div>
    {/each}
    
    {#if filterableColumns.length === 0}
      <div class="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
        <p class="text-sm">{$t("entities.list.noFilterableFields")}</p>
      </div>
    {/if}
  </div>
</div>
