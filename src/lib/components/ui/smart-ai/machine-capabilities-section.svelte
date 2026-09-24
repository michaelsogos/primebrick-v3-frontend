<script lang="ts">
  /**
   * MachineCapabilitiesSection — empirical machine benchmark for the AI
   * settings page. Runs the light bench (bandwidth + GFLOPS) once on mount,
   * session-cached; VRAM knee probe only fires from the explicit CTA.
   *
   * Machine rank (1-5) = highest model power_level whose working-set
   * requirement fits the measured dedicated VRAM (minus headroom) — or the
   * total GPU budget on shared-only systems. Same scale as ai_model.power_level.
   */
  import { t } from '$lib/i18n';
  import { onMount } from 'svelte';
  import { useMachineCapabilities } from '$lib/composables/useMachineCapabilities.svelte';
  import ScoreGauge from '$lib/components/ui/smart-regex-input/ScoreGauge.svelte';
  import GpuVendorIcon from '$lib/components/ui/smart-ai/gpu-vendor-icon.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Cpu, Gauge, MemoryStick, RotateCcw, Zap } from '@lucide/svelte';

  const machine = useMachineCapabilities();

  let caps = $derived(machine.state.caps);
  let measuring = $derived(machine.state.measuring);
  let probingVram = $derived(machine.state.probing_vram);
  let machineRank = $derived(machine.machineRank);

  onMount(() => {
    if (!machine.state.caps) machine.hydrate();
    // Auto re-measure only when the 24h TTL expired — otherwise CTA-only.
    // The bounded VRAM ladder (~4s, <=12GB) rides along so the rank is
    // always computed on refresh instead of staying "—".
    if (machine.isStale() && !machine.state.measuring && !machine.state.probing_vram) {
      void machine.refresh();
    } else if (machine.state.caps?.memory_fast_mb == null && !machine.state.probing_vram) {
      // Fresh cache entry written before the probe ran — fill the memory
      // measurement once so the rank doesn't stay "—" for 24h.
      void machine.probeVram();
    }
  });
</script>

<section class="space-y-3" data-testid="ai-settings-machine-section">
  <div class="flex items-center justify-between gap-2">
    <div class="flex items-center gap-2">
      <Cpu class="size-4 text-foreground/70" />
      <h2 class="text-sm font-semibold">{$t('system.settings.ai.machine.title')}</h2>
    </div>
    <div class="flex items-center gap-2">
      {#if caps?.available || !caps}
        <Button
          variant="soft"
          size="icon-sm"
          onclick={() => machine.refresh()}
          disabled={probingVram || measuring}
          aria-label={$t('system.entities.list.refresh')}
          title={$t('system.entities.list.refresh')}
          data-testid="ai-machine-refresh-cta"
        >
          <RotateCcw class={probingVram || measuring ? 'size-4 animate-spin' : 'size-4'} />
        </Button>
      {/if}
    </div>
  </div>

  {#if measuring && !caps}
    <div class="flex items-center gap-2 text-sm text-muted-foreground">
      <div class="size-4 animate-spin rounded-full border-2 border-muted border-t-foreground"></div>
      {$t('system.settings.ai.machine.measuring')}
    </div>
  {:else if caps && !caps.available}
    <div class="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground" data-testid="ai-machine-unavailable">
      {$t('system.settings.ai.machine.unavailable')}
    </div>
  {:else if caps}
    <div class="rounded-lg border border-border/60 p-3">
      <div class="flex items-start gap-4 min-w-0">
        <!-- Identity + measured metrics -->
        <div class="min-w-0 flex-1 space-y-1">
          <div class="flex items-center gap-2">
            <GpuVendorIcon vendor={caps.gpu_vendor} class="size-5 shrink-0" />
            <span class="text-sm font-medium" data-testid="ai-machine-gpu-name">{caps.gpu_name ?? 'GPU'}</span>
          </div>
          {#if caps.adapter_vendor}
            <div class="text-xs text-muted-foreground">{caps.adapter_vendor}</div>
          {/if}
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
            {#if caps.bandwidth_gbs !== null}
              <span class="flex items-center gap-1" title={$t('system.settings.ai.machine.bandwidth')} data-testid="ai-machine-bandwidth">
                <Zap class="size-3" />
                {Math.round(caps.bandwidth_gbs)} GB/s
              </span>
            {/if}
            {#if caps.gflops !== null}
              <span class="flex items-center gap-1" title={$t('system.settings.ai.machine.compute')} data-testid="ai-machine-gflops">
                <Gauge class="size-3" />
                {caps.gflops >= 1000 ? `${(caps.gflops / 1000).toFixed(1)} TFLOPS` : `${Math.round(caps.gflops)} GFLOPS`}
              </span>
            {/if}
            {#if caps.vram_dedicated_mb !== null}
              <span class="flex items-center gap-1" title={$t('system.settings.ai.machine.vram_dedicated')} data-testid="ai-machine-vram">
                <MemoryStick class="size-3" />
                {(caps.vram_dedicated_mb / 1024).toFixed(1)} GB VRAM
              </span>
            {:else if caps.memory_fast_mb !== null}
              <span
                class="flex items-center gap-1 {caps.memory_fits_catalog ? 'text-emerald-600 dark:text-emerald-400' : ''}"
                title={$t('system.settings.ai.machine.fits_catalog')}
                data-testid="ai-machine-vram"
              >
                <MemoryStick class="size-3" />
                ≥{(caps.memory_fast_mb / 1024).toFixed(0)} GB
              </span>
            {/if}
            {#if caps.system_memory_gb !== null}
              <span class="flex items-center gap-1" title={$t('system.settings.ai.machine.system_memory')} data-testid="ai-machine-ram">
                <Cpu class="size-3" />
                {caps.system_memory_gb} GB RAM
              </span>
            {/if}
            {#if caps.cpu_threads !== null}
              <span class="flex items-center gap-1" title={$t('system.settings.ai.machine.cpu_threads')} data-testid="ai-machine-cpu">
                <Cpu class="size-3" />
                {caps.cpu_threads} {$t('system.settings.ai.machine.cpu_threads')}
              </span>
            {/if}
          </div>
          {#if caps.errors.length > 0}
            <div class="text-[10px] text-amber-600 dark:text-amber-400 font-mono break-all">
              {caps.errors[0]}
            </div>
          {/if}
        </div>

        <!-- Machine rank gauge — pinned to the far right; "—" until the
             VRAM probe provides the memory data the rank needs. -->
        <div class="flex shrink-0 items-center self-center pl-4">
          <ScoreGauge value={machineRank} label={$t('system.settings.ai.machine.machine_rank')} />
        </div>
      </div>
    </div>
  {/if}
</section>
