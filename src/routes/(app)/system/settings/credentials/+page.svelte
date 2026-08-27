<script lang="ts">
  import { t } from '$lib/i18n';
  import { page } from '$app/state';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import ChangePasswordCard from '$lib/components/auth/ChangePasswordCard.svelte';
  import PasskeyEnrollment from '$lib/components/auth/PasskeyEnrollment.svelte';
  import MfaManagement from '$lib/components/auth/MfaManagement.svelte';
</script>

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
            t: (key) => $t(key),
          }),
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">
        {$t('shell.settings.credentials.title')}
      </h1>
    </div>
  {/snippet}

  <div class="min-h-0 flex-1 overflow-auto p-4">
    <div class="space-y-6">
      <ChangePasswordCard />
      <PasskeyEnrollment />
      <MfaManagement />
    </div>
  </div>
</AppPageScaffold>
