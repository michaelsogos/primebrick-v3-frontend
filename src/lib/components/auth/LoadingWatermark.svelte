<script lang="ts">
  import { useId } from 'bits-ui';
  import { t } from '$lib/i18n';
  import type { Component } from 'svelte';

  type Props = {
    icon: Component<{ color?: string; class?: string }>;
    titleKey: string;
    hintKey: string;
  };

  let { icon: Icon, titleKey, hintKey }: Props = $props();
  const gradientId = useId();
</script>

<div class="grid min-h-56 place-items-center p-3" data-testid="auth-loading-watermark">
  <div class="relative flex flex-col items-center gap-2 text-center">
    <div class="pb-loading-watermark">
      <Icon class="size-20" color="url(#pb-gradient-{gradientId})" />
    </div>
    <div class="text-sm font-medium text-muted-foreground">
      {$t(titleKey)}
    </div>
    <div class="text-xs text-muted-foreground">
      {$t(hintKey)}
    </div>
  </div>
</div>

<svg width="0" height="0" class="absolute" aria-hidden="true">
  <defs>
    <linearGradient id="pb-gradient-{gradientId}" x1="0" y1="0" x2="1" y2="1">
      <stop class="pb-gradient-stop-1" offset="0%" stop-color="#38bdf8" />
      <stop class="pb-gradient-stop-2" offset="100%" stop-color="#818cf8" />
    </linearGradient>
  </defs>
</svg>

<style>
  .pb-loading-watermark {
    transform-origin: center;
    animation: pb-loading-pulse 2s ease-in-out infinite;
  }

  @keyframes pb-loading-pulse {
    0%,
    100% {
      opacity: 0.55;
      transform: translateY(0) scale(1);
    }
    50% {
      opacity: 0.85;
      transform: translateY(-6px) scale(1.06);
    }
  }

  .pb-gradient-stop-1 {
    animation: pb-gradient-shift-1 1s ease-in-out infinite alternate;
  }

  .pb-gradient-stop-2 {
    animation: pb-gradient-shift-2 1s ease-in-out infinite alternate;
  }

  @keyframes pb-gradient-shift-1 {
    0% {
      stop-color: #38bdf8;
    }
    100% {
      stop-color: #818cf8;
    }
  }

  @keyframes pb-gradient-shift-2 {
    0% {
      stop-color: #818cf8;
    }
    100% {
      stop-color: #38bdf8;
    }
  }
</style>
