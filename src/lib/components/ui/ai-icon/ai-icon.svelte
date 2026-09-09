<script lang="ts">
  /**
   * AiIcon — reusable animated gradient sparkles icon for AI assistant features.
   *
   * Renders the Lucide "sparkles" SVG inline (not via the Lucide Icon wrapper)
   * because we need to inject an SVG <linearGradient> as the stroke color and
   * animate it with SMIL <animate> elements for a shimmer sweep effect.
   *
   * The gradient is sky-400 (#38bdf8) → indigo-400 (#818cf8), matching the
   * project's primary gradient (border-primary-gradient, text-primary-gradient).
   *
   * Props follow snake_case per data-model-conventions rule.
   */
  import { cn } from '$lib/utils';

  interface $$Props {
    /** Icon size in pixels. */
    size?: number;
    /** Stroke width. */
    stroke_width?: number;
    /** Additional CSS classes. */
    class?: string;
    /** Disable the shimmer animation (static gradient stroke only). */
    no_animation?: boolean;
  }

  let { size = 24, stroke_width = 2, class: className, no_animation = false }: $$Props = $props();

  // Unique gradient ID to avoid collisions when multiple instances are on the same page.
  const gradient_id = `ai-icon-grad-${Math.random().toString(36).slice(2, 10)}`;
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
  class={cn('lucide-icon lucide lucide-sparkles', className)}
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
      {#if !no_animation}
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
  <path
    d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"
  />
  <path d="M20 2v4" />
  <path d="M22 4h-4" />
  <circle cx="4" cy="20" r="2" />
</svg>
