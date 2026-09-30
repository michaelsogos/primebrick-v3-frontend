<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { getResolvedIanaTimeZone } from '$lib/browser-iana-timezone';
  import { t } from '$lib/i18n';
  import { cn } from '$lib/utils';
  import MapPin from '@lucide/svelte/icons/map-pin';
  import Languages from '@lucide/svelte/icons/languages';
  import Globe from '@lucide/svelte/icons/globe';
  import Calendar from '@lucide/svelte/icons/calendar';
  import Hash from '@lucide/svelte/icons/hash';
  import Clock from '@lucide/svelte/icons/clock';
  import Monitor from '@lucide/svelte/icons/monitor';
  import PanelTop from '@lucide/svelte/icons/panel-top';
  import Gpu from '@lucide/svelte/icons/gpu';
  import BrainCircuit from '@lucide/svelte/icons/brain-circuit';
  import MemoryStick from '@lucide/svelte/icons/memory-stick';
  import Cpu from '@lucide/svelte/icons/cpu';
  import CircuitBoard from '@lucide/svelte/icons/circuit-board';
  import RankMeter from '$lib/components/ui/smart-regex-input/RankMeter.svelte';
  import { useMachineCapabilities } from '$lib/composables/useMachineCapabilities.svelte';

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

  // Machine capabilities — module-level singleton with 24h localStorage
  // cache. Hydrate instantly; re-run the bench in background ONLY when the
  // cache is stale (same policy as the /ai page). All GPU resources are
  // released at the end of each bench (device.destroy() + WebGL loseContext).
  const machine = useMachineCapabilities();
  let caps = $derived(machine.state.caps);
  let machineRank = $derived(machine.machineRank);
  let measuring = $derived(machine.state.measuring || machine.state.probing_vram);

  onMount(() => {
    if (!browser) return;
    if (!machine.state.caps) machine.hydrate();
    if (machine.isStale() && !measuring) {
      void machine.refresh();
    }
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
    <div class="space-y-3">
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="flex shrink-0 items-center gap-2 text-muted-foreground">
          <MapPin class="size-4 shrink-0 text-primary" />
          <span>{$t('app.health.ianaTimezone')}</span>
        </div>
        <div class="min-w-0 break-all text-right text-xs">{snapshot.ianaTz}</div>
      </div>
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="flex shrink-0 items-center gap-2 text-muted-foreground">
          <Languages class="size-4 shrink-0 text-primary" />
          <span>{$t('app.health.preferredLanguages')}</span>
        </div>
        <div class="min-w-0 break-all text-right text-xs">{snapshot.languages}</div>
      </div>
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="flex shrink-0 items-center gap-2 text-muted-foreground">
          <Globe class="size-4 shrink-0 text-primary" />
          <span>{$t('app.health.resolvedLocale')}</span>
        </div>
        <div class="min-w-0 break-all text-right text-xs">{snapshot.resolvedLocale}</div>
      </div>
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="flex shrink-0 items-center gap-2 text-muted-foreground">
          <Calendar class="size-4 shrink-0 text-primary" />
          <span>{$t('app.health.calendarSystem')}</span>
        </div>
        <div class="min-w-0 text-right text-xs">{snapshot.calendar}</div>
      </div>
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="flex shrink-0 items-center gap-2 text-muted-foreground">
          <Hash class="size-4 shrink-0 text-primary" />
          <span>{$t('app.health.numberingSystem')}</span>
        </div>
        <div class="min-w-0 text-right text-xs">{snapshot.numberingSystem}</div>
      </div>
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="flex shrink-0 items-center gap-2 text-muted-foreground">
          <Clock class="size-4 shrink-0 text-primary" />
          <span>{$t('app.health.hourCycle')}</span>
        </div>
        <div class="min-w-0 text-right text-xs">{snapshot.hourCycle}</div>
      </div>
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="flex shrink-0 items-center gap-2 text-muted-foreground">
          <Monitor class="size-4 shrink-0 text-primary" />
          <span>{$t('app.health.operatingSystem')}</span>
        </div>
        <div class="min-w-0 text-right text-xs">{snapshot.os} ({snapshot.osVersion} - {snapshot.osArch})</div>
      </div>
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="flex shrink-0 items-center gap-2 text-muted-foreground">
          <PanelTop class="size-4 shrink-0 text-primary" />
          <span>{$t('app.health.browser')}</span>
        </div>
        <div class="min-w-0 text-right text-xs">{snapshot.browserName} ({snapshot.browserVersion})</div>
      </div>
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="flex shrink-0 items-center gap-2 text-muted-foreground">
          <Gpu class="size-4 shrink-0 text-primary" />
          <span>{$t('app.health.gpu')}</span>
        </div>
        <div class="flex min-w-0 flex-col items-end gap-1 text-right text-xs">
          <span class="truncate">{caps?.gpu_name ?? (measuring ? '…' : '—')}</span>
          {#if machineRank !== null}
            <RankMeter rank={machineRank} label={$t('app.health.gpuRank')} />
          {/if}
        </div>
      </div>
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="flex shrink-0 items-center gap-2 text-muted-foreground">
          <CircuitBoard class="size-4 shrink-0 text-primary" />
          <span>{$t('app.health.gpuDriver')}</span>
        </div>
        <div class="min-w-0 break-all text-right text-xs">
          {[caps?.adapter_description, caps?.adapter_vendor, caps?.adapter_architecture]
            .filter(Boolean)
            .join(' · ') || (measuring ? '…' : '—')}
        </div>
      </div>
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="flex shrink-0 items-center gap-2 text-muted-foreground">
          <Cpu class="size-4 shrink-0 text-primary" />
          <span>{$t('app.health.cpuThreads')}</span>
        </div>
        <div class="min-w-0 text-right text-xs">{caps?.cpu_threads ?? (measuring ? '…' : '—')}</div>
      </div>
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="flex shrink-0 items-center gap-2 text-muted-foreground">
          <MemoryStick class="size-4 shrink-0 text-primary" />
          <span>{$t('app.health.systemRam')}</span>
        </div>
        <div class="min-w-0 text-right text-xs">
          {caps?.system_memory_gb != null ? `~${caps.system_memory_gb} GB` : (measuring ? '…' : '—')}
        </div>
      </div>
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="flex shrink-0 items-center gap-2 text-muted-foreground">
          <MemoryStick class="size-4 shrink-0 text-primary" />
          <span>{$t('app.health.vramEstimate')}</span>
        </div>
        <div class="min-w-0 text-right text-xs">
          {caps?.memory_fast_mb != null
            ? `~${(caps.memory_fast_mb / 1024).toFixed(1)} GB`
            : (measuring ? '…' : '—')}
        </div>
      </div>
      <div class="flex items-start justify-between gap-3 text-sm">
        <div class="flex shrink-0 items-center gap-2 text-muted-foreground">
          <BrainCircuit class={cn('size-4 shrink-0', caps?.available === false ? 'text-destructive' : 'text-primary')} />
          <span>{$t('app.health.aiEnabled')}</span>
        </div>
        <div class={cn('min-w-0 text-right text-xs', caps?.available === false && 'text-destructive')}>
          {caps === null ? '—' : caps.available ? $t('app.smart.regex.ai.yes') : $t('app.smart.regex.ai.no')}
        </div>
      </div>
    </div>
  </div>
{/if}
