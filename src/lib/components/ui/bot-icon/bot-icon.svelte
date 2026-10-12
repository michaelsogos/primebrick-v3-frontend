<script lang="ts">
  /**
   * BotIcon — reusable gradient Bot icon for AI assistant message avatars.
   *
   * Renders the Lucide "bot" SVG inline (not via the Lucide Icon wrapper)
   * because we need to inject an SVG <linearGradient> as the stroke color,
   * matching the project's primary gradient (same convention as AiIcon and
   * the FARO topbar icon).
   *
   * Props follow snake_case per data-model-conventions rule.
   */
  import { cn } from '$lib/utils';

  interface Props {
    /** Icon size in pixels. */
    size?: number;
    /** Stroke width. */
    stroke_width?: number;
    /** Additional CSS classes. */
    class?: string;
  }

  let { size = 24, stroke_width = 2, class: className }: Props = $props();

  // Unique gradient ID to avoid collisions when multiple instances are on the same page.
  const gradient_id = `bot-icon-grad-${Math.random().toString(36).slice(2, 10)}`;
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
  class={cn('lucide-icon lucide lucide-bot', className)}
  aria-hidden="true"
>
  <defs>
    <linearGradient id={gradient_id} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#818cf8" />
    </linearGradient>
  </defs>
  <path d="M12 8V4H8" />
  <rect width="16" height="12" x="4" y="8" rx="2" />
  <path d="M2 14h2" />
  <path d="M20 14h2" />
  <path d="M15 13v2" />
  <path d="M9 13v2" />
</svg>
