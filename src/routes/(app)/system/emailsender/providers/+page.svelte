<script lang="ts">
  /**
   * /system/emailsender/providers — provider list, HOST-rendered
   * EntityTablePage (standard archetype). Declared by the emailsender
   * service's `endpoints.nav` census (`kind:"list"`, `entity:"provider"`);
   * api_base resolves via ENTITY_SERVICE_MAP → /ws/emailsender.
   *
   * The breadcrumb renders the EMAILSENDER module's nav menu — the page is
   * owned by the `emailsender` module (route_prefix `/system/emailsender`),
   * never by settings. The create CTA is census-derived
   * (`/system/emailsender/providers/create` is `kind:"create"` on
   * `provider`); rows link to the remote `kind:"detail"` leaf.
   */
  import { onMount } from 'svelte';
  import EntityTablePage from '$lib/components/entity-table-page/EntityTablePage.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { moduleBreadcrumbSegments } from '$lib/breadcrumb/module-breadcrumb';
  import { page as appPage } from '$app/state';
  import { t } from '$lib/i18n';
  import { entityApiBase, fetchModules, routesCensusFromModules } from '$lib/api';

  /**
   * Row edit target is census-derived — the `kind:"detail"` decl owns the
   * route template (`[uuid]` SvelteKit convention); EntityTablePage's
   * `editPath` contract uses `:uuid` (same as `meta.actions[].endpoint.path`).
   */
  let edit_path = $state<string | undefined>(undefined);

  onMount(() => {
    void fetchModules()
      .then((modules) => {
        const detail = routesCensusFromModules(modules).find(
          (r) => r.route === '/system/emailsender/providers/[uuid]'
        );
        edit_path = detail?.route.replaceAll('[uuid]', ':uuid');
      })
      .catch(() => {
        edit_path = undefined;
      });
  });
</script>

<EntityTablePage
  basePath={entityApiBase('provider')}
  storageKeyPrefix="pb:emailsender:providers:"
  errorScopeKey="app.common.errors.scope.emailsenderProvidersList"
  errorScopeKeyInit="app.common.errors.scope.emailsenderProvidersPageInit"
  editPath={edit_path}
  deletionFilter={false}
>
  {#snippet breadcrumb()}
    <AppPageBreadcrumb
      segments={[
        ...moduleBreadcrumbSegments({
          pathname: appPage.url.pathname,
          t: (key) => $t(key)
        })
      ]}
    />
  {/snippet}
</EntityTablePage>
