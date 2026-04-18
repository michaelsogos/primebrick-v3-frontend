<script lang="ts">
  import { page } from '$app/state';
  import { t } from '$lib/i18n';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import { crmModuleMenuSegment } from '$lib/shell/crm-breadcrumb';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
</script>

<AppPageScaffold>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          crmModuleMenuSegment({
            modules: shellNav.modules,
            pathname: page.url.pathname,
            t: (key) => $t(key)
          }),
          { label: $t('entities.customer.title'), href: '/customers' }
        ]}
      />
      <h1 class="text-xl font-semibold leading-tight">{$t('entities.customer.new.title')}</h1>
      <p class="text-sm text-muted-foreground">{$t('common.soon')}</p>
    </div>
  {/snippet}
</AppPageScaffold>
