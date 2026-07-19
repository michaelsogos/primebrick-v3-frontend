<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
  import { useRoleMappings } from '$lib/composables/useRoleMappings.svelte';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import type { DeepReadonly } from '$lib/types/deep-readonly';

  const roles = useRoleMappings();

  let search = $state('');
  let deleteTarget = $state<DeepReadonly<typeof roles.state.roles[number]> | null>(null);
  let deleting = $state(false);

  const filtered = $derived(
    roles.state.roles.filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.idp_role.toLowerCase().includes(q) ||
        (r.idp_org ?? '').toLowerCase().includes(q) ||
        (r.label_key ?? '').toLowerCase().includes(q)
      );
    })
  );

  onMount(() => {
    roles.list();
  });

  async function confirmDelete() {
    if (!deleteTarget) return;
    deleting = true;
    const ok = await roles.remove(deleteTarget.idp_role);
    deleting = false;
    if (ok) {
      deleteTarget = null;
    }
  }
</script>

<svelte:head>
  <title>{$t('shell.settings.roles.title')} · Primebrick</title>
</svelte:head>

<AppPageScaffold>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          { label: $t('shell.system') },
          { label: $t('shell.settings.title'), href: '/system/settings/profile' },
          settingsTabMenuSegment({
            pathname: page.url.pathname,
            searchParams: page.url.searchParams,
            t: (key) => $t(key)
          })
        ]}
      />
      <div class="flex items-center justify-between gap-4">
        <h1 class="truncate text-xl font-semibold leading-tight">{$t('shell.settings.roles.title')}</h1>
        <Button onclick={() => goto('/system/settings/roles/create')} data-testid="roles-create-btn">
          {$t('shell.settings.roles.create')}
        </Button>
      </div>
    </div>
  {/snippet}

  <p class="text-sm text-muted-foreground mb-4">{$t('shell.settings.roles.subtitle')}</p>

  <div class="flex items-center gap-2 mb-4">
    <input
      type="search"
      placeholder={$t('shell.settings.roles.searchPlaceholder')}
      bind:value={search}
      class="flex h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      data-testid="roles-search-input"
    />
  </div>

  {#if roles.state.loading}
    <div class="space-y-2">
      {#each Array(5) as _}
        <Skeleton class="h-12 w-full" />
      {/each}
    </div>
  {:else if roles.state.error}
    <div class="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
      {roles.state.error}
    </div>
  {:else if filtered.length === 0}
    <div class="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
      {$t('shell.settings.roles.empty')}
    </div>
  {:else}
    <div class="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{$t('shell.settings.roles.colIdpRole')}</TableHead>
            <TableHead>{$t('shell.settings.roles.colIdpOrg')}</TableHead>
            <TableHead>{$t('shell.settings.roles.colLabel')}</TableHead>
            <TableHead>{$t('shell.settings.roles.colAdmin')}</TableHead>
            <TableHead>{$t('shell.settings.roles.colPermissions')}</TableHead>
            <TableHead>{$t('shell.settings.roles.colLastSynced')}</TableHead>
            <TableHead class="text-right">{$t('shell.settings.roles.colActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {#each filtered as role (role.idp_role)}
            <TableRow data-testid={`roles-row-${role.idp_role}`}>
              <TableCell class="font-mono text-sm">{role.idp_role}</TableCell>
              <TableCell class="text-sm">{role.idp_org ?? '—'}</TableCell>
              <TableCell class="text-sm">
                {#if role.label_key}
                  {$t(role.label_key)}
                {:else}
                  <span class="text-muted-foreground">—</span>
                {/if}
              </TableCell>
              <TableCell>
                {#if role.is_admin}
                  <Badge variant="default">{$t('shell.settings.roles.admin')}</Badge>
                {:else}
                  <span class="text-muted-foreground text-sm">—</span>
                {/if}
              </TableCell>
              <TableCell class="text-sm">{role.permissions.length}</TableCell>
              <TableCell class="text-sm text-muted-foreground">
                {#if role.last_synced_at}
                  {new Date(role.last_synced_at).toLocaleString()}
                {:else}
                  —
                {/if}
              </TableCell>
              <TableCell class="text-right">
                <div class="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => goto(`/system/settings/roles/${encodeURIComponent(role.idp_role)}`)}
                    data-testid={`roles-edit-btn-${role.idp_role}`}
                  >
                    {$t('shell.settings.roles.edit')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => (deleteTarget = role)}
                    data-testid={`roles-delete-btn-${role.idp_role}`}
                  >
                    {$t('shell.settings.roles.delete')}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    </div>
  {/if}
</AppPageScaffold>

{#if deleteTarget}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    role="dialog"
    aria-modal="true"
    data-testid="roles-delete-dialog"
  >
    <div class="rounded-lg border bg-background p-6 shadow-lg max-w-md w-full mx-4">
      <h2 class="text-lg font-semibold">{$t('shell.settings.roles.deleteConfirmTitle')}</h2>
      <p class="text-sm text-muted-foreground mt-2">
        {$t('shell.settings.roles.deleteConfirmBody', { values: { role: deleteTarget.idp_role } })}
      </p>
      <div class="flex justify-end gap-2 mt-6">
        <Button
          variant="outline"
          onclick={() => (deleteTarget = null)}
          disabled={deleting}
          data-testid="roles-delete-cancel"
        >
          {$t('common.cancel')}
        </Button>
        <Button
          variant="destructive"
          onclick={confirmDelete}
          disabled={deleting}
          data-testid="roles-delete-confirm"
        >
          {deleting ? $t('common.deleting') : $t('common.delete')}
        </Button>
      </div>
    </div>
  </div>
{/if}
