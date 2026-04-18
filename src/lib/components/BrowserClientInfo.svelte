<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { getResolvedIanaTimeZone } from '$lib/browser-iana-timezone';
  import { t } from '$lib/i18n';

  type Snapshot = {
    ianaTz: string;
    languages: string;
    resolvedLocale: string;
    calendar: string;
    numberingSystem: string;
    hourCycle: string;
  };

  let snapshot = $state<Snapshot | null>(null);

  onMount(() => {
    if (!browser) return;
    try {
      const ro = new Intl.DateTimeFormat().resolvedOptions();
      snapshot = {
        ianaTz: getResolvedIanaTimeZone() ?? '—',
        languages: navigator.languages?.length
          ? Array.from(navigator.languages).join(', ')
          : navigator.language,
        resolvedLocale: ro.locale ?? '—',
        calendar: ro.calendar ?? '—',
        numberingSystem: ro.numberingSystem ?? '—',
        hourCycle: ro.hourCycle ?? '—'
      };
    } catch {
      snapshot = null;
    }
  });
</script>

{#if snapshot}
  <div class="mt-4 border-t pt-4">
    <div class="mb-3 text-xs font-medium text-muted-foreground">{$t('shell.health.clientTitle')}</div>
    <div class="space-y-3">
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="shrink-0 text-muted-foreground">{$t('shell.health.ianaTimezone')}</div>
        <div class="min-w-0 break-all text-right text-xs">{snapshot.ianaTz}</div>
      </div>
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="shrink-0 text-muted-foreground">{$t('shell.health.preferredLanguages')}</div>
        <div class="min-w-0 break-all text-right text-xs">{snapshot.languages}</div>
      </div>
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="shrink-0 text-muted-foreground">{$t('shell.health.resolvedLocale')}</div>
        <div class="min-w-0 break-all text-right text-xs">{snapshot.resolvedLocale}</div>
      </div>
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="shrink-0 text-muted-foreground">{$t('shell.health.calendarSystem')}</div>
        <div class="min-w-0 text-right text-xs">{snapshot.calendar}</div>
      </div>
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="shrink-0 text-muted-foreground">{$t('shell.health.numberingSystem')}</div>
        <div class="min-w-0 text-right text-xs">{snapshot.numberingSystem}</div>
      </div>
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="shrink-0 text-muted-foreground">{$t('shell.health.hourCycle')}</div>
        <div class="min-w-0 text-right text-xs">{snapshot.hourCycle}</div>
      </div>
    </div>
  </div>
{/if}
