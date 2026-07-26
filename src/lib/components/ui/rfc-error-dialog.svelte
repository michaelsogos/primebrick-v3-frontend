<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import BorderedDialog from '$lib/components/ui/dialog-bordered.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { formatUiDateTime, t } from '$lib/i18n';
  import { cn } from '$lib/utils';
  import * as Dock from '$lib/components/ui/dock';
  import Code from '@lucide/svelte/icons/code'
  import FileJson from '@lucide/svelte/icons/file-json'
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle'
  import Info from '@lucide/svelte/icons/info'
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import JsonTableViewer from './JsonTableViewer.svelte';
  import { onMount } from 'svelte';
  import { createHighlighter } from 'shiki';

  type RFC7807Error = {
    id?: string;
    impact?: string;
    type: string;
    title: string;
    status: number;
    detail: string;
    instance?: string;
    internal_code?: string;
    severity?: string;
    createdAt?: number;
    tags?: Array<{ label: string; tone?: string }>;
    scope?: string;
    message?: string;
    extra?: {
      viewer?: string;
      results?: any;
      issues?: any;
      [key: string]: any;
    };
  };

  let {
    open = $bindable(),
    error,
    showCloseButton = false,
    color = 'error'
  }: {
    open: boolean;
    error: RFC7807Error | null;
    showCloseButton?: boolean;
    color?: 'critical' | 'error' | 'warning' | 'info';
  } = $props();

  let previewMode = $state('aesthetic');
  let highlighter: any = $state(null);
  let highlightedJson = $state('');

  async function highlightJson() {
    if (!error) return;
    
    try {
      if (!highlighter) {
        highlighter = await createHighlighter({
          themes: ['light-plus'],
          langs: ['json']
        });
      }

      const jsonString = JSON.stringify(error, null, 2);
      
      highlightedJson = highlighter.codeToHtml(jsonString, {
        lang: 'json',
        theme: 'light-plus'
      });
    } catch (e) {
      console.error('Shiki highlighting error:', e);
      // Fallback to plain text if highlighting fails
      highlightedJson = `<pre class="text-xs">${JSON.stringify(error, null, 2)}</pre>`;
    }
  }

  $effect(() => {
    if (error) {
      highlightJson();
    }
  });

  function closeDialog() {
    open = false;
  }

  function getToneForImpact(impact?: string): 'danger' | 'warning' | 'info' | 'success' | 'neutral' {
    if (!impact) return 'neutral';
    switch (impact) {
      case 'CRITICAL':
        return 'danger';
      case 'HIGH':
        return 'danger';
      case 'MEDIUM':
        return 'warning';
      case 'LOW':
        return 'info';
      default:
        return 'neutral';
    }
  }
</script>

<BorderedDialog
  bind:open={open}
  severity="destructive"
  class="!w-[95vw] !h-[95vh] !max-w-none !max-h-none !p-0 flex flex-col [&>div:nth-child(2)]:flex [&>div:nth-child(2)]:flex-col [&>div:nth-child(2)]:flex-1 [&>div:nth-child(2)]:min-h-0 [&>div:nth-child(2)]:!p-4"
  {showCloseButton}
