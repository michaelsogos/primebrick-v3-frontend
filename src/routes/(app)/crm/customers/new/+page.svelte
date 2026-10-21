<script lang="ts">
  import { page } from '$app/state';
  import { t } from '$lib/i18n';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import { moduleMenuSegment } from '$lib/breadcrumb/module-breadcrumb';
</script>

<AppPageScaffold>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          moduleMenuSegment({
            pathname: page.url.pathname,
            t: (key) => $t(key)
          }),
          { label: $t('system.entities.customer.title'), href: '/crm/customers' }
        ]}
      />
      <h1 class="text-xl font-semibold leading-tight">{$t('system.entities.customer.new.title')}</h1>
      <p class="text-sm text-muted-foreground">{$t('app.common.soon')}</p>
    </div>
  {/snippet}
</AppPageScaffold>
