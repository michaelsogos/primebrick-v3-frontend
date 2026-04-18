<script lang="ts">
  import { page } from '$app/state';
  import { t } from '$lib/i18n';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import { crmModuleMenuSegment } from '$lib/shell/crm-breadcrumb';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import * as Card from '$lib/components/ui/card';
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
          })
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('entities.crm.pipeline.title')}</h1>
    </div>
  {/snippet}

  <Card.Root class="flex min-h-0 flex-1 flex-col overflow-hidden border-dashed">
    <Card.Header class="shrink-0">
      <Card.Title>{$t('entities.crm.pipeline.cardTitle')}</Card.Title>
      <Card.Description>{$t('entities.crm.pipeline.description')}</Card.Description>
    </Card.Header>
    <Card.Content class="min-h-0 flex-1 space-y-3 overflow-auto text-sm text-muted-foreground">
      <p>{$t('entities.crm.pipeline.body1')}</p>
      <p>{$t('entities.crm.pipeline.body2')}</p>
      <ul class="list-inside list-disc space-y-1 pl-1">
        <li>{$t('entities.crm.pipeline.fake1')}</li>
        <li>{$t('entities.crm.pipeline.fake2')}</li>
        <li>{$t('entities.crm.pipeline.fake3')}</li>
      </ul>
    </Card.Content>
  </Card.Root>
</AppPageScaffold>
