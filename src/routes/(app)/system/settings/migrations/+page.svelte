<script lang="ts">
  /**
   * /system/settings/migrations — db_patch admin remediation page.
   *
   * One card per service: the backend first (direct /api/v1), then every
   * registered microservice reached through the governed /ws/<code> proxy —
   * which exempts the db-migration prefix even for `migration_failed`
   * instances, so a broken patch stays fixable from here.
   *
   * `db_patch` rows are served by the SDK system-module RPC surface
   * (status/retry/approve/resolve/drift-check), not by the entity pipeline —
   * a plain Table is used instead of EntityListTable.
   */
  import { t } from '$lib/i18n';
  import { onMount } from 'svelte';
  import { page as appPage } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Table from '$lib/components/ui/table';
  import * as Dialog from '$lib/components/ui/dialog';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';
  import { TextInput } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import Hourglass from '@lucide/svelte/icons/hourglass';
  import CloudOff from '@lucide/svelte/icons/cloud-off';
  import DatabaseZap from '@lucide/svelte/icons/database-zap';
  import { pushNotification } from '$lib/errors/app-errors';
  import { onConnectivityRestored } from '$lib/app-connectivity-events';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import {
    fetchServices,
    fetchDbMigrationStatus,
    dbMigrationRetry,
    dbMigrationApprove,
    dbMigrationResolve,
    dbMigrationDriftCheck,
  } from '$lib/api';
  import type { ServiceInfo } from '$lib/api-types';
  import type { DbMigrationStatus, DbMigrationDriftResult, DbPatchRow, DbPatchStatus } from '$lib/api-types';
  import { groupByCode, aggregateStatus } from '$lib/services-store.svelte';
  import { cn } from '$lib/utils';

  type CardState =
    | { kind: 'loading' }
    | { kind: 'ok'; status: DbMigrationStatus }
    | { kind: 'error'; detail: string };

  type ServiceCard = { code: string; label: string; version?: string; aggStatus: string };

  let services = $state<ServiceInfo[]>([]);
  let pageLoading = $state(true);
  let cards = $state<Record<string, CardState>>({});
  let drift = $state<Record<string, DbMigrationDriftResult>>({});
  let busy = $state<Record<string, boolean>>({});

  // Service cards: the backend itself (schema `public`, direct route) plus
  // every non-reserved registry code (the proxy resolves a live instance;
  // `migration_failed` instances still answer on this prefix).
  const serviceCards = $derived.by<ServiceCard[]>(() => {
    const out: ServiceCard[] = [
      { code: 'be', label: $t('system.migrations.backend'), aggStatus: 'online' },
    ];
    for (const [code, instances] of groupByCode(services)) {
      if (instances[0]?.is_reserved) continue;
      out.push({
        code,
        label: instances[0]?.name || code,
        version: instances[0]?.service_version,
        aggStatus: aggregateStatus(instances),
      });
    }
    return out;
  });

  function patchStatusClass(status: DbPatchStatus): string {
    switch (status) {
      case 'applied':
        return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
      case 'approved':
        return 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300';
      case 'failed':
        return 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300';
      case 'pending_review':
        return 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300';
      case 'resolved_manual':
        return 'border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300';
      default:
        return 'border-border/60 bg-muted/30 text-muted-foreground';
    }
  }

  function svcStatusClass(status: string): string {
    switch (status) {
      case 'online':
        return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
      case 'going_live':
        return 'border-yellow-500/25 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300';
      case 'stale':
        return 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300';
      case 'migration_failed':
      case 'offline':
        return 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300';
      default:
        return 'border-border/60 bg-muted/30 text-muted-foreground';
    }
  }

  function fmtDuration(ms: number | null): string {
    if (ms == null) return '—';
    if (ms < 1000) return `${ms} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
  }

  function fmtTimestamp(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  }

  async function loadStatus(code: string) {
    cards = { ...cards, [code]: { kind: 'loading' } };
    try {
      const status = await fetchDbMigrationStatus(code);
      cards = { ...cards, [code]: { kind: 'ok', status } };
    } catch (e) {
      cards = { ...cards, [code]: { kind: 'error', detail: e instanceof Error ? e.message : 'unreachable' } };
    }
  }

  async function init() {
    pageLoading = true;
    try {
      services = await fetchServices();
    } catch {
      services = [];
    }
    pageLoading = false;
    await Promise.allSettled(serviceCards.map((c) => loadStatus(c.code)));
  }

  // ── per-patch action dialog (approve / resolve) ──────────────────────
  let patchDialogOpen = $state(false);
  let patchDialogMode = $state<'approve' | 'resolve'>('resolve');
  let patchDialogCode = $state('');
  let patchDialogPatch = $state('');
  let patchNote = $state('');
  let patchBusy = $state(false);

  function openPatchDialog(mode: 'approve' | 'resolve', code: string, patch: DbPatchRow) {
    patchDialogMode = mode;
    patchDialogCode = code;
    patchDialogPatch = patch.patch_name;
    patchNote = '';
    patchDialogOpen = true;
  }

  async function submitPatchDialog() {
    patchBusy = true;
    try {
      const note = patchNote.trim() || undefined;
      const res =
        patchDialogMode === 'approve'
          ? await dbMigrationApprove(patchDialogCode, patchDialogPatch, note)
          : await dbMigrationResolve(patchDialogCode, patchDialogPatch, note);
      patchDialogOpen = false;
      pushNotification({
        impact: 'NONE',
        messageKey:
          patchDialogMode === 'approve'
            ? 'system.migrations.approveOk'
            : 'system.migrations.resolveOk',
        scope: $t('system.migrations.title'),
        detail: 'detail' in res && res.detail ? String(res.detail) : undefined,
      });
      await loadStatus(patchDialogCode);
    } catch (e) {
      pushNotification({
        impact: 'HIGH',
        messageKey: 'system.migrations.actionFailed',
        scope: $t('system.migrations.title'),
        detail: e instanceof Error ? e.message : undefined,
      });
    } finally {
      patchBusy = false;
    }
  }

  async function retryFailed(code: string) {
    busy = { ...busy, [`retry:${code}`]: true };
    try {
      await dbMigrationRetry(code);
      pushNotification({
        impact: 'NONE',
        messageKey: 'system.migrations.retryOk',
        scope: $t('system.migrations.title'),
      });
      await loadStatus(code);
    } catch (e) {
      pushNotification({
        impact: 'HIGH',
        messageKey: 'system.migrations.actionFailed',
        scope: $t('system.migrations.title'),
        detail: e instanceof Error ? e.message : undefined,
      });
    } finally {
      busy = { ...busy, [`retry:${code}`]: false };
    }
  }

  async function runDriftCheck(code: string) {
    busy = { ...busy, [`drift:${code}`]: true };
    try {
      const res = await dbMigrationDriftCheck(code);
      drift = { ...drift, [code]: res };
    } catch (e) {
      drift = {
        ...drift,
        [code]: { checked: false, detail: e instanceof Error ? e.message : 'failed' },
      };
    } finally {
      busy = { ...busy, [`drift:${code}`]: false };
    }
  }

  function hasFailed(card: CardState): boolean {
    return card.kind === 'ok' && card.status.patches.some((p) => p.status === 'failed');
  }

  onMount(() => {
    void init();
  });

  onConnectivityRestored(() => {
    void init();
  });
</script>

<svelte:head>
  <title>{$t('system.migrations.title')} · Primebrick</title>
</svelte:head>

<AppPageScaffold>
  {#snippet header()}
    <div class="min-w-0 flex-1 space-y-1">
      <AppPageBreadcrumb
        segments={[
          { label: $t('system.settings.title'), href: '/system/settings/profile' },
          settingsTabMenuSegment({
            pathname: appPage.url.pathname,
            searchParams: appPage.url.searchParams,
            t: (key) => $t(key)
          })
        ]}
      />
      <div class="flex items-center justify-between gap-2">
        <h1 class="truncate text-xl font-semibold leading-tight">{$t('system.migrations.title')}</h1>
        <Button
          size="sm"
          variant="outline"
          data-testid="migrations-refresh"
          onclick={() => void init()}
        >
          <RefreshCw class="size-4" />
          {$t('app.common.refresh')}
        </Button>
      </div>
    </div>
  {/snippet}

  <div class="flex flex-col gap-6">
    {#if pageLoading}
      <div class="grid min-h-56 place-items-center p-3">
        <div class="relative flex flex-col items-center gap-2 text-center">
          <div class="pb-watermark-loading">
            <Hourglass class="size-20 text-info" />
          </div>
          <div class="text-sm font-medium text-muted-foreground">{$t('app.common.loading')}</div>
        </div>
      </div>
    {:else}
      {#each serviceCards as card (card.code)}
        {@const st = cards[card.code]}
        <section class="rounded-lg border" data-testid="migrations-service-{card.code}">
          <div class="flex items-center justify-between gap-3 p-3">
            <div class="flex items-center gap-3 min-w-0">
              <DatabaseZap class="size-5 text-primary shrink-0" />
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <p class="font-medium truncate">{card.label}</p>
                  {#if card.version}
                    <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
                      v{card.version}
                    </Badge>
                  {/if}
                  {#if st?.kind === 'ok'}
                    <Badge variant="outline" class="font-mono text-[11px] font-medium">
                      {st.status.service_schema}
                    </Badge>
                    {#if st.status.degraded}
                      <Badge
                        variant="outline"
                        class="border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300 text-[11px] font-medium"
                      >
                        {$t('system.migrations.degraded')}
                      </Badge>
                    {/if}
                  {/if}
                </div>
                {#if st?.kind === 'ok' && st.status.last_error}
                  <p class="text-xs text-red-600 dark:text-red-400 truncate" title={st.status.last_error}>
                    {$t('system.migrations.lastError')}: {st.status.last_error}
                  </p>
                {/if}
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <Badge
                variant="outline"
                class={cn('font-mono text-[11px] font-medium', svcStatusClass(card.aggStatus))}
              >
                {$t(`app.health.${card.aggStatus}`)}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasFailed(st ?? { kind: 'loading' }) || busy[`retry:${card.code}`]}
                data-testid="migrations-retry-{card.code}"
                onclick={() => void retryFailed(card.code)}
              >
                {$t('system.migrations.actions.retry')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={st?.kind !== 'ok' || busy[`drift:${card.code}`]}
                data-testid="migrations-drift-{card.code}"
                onclick={() => void runDriftCheck(card.code)}
              >
                {$t('system.migrations.actions.driftCheck')}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={st?.kind === 'loading'}
                title={$t('app.common.refresh')}
                data-testid="migrations-refresh-{card.code}"
                onclick={() => void loadStatus(card.code)}
              >
                <RefreshCw class="size-4" />
              </Button>
            </div>
          </div>

          {#if drift[card.code]}
            <div class="border-t px-3 py-2">
              {#if drift[card.code].checked === false}
                <p class="text-xs text-muted-foreground">
                  {$t('system.migrations.drift.unavailable')}: {drift[card.code].detail}
                </p>
              {:else if drift[card.code].clean}
                <Badge
                  variant="outline"
                  class="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium"
                >
                  {$t('system.migrations.drift.clean')}
                </Badge>
              {:else}
                <Badge
                  variant="outline"
                  class="border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px] font-medium"
                >
                  {$t('system.migrations.drift.found')}
                </Badge>
              {/if}
            </div>
          {/if}

          <div class="border-t">
            {#if !st || st.kind === 'loading'}
              <div class="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Hourglass class="size-4" /> {$t('app.common.loading')}
              </div>
            {:else if st.kind === 'error'}
              <div class="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <CloudOff class="size-4 text-red-500" />
                {$t('system.migrations.unreachable')} — {st.detail}
              </div>
            {:else if st.status.patches.length === 0}
              <div class="p-4 text-sm text-muted-foreground">{$t('system.migrations.noPatches')}</div>
            {:else}
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.Head>{$t('system.migrations.columns.patch')}</Table.Head>
                    <Table.Head>{$t('system.migrations.columns.status')}</Table.Head>
                    <Table.Head class="w-20">{$t('system.migrations.columns.attempts')}</Table.Head>
                    <Table.Head class="w-24">{$t('system.migrations.columns.duration')}</Table.Head>
                    <Table.Head>{$t('system.migrations.columns.signedBy')}</Table.Head>
                    <Table.Head>{$t('system.migrations.columns.appliedAt')}</Table.Head>
                    <Table.Head class="w-32 text-right">{$t('system.migrations.columns.actions')}</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {#each st.status.patches as patch (patch.patch_name)}
                    <Table.Row>
                      <Table.Cell class="font-mono text-xs max-w-0">
                        <div class="truncate" title={patch.patch_name}>{patch.patch_name}</div>
                        {#if patch.error}
                          <div class="truncate text-red-600 dark:text-red-400" title={patch.error}>
                            {patch.error}
                          </div>
                        {/if}
                        {#if patch.resolved_note}
                          <div class="truncate text-muted-foreground" title={patch.resolved_note}>
                            {patch.resolved_note}
                          </div>
                        {/if}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge
                          variant="outline"
                          class={cn('font-mono text-[11px] font-medium', patchStatusClass(patch.status))}
                        >
                          {$t(`system.migrations.status.${patch.status}`)}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell class="tabular-nums text-xs">{patch.attempts}</Table.Cell>
                      <Table.Cell class="tabular-nums text-xs">{fmtDuration(patch.duration_ms)}</Table.Cell>
                      <Table.Cell class="text-xs">{patch.signed_key_id ?? '—'}</Table.Cell>
                      <Table.Cell class="text-xs">{fmtTimestamp(patch.applied_at)}</Table.Cell>
                      <Table.Cell class="text-right">
                        <div class="flex justify-end gap-1">
                          {#if patch.status === 'pending_review'}
                            <Button
                              variant="outline"
                              size="sm"
                              data-testid="migrations-approve"
                              onclick={() => openPatchDialog('approve', card.code, patch)}
                            >
                              {$t('system.migrations.actions.approve')}
                            </Button>
                          {/if}
                          {#if patch.status === 'failed' || patch.status === 'pending' || patch.status === 'pending_review'}
                            <Button
                              variant="outline"
                              size="sm"
                              data-testid="migrations-resolve"
                              onclick={() => openPatchDialog('resolve', card.code, patch)}
                            >
                              {$t('system.migrations.actions.resolve')}
                            </Button>
                          {/if}
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  {/each}
                </Table.Body>
              </Table.Root>
            {/if}
          </div>
        </section>
      {/each}
    {/if}
  </div>

  <DialogBordered bind:open={patchDialogOpen} class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>
        {patchDialogMode === 'approve'
          ? $t('system.migrations.dialog.approveTitle')
          : $t('system.migrations.dialog.resolveTitle')}
      </Dialog.Title>
      <Dialog.Description>
        <span class="font-mono text-xs">{patchDialogCode}:{patchDialogPatch}</span>
      </Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-1.5 py-2">
      <Label for="migrations-note">{$t('system.migrations.dialog.note')}</Label>
      <TextInput
        id="migrations-note"
        data-testid="migrations-note-input"
        bind:value={patchNote}
        placeholder={$t('app.common.optional')}
      />
    </div>
    <Dialog.Footer>
      <Dialog.Close class="text-sm">{$t('app.common.cancel')}</Dialog.Close>
      <Button
        size="sm"
        disabled={patchBusy}
        data-testid="migrations-note-confirm"
        onclick={() => void submitPatchDialog()}
      >
        {$t('app.common.confirm')}
      </Button>
    </Dialog.Footer>
  </DialogBordered>
</AppPageScaffold>
