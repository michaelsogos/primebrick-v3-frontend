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
    os: string;
    osVersion: string;
    osArch: string;
    browserName: string;
    browserVersion: string;
  };

  let snapshot = $state<Snapshot | null>(null);

  onMount(() => {
    if (!browser) return;
    try {
      const ro = new Intl.DateTimeFormat().resolvedOptions();
      const ua = navigator.userAgent;

      // Parse OS
      let os = '—';
      let osVersion = '—';
      let osArch = '—';
      
      if (ua.includes('Win')) {
        os = 'Windows';
        const winMatch = ua.match(/Windows NT (\d+\.\d+)/);
        if (winMatch) {
          const version = winMatch[1];
          if (version === '10.0') {
            // Windows 10 or 11 - need to check further
            if (ua.includes('Windows NT 10.0') && ua.includes('Win64')) {
              osVersion = '10/11';
            } else {
              osVersion = version;
            }
          } else {
            osVersion = version;
          }
        }
        // Detect architecture
        if (ua.includes('WOW64') || ua.includes('Win64') || ua.includes('x64')) {
          osArch = 'x64';
        } else if (ua.includes('ARM')) {
          osArch = 'ARM';
        } else {
          osArch = 'x86';
        }
      } else if (ua.includes('Mac')) {
        os = 'macOS';
        const macMatch = ua.match(/Mac OS X ([\d_]+)/);
        if (macMatch) {
          osVersion = macMatch[1].replace(/_/g, '.');
        }
        // Detect architecture
        if (ua.includes('Intel')) {
          osArch = 'x64';
        } else if (ua.includes('arm64') || ua.includes('Apple Silicon')) {
          osArch = 'arm64';
        } else {
          osArch = '—';
        }
      } else if (ua.includes('Linux')) {
        os = 'Linux';
        // Try to get Linux distribution info
        const distroMatch = ua.match(/(Ubuntu|Fedora|Debian|CentOS|Red Hat|Arch|SUSE)/i);
        if (distroMatch) {
          os = distroMatch[1];
        }
        // Detect architecture
        if (ua.includes('x86_64') || ua.includes('x64')) {
          osArch = 'x64';
        } else if (ua.includes('i386') || ua.includes('i686')) {
          osArch = 'x86';
        } else if (ua.includes('arm64') || ua.includes('aarch64')) {
          osArch = 'arm64';
        } else if (ua.includes('arm')) {
          osArch = 'ARM';
        }
      } else if (ua.includes('Android')) {
        os = 'Android';
        const androidMatch = ua.match(/Android (\d+\.\d+)/);
        if (androidMatch) {
          osVersion = androidMatch[1];
        }
        // Detect architecture
        if (ua.includes('arm64') || ua.includes('aarch64')) {
          osArch = 'arm64';
        } else if (ua.includes('arm')) {
          osArch = 'ARM';
        } else if (ua.includes('x86')) {
          osArch = 'x86';
        }
      } else if (ua.includes('iOS')) {
        os = 'iOS';
        const iosMatch = ua.match(/OS (\d+_\d+)/);
        if (iosMatch) {
          osVersion = iosMatch[1].replace(/_/g, '.');
        }
        // iOS is ARM only
        osArch = 'arm64';
      }

      // Parse browser name and version
      let browserName = '—';
      let browserVersion = '—';
      
      if (ua.includes('Firefox')) {
        browserName = 'Firefox';
        const match = ua.match(/Firefox\/(\d+\.\d+)/);
        if (match) browserVersion = match[1];
      } else if (ua.includes('Chrome') && !ua.includes('Edg')) {
        browserName = 'Chrome';
        const match = ua.match(/Chrome\/(\d+\.\d+)/);
        if (match) browserVersion = match[1];
      } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
        browserName = 'Safari';
        const match = ua.match(/Version\/(\d+\.\d+)/);
        if (match) browserVersion = match[1];
      } else if (ua.includes('Edg')) {
        browserName = 'Edge';
        const match = ua.match(/Edg\/(\d+\.\d+)/);
        if (match) browserVersion = match[1];
      }

      snapshot = {
        ianaTz: getResolvedIanaTimeZone() ?? '—',
        languages: navigator.languages?.length
          ? Array.from(navigator.languages).join(', ')
          : navigator.language,
        resolvedLocale: ro.locale ?? '—',
        calendar: ro.calendar ?? '—',
        numberingSystem: ro.numberingSystem ?? '—',
        hourCycle: ro.hourCycle ?? '24h',
        os,
        osVersion,
        osArch,
        browserName,
        browserVersion
      };
    } catch {
      snapshot = null;
    }
  });
</script>

{#if snapshot}
  <div>
    <div class="mb-3 text-xs font-medium text-primary">{$t('shell.health.clientTitle')}</div>
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
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="shrink-0 text-muted-foreground">{$t('shell.health.operatingSystem')}</div>
        <div class="min-w-0 text-right text-xs">{snapshot.os} ({snapshot.osVersion} - {snapshot.osArch})</div>
      </div>
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="shrink-0 text-muted-foreground">{$t('shell.health.browser')}</div>
        <div class="min-w-0 text-right text-xs">{snapshot.browserName} ({snapshot.browserVersion})</div>
      </div>
    </div>
  </div>
{/if}
