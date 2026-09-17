<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { page } from '$app/state';
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { loadPublicTranslations } from '$lib/i18n/use-module-translations.svelte';
  import { resolveSafeHome } from '$lib/navigation/safe-home';
  import { httpReasonPhrase } from '$lib/errors/http-status';
  import House from '@lucide/svelte/icons/house';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';

  let {
    status,
    message,
    detail,
    internal_code,
  }: {
    status: number;
    message?: string;
    detail?: string;
    internal_code?: string;
  } = $props();

  let homeHref = $state<string | null>(null);

  const title = $derived.by(() => {
    const specificKey = `app.error.title.${status}`;
    const specific = $t(specificKey);
    if (specific !== specificKey) return specific;
    if (status >= 400 && status < 600) return httpReasonPhrase(status);
    const generic = $t('app.error.title.generic');
    return generic !== 'app.error.title.generic' ? generic : httpReasonPhrase(status);
  });

  onMount(async () => {
    void loadPublicTranslations(get(uiLang));
    homeHref = await resolveSafeHome(page.url.pathname);
  });

  function goBack() {
    history.back();
  }
</script>

<div
  data-testid="error-page"
  class="flex h-full min-h-0 flex-1 flex-col items-center justify-center p-6 font-[system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,Oxygen,Ubuntu,Cantarell,'Open_Sans','Helvetica_Neue',sans-serif] text-foreground"
>
  <div class="mx-4 flex max-w-lg flex-col items-center">
    <div class="flex items-center">
      <span
        data-testid="error-page-status"
        class="relative -top-[0.05rem] text-[3rem] leading-none font-extralight"
      >
        {status}
      </span>
      <div class="ml-4 flex min-h-10 items-center border-l border-border pl-4">
        <h1 class="text-base font-normal">{title}</h1>
      </div>
    </div>

    <div class="h-12" aria-hidden="true"></div>

    {#if internal_code || message}
      <p data-testid="error-page-code" class="font-mono text-xs font-bold">
        {#if internal_code}{internal_code}&nbsp;-&nbsp;{/if}{message}
      </p>
    {/if}
    {#if detail}
      <p data-testid="error-page-detail" class="mt-1 font-mono text-xs font-normal">{detail}</p>
    {/if}

    <nav class="mt-6 flex items-center gap-20 font-mono text-xs font-normal">
      <button
        type="button"
        data-testid="error-page-back-cta"
        onclick={goBack}
        class="inline-flex cursor-pointer items-center gap-1.5 hover:underline"
      >
        <ArrowLeft class="h-3.5 w-3.5" />
        {$t('app.error.go_back')}
      </button>
      {#if homeHref}
        <a
          data-testid="error-page-home-cta"
          href={homeHref}
          class="inline-flex items-center gap-1.5 hover:underline decoration-primary"
        >
          <House class="h-3.5 w-3.5 text-primary" />
          <span class="text-primary-gradient">{$t('app.error.return_home')}</span>
        </a>
      {:else}
        <span
          data-testid="error-page-home-cta"
          class="inline-flex items-center gap-1.5 text-foreground/40"
          aria-disabled="true"
        >
          <House class="h-3.5 w-3.5" />
          {$t('app.error.return_home')}
        </span>
      {/if}
    </nav>
  </div>
</div>
