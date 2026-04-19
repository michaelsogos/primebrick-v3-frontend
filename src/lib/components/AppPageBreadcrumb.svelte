<script lang="ts">
  import { goto } from '$app/navigation';
  import * as Breadcrumb from '$lib/components/ui/breadcrumb';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { dropdownMenuSelectedItemClass } from '$lib/components/ui/dropdown-menu/dropdown-menu-item-selected';
  import { isMenuSegment, type AppBreadcrumbSegment } from '$lib/shell/crm-breadcrumb';
  import { cn } from '$lib/utils';
  import { ChevronDown } from 'lucide-svelte';

  /** Ancestor segments only (current page title is shown separately, e.g. in `h1`). A trailing `/` is always rendered after the last segment. */
  let {
    segments
  }: {
    segments: AppBreadcrumbSegment[];
  } = $props();
</script>

{#if segments.length > 0}
  <Breadcrumb.Root class="text-xs sm:text-sm">
    <Breadcrumb.List class="gap-x-1.5 gap-y-0.5">
      {#each segments as seg, i (i)}
        {#if i > 0}
          <Breadcrumb.Separator class="text-muted-foreground/60">
            <span aria-hidden="true">/</span>
          </Breadcrumb.Separator>
        {/if}
        <Breadcrumb.Item class="max-w-full min-w-0">
          {#if isMenuSegment(seg)}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                class={cn(
                  'inline-flex max-w-full min-w-0 items-center gap-1 rounded-sm border-0 bg-transparent p-0 text-left',
                  'text-muted-foreground hover:text-foreground',
                  'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                )}
                aria-label={seg.menuAriaLabel ?? seg.label}
              >
                <span class="truncate">{seg.label}</span>
                <ChevronDown class="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="start" class="min-w-[12rem]">
                {#each seg.items as item (item.href)}
                  <DropdownMenu.Item
                    class={dropdownMenuSelectedItemClass(item.current)}
                    onSelect={() => {
                      if (!item.current) void goto(item.href);
                    }}
                  >
                    {item.label}
                  </DropdownMenu.Item>
                {/each}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          {:else if seg.href}
            <Breadcrumb.Link href={seg.href} class="truncate hover:underline">
              {seg.label}
            </Breadcrumb.Link>
          {:else}
            <span class="truncate">{seg.label}</span>
          {/if}
        </Breadcrumb.Item>
      {/each}
      <Breadcrumb.Separator class="text-muted-foreground/60" aria-hidden="true">
        <span>/</span>
      </Breadcrumb.Separator>
    </Breadcrumb.List>
  </Breadcrumb.Root>
{/if}
