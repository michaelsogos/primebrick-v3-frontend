<script lang="ts">
  import { page } from '$app/state';
  import ErrorPage from '$lib/components/error-page/ErrorPage.svelte';
  import type { RFC7807Error } from '$lib/errors/rfc7807';

  const err = $derived(page.error as (Partial<RFC7807Error> & { message?: string }) | null);
</script>

<ErrorPage
  status={page.status}
  message={err?.message}
  detail={err?.detail}
  internal_code={err?.internal_code}
/>
