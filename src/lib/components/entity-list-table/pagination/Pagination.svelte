<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import ChevronsLeft from '@lucide/svelte/icons/chevrons-left'
  import ChevronLeft from '@lucide/svelte/icons/chevron-left'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import ChevronsRight from '@lucide/svelte/icons/chevrons-right';

  let {
    currentPage,
    totalPages,
    usesClientPaging,
    clientSelectedPage,
    onPageChange
  }: {
    currentPage: number;
    totalPages: number;
    usesClientPaging: boolean;
    clientSelectedPage: number;
    onPageChange: (page: number) => void;
  } = $props();

  const footerPage = $derived(usesClientPaging ? clientSelectedPage : currentPage);
  const footerTotalPages = $derived(totalPages);

  function handleFirstPage() {
    if (usesClientPaging) {
      onPageChange(1);
    } else {
      onPageChange(1);
    }
  }

  function handlePreviousPage() {
    if (usesClientPaging) {
      onPageChange(Math.max(1, clientSelectedPage - 1));
    } else {
      onPageChange(Math.max(1, currentPage - 1));
    }
  }

  function handleNextPage() {
    if (usesClientPaging) {
      onPageChange(Math.min(footerTotalPages, clientSelectedPage + 1));
    } else {
      onPageChange(Math.min(totalPages, currentPage + 1));
    }
  }

  function handleLastPage() {
    if (usesClientPaging) {
      onPageChange(footerTotalPages);
    } else {
      onPageChange(totalPages);
    }
  }
</script>

<div class="flex items-center gap-1">
  <Button
    variant="soft"
    size="xs"
    disabled={footerPage <= 1}
    onclick={handleFirstPage}
    aria-label={$t('system.entities.list.firstPage')}
    title={$t('system.entities.list.firstPage')}
  >
    <ChevronsLeft class="size-4" />
  </Button>
  <Button
    variant="soft"
    size="xs"
    disabled={footerPage <= 1}
    onclick={handlePreviousPage}
    aria-label={$t('system.entities.list.previousPage')}
    title={$t('system.entities.list.previousPage')}
  >
    <ChevronLeft class="size-4" />
  </Button>
  <div class="whitespace-nowrap px-0.5 text-center tabular-nums text-muted-foreground">
    {$t('system.entities.list.paginationStatus')
      .replace('{page}', String(footerPage))
      .replace('{total}', String(footerTotalPages))}
  </div>
  <Button
    variant="soft"
    size="xs"
    disabled={footerPage >= footerTotalPages}
    onclick={handleNextPage}
    aria-label={$t('system.entities.list.nextPage')}
    title={$t('system.entities.list.nextPage')}
  >
    <ChevronRight class="size-4" />
  </Button>
  <Button
    variant="soft"
    size="xs"
    disabled={footerPage >= footerTotalPages}
    onclick={handleLastPage}
    aria-label={$t('system.entities.list.lastPage')}
    title={$t('system.entities.list.lastPage')}
  >
    <ChevronsRight class="size-4" />
  </Button>
</div>
