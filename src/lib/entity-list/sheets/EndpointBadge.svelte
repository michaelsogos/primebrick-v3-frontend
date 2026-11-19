<script lang="ts">
  /**
   * EndpointBadge — a labeled full-width endpoint badge, the SAME
   * anatomy `EntityRecordUid` uses for the record identity block:
   * `{label}` caption + h-9 mono badge with icon, truncated value and
   * the raw subject in the tooltip. Consumed by sheet panels that must
   * name a wire endpoint (the mapper viewer's SOURCE / DEST EVENT
   * heads) — kept at sheets/ level so panels render the shared anatomy
   * rather than re-implementing it inline.
   */
  import { Badge, Label, DynamicIcon, colorCssFromToken } from '@primebrick/ui';
  import { t } from '$lib/i18n';

  let {
    label_key,
    icon,
    icon_color,
    text,
    tip,
    testid,
  }: {
    /** i18n key for the caption (translated by the caller's $t scope). */
    label_key: string;
    /** Lucide name for the endpoint archetype (emit `zap` / callable `send` / schedule `calendar-clock`). */
    icon: string;
    /** Color token for the icon (same vocabulary as the census option icons). */
    icon_color: string;
    /** Resolved display text (translated label or raw subject fallback). */
    text: string;
    /** Tooltip — raw subject (+ description when the census declares one). */
    tip?: string;
    /** data-testid hook for the wrapping block (kebab-case, e2e convention). */
    testid: string;
  } = $props();
</script>

<div class="space-y-1.5" data-testid={testid}>
  <Label for="{testid}-badge">{$t(label_key)}</Label>
  <Badge
    id="{testid}-badge"
    variant="secondary"
    class="h-9 w-full max-w-full justify-start gap-2 truncate px-3 font-mono shadow-none [&>svg]:size-4"
    title={tip ?? text}
  >
    <DynamicIcon name={icon} size={16} class="shrink-0" style="color:{colorCssFromToken(icon_color)}" />
    <span class="truncate">{text}</span>
  </Badge>
</div>
