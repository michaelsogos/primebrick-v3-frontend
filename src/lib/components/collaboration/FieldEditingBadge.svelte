<script lang="ts">
  /**
   * FieldEditingBadge — chat-style "… sta modificando" indicator placed at
   * the right edge of a form field's label row while another session holds
   * the field in EDITING presence state.
   *
   * - 1 editor → "{name} sta modificando" (same-user other tab resolves to
   *   "Tu — altra scheda" upstream in useCollaborativeForm.fieldEditorNames)
   * - N editors → "{count} utenti stanno modificando"
   * - Trailing dots animate like a typing indicator.
   */
  import { t } from '$lib/i18n';

  let { names }: { names: string[] } = $props();

  const label = $derived(
    names.length === 1
      ? $t('app.collaboration.editing_field', { name: names[0] })
      : $t('app.collaboration.editing_field_multi', { count: names.length }),
  );
</script>

{#if names.length > 0}
  <span
    class="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
    data-testid="field-editing-badge"
  >
    {label}
    <span class="editing-dots" aria-hidden="true">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
    </span>
  </span>
{/if}

<style>
  .editing-dots .dot {
    display: inline-block;
    width: 3px;
    height: 3px;
    margin-left: 1px;
    border-radius: 9999px;
    background: currentColor;
    animation: editing-dot-blink 1.2s infinite;
  }
  .editing-dots .dot:nth-child(2) {
    animation-delay: 0.2s;
  }
  .editing-dots .dot:nth-child(3) {
    animation-delay: 0.4s;
  }
  @keyframes editing-dot-blink {
    0%,
    60%,
    100% {
      opacity: 0.25;
    }
    30% {
      opacity: 1;
    }
  }
</style>
