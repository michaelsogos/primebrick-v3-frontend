<script lang="ts">
  /**
   * Confirm dialog for assistant "tool" actions.
   *
   * Phases:
   *  - resolve:  mutating entity tools without a `uuid` arg → search the
   *    entity via `list_entities` (same MCP dispatch), user picks the record.
   *  - confirm:  entity card (summary fields + `_blank` edit-page link) for
   *    update/delete/restore; editable JSON args for create/update; read-only
   *    args for destructive ops. `get_entity_meta` marks missing required
   *    fields (deterministic gate on Execute).
   *
   * No AI-specific endpoints — everything goes through callMcpTool → the
   * shared MCP tool handlers (validation + RBAC included).
   */
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Dialog from '$lib/components/ui/dialog';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';
  import { callMcpTool } from '$lib/api';
  import { CircleCheck, CircleX, ExternalLink, Loader2 } from '@lucide/svelte';
  import type { AiAction } from './ai-assistant.types';

  const NS = 'app.smart.guide.ai.action';
  const READ_ONLY_TOOLS = new Set(['delete_entity', 'restore_entity', 'bulk_entity_action', 'manage_service']);
  const CREATE_UPDATE_TOOLS = new Set(['create_entity', 'update_entity']);

  interface Props {
    open: boolean;
    action: Extract<AiAction, { kind: 'tool' }> | null;
    /** Called with a human-readable outcome line after execute completes. */
    onResult?: (text: string) => void;
  }

  let { open = $bindable(), action, onResult }: Props = $props();

  type Phase = 'resolve' | 'confirm' | 'executing' | 'done';
  let phase = $state<Phase>('confirm');
  let error = $state<string | null>(null);
  let executing = $state(false);
  let doneOk = $state<boolean | null>(null);

  // Resolution state
  let searchText = $state('');
  let searching = $state(false);
  let candidates = $state<Record<string, unknown>[]>([]);
  let resolvedEntity = $state<Record<string, unknown> | null>(null);

  // Args editing state (create/update)
  let argsText = $state('');
  let requiredFields = $state<string[]>([]);

  const entityName = $derived((action?.args.entity as string) ?? '');
  const moduleName = $derived((action?.args.module as string) ?? 'be');
  const hasUuid = $derived(typeof action?.args.uuid === 'string' && action.args.uuid.length > 0);
  const isCreateUpdate = $derived(action ? CREATE_UPDATE_TOOLS.has(action.tool) : false);
  const isReadOnlyArgs = $derived(action ? READ_ONLY_TOOLS.has(action.tool) : false);

  /** Route of the entity edit page (`{page_route}/{uuid}`) for the _blank link. */
  const editUrl = $derived.by(() => {
    const uuid = (resolvedEntity?.uuid ?? action?.args.uuid) as string | undefined;
    if (!uuid) return null;
    if (action?.page_route) return `${action.page_route.replace(/\/$/, '')}/${uuid}`;
    // Current page is the detail route for this record → reuse it
    const p = page.url.pathname;
    if (p.endsWith(`/${uuid}`)) return p;
    return null;
  });

  /** Deterministic summary: prefer label-ish fields, else first strings. */
  const summaryFields = $derived.by(() => {
    if (!resolvedEntity) return [];
    const preferred = ['name', 'email', 'label', 'code', 'title', 'username'];
    const picked: [string, unknown][] = [];
    for (const k of preferred) {
      if (resolvedEntity[k] != null && typeof resolvedEntity[k] === 'string') picked.push([k, resolvedEntity[k]]);
    }
    for (const [k, v] of Object.entries(resolvedEntity)) {
      if (picked.length >= 4) break;
      if (typeof v === 'string' && !picked.some(([pk]) => pk === k) && !['uuid', 'id'].includes(k)) {
        picked.push([k, v]);
      }
    }
    return picked.slice(0, 4);
  });

  /** Missing required fields in current argsText (create/update gate). */
  const missingRequired = $derived.by(() => {
    if (!requiredFields.length) return [];
    let current: Record<string, unknown>;
    try {
      current = JSON.parse(argsText);
    } catch {
      return requiredFields; // unparseable → everything missing
    }
    const data = (current.data ?? current) as Record<string, unknown>;
    return requiredFields.filter((f) => data[f] === undefined || data[f] === '' || data[f] === null);
  });

  function reset() {
    phase = action && !hasUuid && action.tool !== 'create_entity' && action.tool !== 'manage_service'
      ? 'resolve'
      : 'confirm';
    error = null;
    executing = false;
    doneOk = null;
    searchText = '';
    candidates = [];
    resolvedEntity = null;
    argsText = JSON.stringify(action?.args ?? {}, null, 2);
    requiredFields = [];
  }

  /** Fetch entity meta → required field names (best-effort, non-blocking). */
  async function loadMeta() {
    if (!entityName) return;
    const res = await callMcpTool('get_entity_meta', { module: moduleName, entity: entityName });
    if (!res.ok || !res.result) return;
    const cols = (res.result as { columns?: unknown[] }).columns;
    if (Array.isArray(cols)) {
      requiredFields = cols
        .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
        .filter((c) => c.required === true || c.nullable === false)
        .map((c) => String(c.name))
        .filter((n) => !['uuid', 'created_at', 'updated_at', 'deleted_at', 'version'].includes(n));
    }
  }

  /** Search candidates for the resolve phase. */
  async function searchEntities() {
    if (!searchText.trim() || !entityName) return;
    searching = true;
    error = null;
    try {
      const res = await callMcpTool('list_entities', {
        module: moduleName,
        entity: entityName,
        search: searchText.trim(),
        page_size: 8,
      });
      if (!res.ok) throw new Error(res.error ?? 'Search failed');
      const r = res.result as { items?: unknown[]; rows?: unknown[]; results?: unknown[] };
      candidates = (r.items ?? r.rows ?? r.results ?? []) as Record<string, unknown>[];
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      searching = false;
    }
  }

  /** Pick a candidate → fetch full record → confirm phase. */
  async function pickCandidate(c: Record<string, unknown>) {
    const uuid = c.uuid as string;
    if (!uuid) return;
    const res = await callMcpTool('get_entity', { module: moduleName, entity: entityName, uuid });
    if (res.ok && res.result) {
      resolvedEntity = (res.result as Record<string, unknown>)[entityName]
        ? ((res.result as Record<string, unknown>)[entityName] as Record<string, unknown>)
        : (res.result as Record<string, unknown>);
      // Merge resolved identifiers into args (uuid + version for delete/restore)
      const next = JSON.parse(argsText || '{}');
      next.uuid = uuid;
      const version = resolvedEntity.version;
      if (version !== undefined && next.version === undefined) next.version = Number(version);
      argsText = JSON.stringify(next, null, 2);
      phase = 'confirm';
    } else {
      resolvedEntity = c;
      phase = 'confirm';
    }
  }

  async function execute() {
    if (!action) return;
    executing = true;
    error = null;
    let args: Record<string, unknown> = action.args;
    if (isCreateUpdate || !isReadOnlyArgs) {
      try {
        args = JSON.parse(argsText);
      } catch {
        error = 'Invalid JSON';
        executing = false;
        return;
      }
    }
    const res = await callMcpTool(action.tool, args);
    executing = false;
    doneOk = res.ok;
    phase = 'done';
    if (res.ok) {
      onResult?.($t(`${NS}.result_ok`, { label: action.label }));
    } else {
      onResult?.($t(`${NS}.result_error`, { label: action.label, error: res.error ?? 'unknown' }));
    }
  }

  $effect(() => {
    if (open && action) {
      reset();
      void loadMeta();
      // uuid already in args → pre-load the entity card
      if (hasUuid && entityName) {
        void (async () => {
          const res = await callMcpTool('get_entity', {
            module: moduleName,
            entity: entityName,
            uuid: action!.args.uuid as string,
          });
          if (res.ok && res.result) {
            const r = res.result as Record<string, unknown>;
            resolvedEntity = (r[entityName] as Record<string, unknown>) ?? r;
          }
        })();
      }
    }
  });
