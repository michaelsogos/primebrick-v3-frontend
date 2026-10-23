<script lang="ts">
  /**
   * Renders `AiAction[]` under an assistant message.
   *
   * - `navigate` → client-tool registry (`goto`, same tab).
   * - `tool` read ops (list/get/meta/audit) → executed immediately, result
   *   summarised as a local assistant message.
   * - `tool` mutating ops → open `AiActionConfirmDialog`.
   *
   * len==1 → single inline chip; len>1 → stacked cards (max 5 enforced by
   * the parser).
   */
  import { t } from '$lib/i18n';
  import { Navigation, Wrench, Loader2, CircleCheck, CircleX } from '@primebrick/ui/vendor/lucide';
  import {
    registerBuiltinClientTools,
    invokeClientTool,
  } from '$lib/shell/ai-chat/client-tool-registry';
  import { callMcpTool } from '$lib/api';
  import AiActionConfirmDialog from './ai-action-confirm-dialog.svelte';
  import { Button } from '$lib/components/ui/button';
  import type { AiAction } from './ai-assistant.types';

  const NS = 'app.smart.guide.ai.action';
  const READ_TOOLS = new Set(['list_entities', 'get_entity', 'get_entity_meta', 'get_entity_audit', 'list_available_entities']);

  interface Props {
    actions: readonly AiAction[];
    /** Append a result line to the chat after execution. */
    onResult?: (text: string) => void;
  }

  let { actions, onResult }: Props = $props();

  let pendingIdx = $state<number | null>(null);
  let doneStates = $state<Record<number, 'ok' | 'error'>>({});
  let dialogOpen = $state(false);
  let dialogAction = $state<Extract<AiAction, { kind: 'tool' }> | null>(null);

  async function execute(action: AiAction, idx: number) {
    if (pendingIdx !== null || doneStates[idx]) return;
    pendingIdx = idx;
    try {
      if (action.kind === 'navigate') {
        registerBuiltinClientTools();
        const res = await invokeClientTool('navigate', {
          route: action.route,
          query: action.query,
        });
        doneStates = { ...doneStates, [idx]: res.ok ? 'ok' : 'error' };
        if (!res.ok) onResult?.($t(`${NS}.result_error`, { label: action.label, error: res.error }));
        return;
      }
      if (READ_TOOLS.has(action.tool)) {
        const res = await callMcpTool(action.tool, action.args);
        doneStates = { ...doneStates, [idx]: res.ok ? 'ok' : 'error' };
        onResult?.(
          res.ok
            ? `${action.label}: ${JSON.stringify(res.result).slice(0, 800)}`
            : $t(`${NS}.result_error`, { label: action.label, error: res.error ?? 'unknown' }),
        );
        return;
      }
      // Mutating tool → confirm dialog
      dialogAction = action;
      dialogOpen = true;
    } finally {
      pendingIdx = null;
    }
  }
</script>

<div
  class="mt-1 flex justify-end {actions.length > 1 ? 'flex-col items-end gap-1.5' : 'flex-wrap gap-2'}"
  data-testid="ai-actions"
>
  {#each actions as action, idx (idx)}
    {@const done = doneStates[idx]}
    <Button
      size="sm"
      variant={idx === 0 ? 'default' : 'outline'}
      disabled={pendingIdx !== null || !!done}
      onclick={() => void execute(action, idx)}
      class={done === 'ok'
        ? 'border-green-600/40 bg-green-500/10 text-green-700 hover:bg-green-500/10 dark:text-green-400'
        : done === 'error'
          ? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/10'
          : ''}
      data-testid="ai-action-{idx}"
      data-route={action.kind === 'navigate' ? action.route : undefined}
    >
      {#if pendingIdx === idx}
        <Loader2 class="size-3.5 shrink-0 animate-spin" />
      {:else if done === 'ok'}
        <CircleCheck class="size-3.5 shrink-0" />
      {:else if done === 'error'}
        <CircleX class="size-3.5 shrink-0" />
      {:else if action.kind === 'navigate'}
        <Navigation class="size-3.5 shrink-0" />
      {:else}
        <Wrench class="size-3.5 shrink-0" />
      {/if}
      <span class="truncate">{action.label}</span>
    </Button>
  {/each}
</div>

<AiActionConfirmDialog bind:open={dialogOpen} action={dialogAction} {onResult} />
