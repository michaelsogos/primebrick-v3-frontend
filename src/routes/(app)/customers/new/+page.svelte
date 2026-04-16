<script lang="ts">
  import { t } from '$lib/i18n';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
</script>

<AppPageScaffold>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          {
            label:
              shellNav.modules.find((mod) => mod.id === 'crm')?.name ?? $t('shell.nav.crmFallback')
          },
          { label: $t('entities.customer.title'), href: '/customers' }
        ]}
      />
      <h1 class="text-xl font-semibold leading-tight">{$t('entities.customer.new.title')}</h1>
      <p class="text-sm text-muted-foreground">{$t('common.soon')}</p>
    </div>
  {/snippet}
</AppPageScaffold>
