<script lang="ts">
  import EntityTablePage from '$lib/components/entity-table-page/EntityTablePage.svelte';
  import { entityApiBase } from '$lib/api';
</script>

<EntityTablePage
  basePath={entityApiBase('customer')}
  storageKeyPrefix="pb:customers:list:"
  errorScopeKey="app.common.errors.scope.customers_list"
  errorScopeKeyInit="app.common.errors.scope.customers_page_init"
/>
