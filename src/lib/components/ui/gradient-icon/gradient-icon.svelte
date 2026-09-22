<script lang="ts">
  /**
   * GradientIcon — lucide-shaped SVG icon stroked with the project's primary
   * gradient (sky-400 → indigo-400 → sky-400), like AiIcon but generic:
   * pass any icon's path data instead of the hardcoded sparkles shape.
   *
   * Inline SVG is required because lucide's Icon wrapper only supports
   * `stroke="currentColor"` — a gradient stroke needs an SVG
   * <linearGradient> referenced via stroke="url(#id)".
   *
   * `animated` adds the same SMIL shimmer sweep as AiIcon; default is static
   * (gradient stroke, no motion).
   *
   * Props follow snake_case per data-model-conventions rule.
   */
  import { cn } from '$lib/utils';

  interface $$Props {
    /** Lucide path `d` attributes — the icon's inner nodes, in order. */
    paths: string[];
    /** Icon size in pixels. */
    size?: number;
    /** Stroke width. */
    stroke_width?: number;
    /** Additional CSS classes. */
    class?: string;
    /** Animate the gradient with the shimmer sweep (default: static). */
    animated?: boolean;
  }

  let { paths, size = 24, stroke_width = 2, class: className, animated = false }: $$Props = $props();

  // Unique gradient ID to avoid collisions when multiple instances are on the same page.
  const gradient_id = `gradient-icon-${Math.random().toString(36).slice(2, 10)}`;
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="url(#{gradient_id})"
  stroke-width={stroke_width}
  stroke-linecap="round"
  stroke-linejoin="round"
  class={cn('lucide-icon lucide', className)}
  aria-hidden="true"
>
  <defs>
    <linearGradient
      id={gradient_id}
      x1="0"
      y1="0"
      x2="24"
      y2="0"
      gradientUnits="userSpaceOnUse"
      spreadMethod="repeat"
    >
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="50%" stop-color="#818cf8" />
      <stop offset="100%" stop-color="#38bdf8" />
      {#if animated}
        <animateTransform
          attributeName="gradientTransform"
          type="translate"
          values="0 0; 24 0"
          dur="2s"
          repeatCount="indefinite"
        />
      {/if}
    </linearGradient>
  </defs>
  {#each paths as d}
    <path {d} />
  {/each}
</svg>
