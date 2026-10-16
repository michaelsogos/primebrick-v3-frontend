<script lang="ts">
  /**
   * SheetPanelLayout — the ONE canonical anatomy for every global-sheet panel.
   *
   * Anatomy (fixed, do not reinvent inside panels):
   *
   *   ┌──────────────────────────────────┐
   *   │ HEAD   <SheetHeader>             │  title + actions (auto close ✕)
   *   ├──────────────────────────────────┤
   *   │ TOOLBAR (optional)               │  search inputs, tabs, chips…
   *   ├──────────────────────────────────┤
   *   │ CONTENT                          │  min-h-0 flex-1 overflow-auto
   *   │   {@render children()}           │  the ONLY scrollable region
   *   ├──────────────────────────────────┤
   *   │ FOOT (optional)                  │  actions / input, never scrolls
   *   └──────────────────────────────────┘
   *
   * Usage inside a panel component (see docs/ai/sheets.md):
   *
   *   <SheetPanelLayout>
   *     {#snippet title()}My panel{/snippet}
   *     <p>…</p>
   *   </SheetPanelLayout>
   */
  import * as Sheet from '$lib/components/ui/sheet';
  import { t } from '$lib/i18n';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetHeader from '$lib/shell/sheets/SheetHeader.svelte';
  import { cn } from '$lib/utils';
  import type { Snippet } from 'svelte';
  import XIcon from '@lucide/svelte/icons/x';

  let {
    icon,
    title,
    actions,
    toolbar,
    footer,
    contentClass,
    children,
  }: {
    /**
     * HEAD — panel icon, rendered before the title (size-4). MUST be the
     * same icon as the CTA that opens the sheet. Required — every sheet
     * header carries an icon. AI-assistant sheets use `AiIcon`.
     */
    icon: Snippet;
    /** HEAD — translated panel title (required). */
    title: Snippet;
    /**
     * HEAD — right side of SheetHeader. When omitted the standard close ✕
     * button (Sheet.Close → closeSheet()) is rendered. Provide your own
     * snippet only to ADD buttons; always keep a way to close the sheet.
     */
    actions?: Snippet;
    /** Below-HEAD strip (search, tabs bar, chips). Border-bottom, px-3 py-2. */
    toolbar?: Snippet;
    /** FOOT — bottom fixed strip (action buttons, input box). Border-top. */
    footer?: Snippet;
    /** Extra classes for the scrollable CONTENT region (default `p-2`). */
    contentClass?: string;
    /** CONTENT — the scrollable body. */
    children: Snippet;
  } = $props();
</script>

{#snippet defaultActions()}
  <Sheet.Close
    class="ring-offset-background focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
    title={$t('app.common.done')}
    onclick={() => closeSheet()}
  >
    <XIcon class="size-4" />
  </Sheet.Close>
{/snippet}

{#snippet headTitle()}
  <div class="flex items-center gap-2">
    {@render icon()}
    {@render title()}
  </div>
{/snippet}

<div class="flex h-full flex-col">
  <SheetHeader title={headTitle} actions={actions ?? defaultActions} />

  {#if toolbar}
    <div class="shrink-0 border-b border-border px-3 py-2">
      {@render toolbar()}
    </div>
  {/if}

  <div class={cn('min-h-0 flex-1 overflow-auto', contentClass ?? 'p-2')}>
    {@render children()}
  </div>

  {#if footer}
    <div class="shrink-0 border-t border-border">
      {@render footer()}
    </div>
  {/if}
</div>