</script>

<Dialog.Root bind:open>
  <DialogBordered>
    <Dialog.Header class="pb-4">
      <Dialog.Title>{action?.label}</Dialog.Title>
      <Dialog.Description>{$t(`${NS}.confirm_desc`, { tool: action?.tool ?? '' })}</Dialog.Description>
    </Dialog.Header>

    <div class="space-y-3 text-sm">
      {#if phase === 'resolve'}
        <!-- ─── Entity resolution: search → pick a candidate ─── -->
        <p class="text-xs text-muted-foreground">{$t(`${NS}.resolve_hint`)}</p>
        <div class="flex gap-2">
          <Input
            bind:value={searchText}
            placeholder={$t(`${NS}.search_placeholder`)}
            onkeydown={(e) => e.key === 'Enter' && void searchEntities()}
          />
          <Button variant="outline" size="sm" onclick={() => void searchEntities()} disabled={searching}>
            {#if searching}<Loader2 class="size-4 animate-spin" />{:else}{$t(`${NS}.search`)}{/if}
          </Button>
        </div>
        {#if candidates.length > 0}
          <ul class="max-h-48 space-y-1 overflow-auto">
            {#each candidates as c (String(c.uuid))}
              <li>
                <button
                  type="button"
                  class="w-full rounded-md border border-border/60 px-2 py-1.5 text-left text-xs hover:border-border hover:bg-muted/50"
                  onclick={() => void pickCandidate(c)}
                >
                  {(c.name ?? c.email ?? c.title ?? c.code ?? c.uuid) as string}
                  <span class="ml-1 text-muted-foreground">({String(c.uuid).slice(0, 8)}…)</span>
                </button>
              </li>
            {/each}
          </ul>
        {:else if !searching && searchText}
          <p class="text-xs text-muted-foreground">{$t(`${NS}.no_results`)}</p>
        {/if}
      {:else}
        <!-- ─── Entity card (resolved target) ─── -->
        {#if resolvedEntity}
          <div class="rounded-md border border-border/60 bg-muted/30 p-2.5" data-testid="guide-action-entity-card">
            <div class="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {entityName}
            </div>
            {#each summaryFields as [k, v] (k)}
              <div class="flex justify-between gap-2 text-xs">
                <span class="text-muted-foreground">{k}</span>
                <span class="truncate font-medium">{String(v)}</span>
              </div>
            {/each}
            {#if editUrl}
              <a
                href={resolve(editUrl as '/')}
                target="_blank"
                rel="noopener noreferrer"
                class="mt-1.5 inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
              >
                <ExternalLink class="size-3" />
                {$t(`${NS}.open_edit`)}
              </a>
            {/if}
          </div>
        {/if}

        <!-- ─── Args: editable JSON (create/update) or read-only (destructive) ─── -->
        {#if phase === 'confirm' || phase === 'executing'}
          {#if isCreateUpdate}
            <label class="text-xs text-muted-foreground" for="guide-action-args">{$t(`${NS}.args_label`)}</label>
            <textarea
              id="guide-action-args"
              bind:value={argsText}
              rows={Math.min(10, argsText.split('\n').length + 1)}
              class="w-full rounded-md border border-border/60 bg-background p-2 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
              data-testid="guide-action-args"
            ></textarea>
            {#if missingRequired.length > 0}
              <p class="text-xs text-destructive">
                {$t(`${NS}.missing_required`, { fields: missingRequired.join(', ') })}
              </p>
            {/if}
          {:else}
            <pre class="max-h-40 overflow-auto rounded-md border border-border/60 bg-muted/30 p-2 font-mono text-[11px]">{argsText}</pre>
          {/if}
        {/if}

        {#if phase === 'done'}
          <div class="flex items-center gap-2 text-sm" data-testid="guide-action-result">
            {#if doneOk}
              <CircleCheck class="size-4 text-green-600" /><span>{$t(`${NS}.done_ok`)}</span>
            {:else}
              <CircleX class="size-4 text-destructive" /><span>{$t(`${NS}.done_error`)}</span>
            {/if}
          </div>
        {/if}
      {/if}

      {#if error}
        <p class="text-xs text-destructive" data-testid="guide-action-error">{error}</p>
      {/if}
    </div>

    <Dialog.Footer class="-mx-4 -mb-4 mt-4 flex justify-end gap-2 rounded-b-xl border-t bg-muted/50 p-4">
      <Button variant="outline" size="sm" onclick={() => (open = false)} disabled={executing}>
        {$t(`${NS}.cancel`)}
      </Button>
      {#if phase === 'confirm' || phase === 'executing'}
        <Button
          variant="default"
          size="sm"
          onclick={() => void execute()}
          disabled={executing || (isCreateUpdate && missingRequired.length > 0)}
          data-testid="guide-action-execute"
        >
          {#if executing}<Loader2 class="mr-1 size-4 animate-spin" />{/if}
          {$t(`${NS}.execute`)}
        </Button>
      {/if}
    </Dialog.Footer>
  </DialogBordered>
</Dialog.Root>
