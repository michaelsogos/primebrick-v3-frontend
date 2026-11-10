<script lang="ts">
  /**
   * PaginationControls — the canonical pager cluster: page-size dropdown,
   * divider, segmented first/prev | status | next/last. The control is
   * paging-source-agnostic: callers pass the RESOLVED `page`/`totalPages`
   * and a single `onPageChange` (client-vs-server routing lives upstream —
   * e.g. TableFooter wraps it for the selected-rows client-paging mode).
   */
  import { t } from '$lib/i18n';
  import { Button, ButtonGroup } from '@primebrick/ui';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { dropdownMenuSelectedItemClass } from '$lib/components/ui/dropdown-menu/dropdown-menu-item-selected';
  import { ChevronsLeft } from '@primebrick/ui/vendor/lucide'
  import { ChevronLeft } from '@primebrick/ui/vendor/lucide'
  import { ChevronRight } from '@primebrick/ui/vendor/lucide'
  import { ChevronsRight } from '@primebrick/ui/vendor/lucide';

  let {
    page,
    totalPages,
    pageSize,
    pageSizeOptions = [10, 25, 50],
    onPageChange,
    onPageSizeChange,
    test_id_prefix
  }: {
    page: number;
    totalPages: number;
    pageSize: number;
    pageSizeOptions?: number[];
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    /** Stable test-id root — buttons pin `{prefix}-page-*`. */
    test_id_prefix?: string;
  } = $props();
</script>

<div class="flex items-center gap-2">
  <span class="text-muted-foreground">{$t('system.entities.list.page_size')}</span>
  <DropdownMenu.Root>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <Button
          variant="ghost"
          size="sm"
          {...props}
          data-testid={test_id_prefix ? `${test_id_prefix}-page-size` : undefined}
        >
          {pageSize}
        </Button>
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="start">
      {#each pageSizeOptions as opt (opt)}
        <DropdownMenu.Item
          class={dropdownMenuSelectedItemClass(opt === pageSize)}
          onSelect={() => onPageSizeChange(opt)}
        >
          {opt}
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Root>

  <div class="mx-1 h-6 w-px divider-primary-gradient" aria-hidden="true"></div>

  <div class="flex items-center gap-2">
    <ButtonGroup segmented aria-label={$t('system.entities.list.pagination.first_page')}>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={page <= 1}
        onclick={() => onPageChange(1)}
        aria-label={$t('system.entities.list.pagination.first_page')}
        title={$t('system.entities.list.pagination.first_page')}
        data-testid={test_id_prefix ? `${test_id_prefix}-page-first` : undefined}
      >
        <ChevronsLeft class="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={page <= 1}
        onclick={() => onPageChange(Math.max(1, page - 1))}
        aria-label={$t('system.entities.list.pagination.previous_page')}
        title={$t('system.entities.list.pagination.previous_page')}
        data-testid={test_id_prefix ? `${test_id_prefix}-page-prev` : undefined}
      >
        <ChevronLeft class="size-4" />
      </Button>
    </ButtonGroup>
    <div
      class="whitespace-nowrap px-0.5 text-center tabular-nums text-muted-foreground"
      data-testid={test_id_prefix ? `${test_id_prefix}-pagination-status` : undefined}
    >
      {$t('system.entities.list.pagination_status')
        .replace('{page}', String(page))
        .replace('{total}', String(totalPages))}
    </div>
    <ButtonGroup segmented aria-label={$t('system.entities.list.pagination.next_page')}>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={page >= totalPages}
        onclick={() => onPageChange(Math.min(totalPages, page + 1))}
        aria-label={$t('system.entities.list.pagination.next_page')}
        title={$t('system.entities.list.pagination.next_page')}
        data-testid={test_id_prefix ? `${test_id_prefix}-page-next` : undefined}
      >
        <ChevronRight class="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={page >= totalPages}
        onclick={() => onPageChange(totalPages)}
        aria-label={$t('system.entities.list.pagination.last_page')}
        title={$t('system.entities.list.pagination.last_page')}
        data-testid={test_id_prefix ? `${test_id_prefix}-page-last` : undefined}
      >
        <ChevronsRight class="size-4" />
      </Button>
    </ButtonGroup>
  </div>
</div>