>
  <Dialog.Header class="pb-4 shrink-0">
    <Dialog.Title>Error Details</Dialog.Title>
    {#if error?.internal_code}
      <Dialog.Description class="text-sm text-muted-foreground">
        Code: {error.internal_code}
      </Dialog.Description>
    {/if}
  </Dialog.Header>

  <!-- Navigation dock -->
  <div class="relative shrink-0">
    <Dock.Root class="!absolute -top-12 left-1/2 -translate-x-1/2 z-10 !bg-destructive/10 !border-destructive/20 dark:!bg-destructive/10" magnification={70} distance={120}>
      <Dock.Icon
        onclick={() => { previewMode = 'aesthetic'; }}
        tooltip={$t('shell.rfcError.preview')}
        selected={previewMode === 'aesthetic'}
        transparent={true}
        class={previewMode === 'aesthetic' ? 'bg-destructive text-destructive-foreground hover:bg-destructive' : 'hover:bg-destructive/20 text-destructive'}
      >
        <Code class="w-6 h-6" />
      </Dock.Icon>
      <Dock.Icon
        onclick={() => { previewMode = 'raw'; }}
        tooltip={$t('shell.rfcError.source')}
        selected={previewMode === 'raw'}
        transparent={true}
        class={previewMode === 'raw' ? 'bg-destructive text-destructive-foreground hover:bg-destructive' : 'hover:bg-destructive/20 text-destructive'}
      >
        <FileJson class="w-6 h-6" />
      </Dock.Icon>
    </Dock.Root>
  </div>

  {#if error}
    <div class="flex-1 overflow-auto min-h-0 flex gap-2">
      <!-- Main content area -->
      <div class="flex-1 overflow-auto min-h-0 my-4">
        {#if previewMode === 'raw'}
          <div class="text-xs bg-muted p-4 rounded-lg overflow-auto h-full">
            {@html highlightedJson}
          </div>
        {:else}
          <div class="text-xs border border-neutral-300 shadow-inner rounded-lg overflow-auto h-full">
            {#if error.extra?.issues}
              <JsonTableViewer data={error.extra.issues} />
            {:else}
              <JsonTableViewer data={error} />
            {/if}
          </div>
        {/if}
      </div>

      <!-- Right metadata panel -->
      <div class="w-80 shrink-0 flex flex-col my-4 ml-2">
        <div class="space-y-3 bg-muted p-4 rounded-lg h-full overflow-auto">
          <!-- Error metadata -->
          <div class="space-y-3">
            <div>
              <span class="text-xs font-semibold text-muted-foreground">ID</span>
              <p class="text-sm">{error.id || 'N/A'}</p>
            </div>
            <div>
              <span class="text-xs font-semibold text-muted-foreground">Impact</span>
              <div class="flex items-center gap-2 mt-0.5">
                {#if color === 'critical' || color === 'error'}
                  <AlertCircle class="w-4 h-4 text-destructive" />
                  <p class="text-sm font-bold text-destructive">{error.impact || 'N/A'}</p>
                {:else if color === 'warning'}
                  <AlertTriangle class="w-4 h-4 text-yellow-600 dark:text-yellow-500" />
                  <p class="text-sm font-bold text-yellow-600 dark:text-yellow-500">{error.impact || 'N/A'}</p>
                {:else}
                  <Info class="w-4 h-4 text-blue-600 dark:text-blue-500" />
                  <p class="text-sm font-bold text-blue-600 dark:text-blue-500">{error.impact || 'N/A'}</p>
                {/if}
              </div>
            </div>
            <div>
              <span class="text-xs font-semibold text-muted-foreground">Scope</span>
              <p class="text-sm font-semibold">{error.scope || error.title}</p>
            </div>
            <div>
              <span class="text-xs font-semibold text-muted-foreground">Message</span>
              <p class="text-sm">{error.message || error.detail}</p>
            </div>
            <div>
              <span class="text-xs font-semibold text-muted-foreground">Timestamp</span>
              <p class="text-sm">{error.createdAt ? formatUiDateTime(error.createdAt, 'en-GB') : 'N/A'}</p>
            </div>
            {#if error.tags && error.tags.length > 0}
              <div>
                <span class="text-xs font-semibold text-muted-foreground">Tags</span>
                <div class="flex flex-wrap gap-1 mt-1">
                  {#each error.tags as tag}
                    <Badge class="text-xs border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300">
                      {tag.label}
                    </Badge>
                  {/each}
                </div>
              </div>
            {/if}
          </div>

          <!-- Separator -->
          <div class="h-px bg-border"></div>

          <!-- Fake user/ticket info -->
          <div class="space-y-3">
            <div>
              <span class="text-xs font-semibold text-muted-foreground">Current User</span>
              <p class="text-sm">john.doe@example.com</p>
            </div>
            <div>
              <span class="text-xs font-semibold text-muted-foreground">Current Role</span>
              <p class="text-sm">Administrator</p>
            </div>
            <div>
              <span class="text-xs font-semibold text-muted-foreground">Last Login at</span>
              <p class="text-sm">May 15, 2026 at 1:30 PM</p>
            </div>
            <div>
              <span class="text-xs font-semibold text-muted-foreground">Ticket ID</span>
              <p class="text-sm">TICKET-2026-0515-001</p>
            </div>
            <div>
              <span class="text-xs font-semibold text-muted-foreground">Ticket Link</span>
              <a href="https://support.example.com/tickets/TICKET-2026-0515-001" target="_blank" rel="noopener noreferrer" class="text-sm text-blue-600 hover:text-blue-800 underline">
                https://support.example.com/tickets/TICKET-2026-0515-001
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <Dialog.Footer class="gap-2 sm:space-x-0 shrink-0">
    <Button
      variant="secondary"
      class="border border-neutral-300 hover:border-neutral-400 hover:bg-accent hover:text-accent-foreground hover:scale-105 transition-all"
      onclick={closeDialog}
    >
      Close
    </Button>
  </Dialog.Footer>
</BorderedDialog>

<style>
  :global(.shiki) {
    background-color: transparent !important;
  }
  :global(.shiki span) {
    background-color: transparent !important;
  }
</style>
