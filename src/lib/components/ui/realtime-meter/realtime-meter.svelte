<!--
  RealtimeMeter — generic scrolling line graph for real-time sampled values.

  Feed it `value` whenever a new sample arrives; it buffers the samples and
  renders a canvas line that scrolls left over a fixed time window (game
  launcher style). The Y axis auto-scales to "nice" cuts (1/2/2.5/5 ×10ⁿ with
  headroom) with smooth transitions; a header shows the current value + unit
  plus an optional preformatted secondary readout.

  Purely presentational — no knowledge of what the samples mean.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  let {
    value,
    unit = '',
    label,
    secondary,
    window_ms = 30_000,
    height = 56,
    testid,
  }: {
    value: number;
    unit?: string;
    label?: string;
    secondary?: string;
    window_ms?: number;
    height?: number;
    testid?: string;
  } = $props();

  type Sample = { t: number; v: number };
  let samples: Sample[] = [];
  let lastValue: number | null = null;

  let canvas: HTMLCanvasElement | null = $state(null);
  let wrapEl: HTMLDivElement | null = $state(null);
  let width = $state(0);
  let scaleY = $state(1); // smoothed display max
  let peak = $state(0);

  // Push a sample whenever `value` changes (skip duplicates of the first read).
  $effect(() => {
    if (value === lastValue && lastValue !== null) return;
    lastValue = value;
    samples.push({ t: performance.now(), v: value });
    const cap = Math.max(64, Math.ceil(window_ms / 100));
    if (samples.length > cap) samples.splice(0, samples.length - cap);
  });

  /** Next "nice" ceiling ≥ v: 1/1.5/2/2.5/3/4/5/7.5 ×10^n with 15% headroom. */
  function niceCeil(v: number): number {
    const target = v * 1.15;
    const pow = Math.pow(10, Math.floor(Math.log10(Math.max(target, 1e-9))));
    for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
      if (m * pow >= target) return m * pow;
    }
    return 10 * pow;
  }

  onMount(() => {
    const ro = new ResizeObserver((entries) => {
      width = entries[0]?.contentRect.width ?? 0;
    });
    if (wrapEl) ro.observe(wrapEl);

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || width <= 0) return;

      const dpr = window.devicePixelRatio || 1;
      const w = width;
      const h = height;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const now = performance.now();
      const visible = samples.filter((s) => now - s.t <= window_ms);
      const maxV = visible.reduce((m, s) => Math.max(m, s.v), 0);
      peak = Math.max(peak, maxV);

      // Smooth the Y ceiling toward its nice-cut target.
      const targetY = niceCeil(Math.max(maxV, 1e-6));
      scaleY += (targetY - scaleY) * 0.08;

      const css = getComputedStyle(canvas);
      const muted = css.getPropertyValue('--muted-foreground').trim() || '#888';
      const lineGrad = ctx.createLinearGradient(0, 0, w, 0);
      lineGrad.addColorStop(0, '#38bdf8');
      lineGrad.addColorStop(0.5, '#6366f1');
      lineGrad.addColorStop(1, '#8b5cf6');

      // Gridlines at 1/3 and 2/3 of the scale.
      ctx.font = '8px ui-monospace, monospace';
      ctx.fillStyle = muted;
      ctx.strokeStyle = muted;
      for (const f of [1 / 3, 2 / 3]) {
        const gy = h - f * h;
        ctx.globalAlpha = 0.15;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
        ctx.globalAlpha = 0.7;
        ctx.fillText(formatTick(scaleY * f), 2, gy - 2);
      }
      ctx.globalAlpha = 1;

      if (visible.length >= 2) {
        const xOf = (t: number) => w - ((now - t) / window_ms) * w;
        const yOf = (v: number) => h - Math.min(1, v / scaleY) * (h - 2) - 1;

        // Fill under the line.
        const fill = ctx.createLinearGradient(0, 0, 0, h);
        fill.addColorStop(0, 'rgba(99,102,241,0.25)');
        fill.addColorStop(1, 'rgba(99,102,241,0)');
        ctx.beginPath();
        ctx.moveTo(xOf(visible[0].t), h);
        for (const s of visible) ctx.lineTo(xOf(s.t), yOf(s.v));
        ctx.lineTo(xOf(visible[visible.length - 1].t), h);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();

        // Line.
        ctx.beginPath();
        for (let i = 0; i < visible.length; i++) {
          const s = visible[i];
          const x = xOf(s.t);
          const y = yOf(s.v);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  });

  function formatTick(v: number): string {
    return v >= 10 ? v.toFixed(0) : v.toFixed(1);
  }
</script>

<div class="w-full max-w-xs" data-testid={testid} bind:this={wrapEl}>
  <div class="flex items-baseline justify-between font-mono text-[10px]">
    {#if label}
      <span class="text-muted-foreground">{label}</span>
    {:else}
      <span></span>
    {/if}
    <span class="tabular-nums">
      <span class="font-semibold text-foreground">{value.toFixed(1)}</span>
      <span class="text-muted-foreground"> {unit}</span>
      {#if secondary}
        <span class="text-muted-foreground"> · {secondary}</span>
      {/if}
    </span>
  </div>
  <canvas
    bind:this={canvas}
    style="width:100%; height:{height}px;"
    data-testid={testid ? `${testid}-graph` : undefined}
  ></canvas>
</div>
