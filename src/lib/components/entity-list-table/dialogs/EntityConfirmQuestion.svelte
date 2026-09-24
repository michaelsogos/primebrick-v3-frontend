<script lang="ts">
  import { t } from '$lib/i18n';

  /**
   * Standard body copy for entity delete/restore dialogs — renders the
   * convention-built question with styled placeholders:
   *   "Sei sicuro di voler eliminare <strong>il Modello AI</strong>
   *    <em class="font-semibold">"Qwen2.5…"</em>?"
   * `action="delete"` also renders the undo-warning second line.
   */
  interface EntityConfirmQuestionProps {
    action: 'delete' | 'restore';
    entity: string;
    recordName?: string;
  }

  let { action, entity, recordName }: EntityConfirmQuestionProps = $props();

  const ENTITY_MARK = 'E';
  const NAME_MARK = 'N';

  let singularKey = $derived(`system.entities.${entity}.singular`);
  let definiteKey = $derived(`system.entities.${entity}.singular_definite`);
  let entityName = $derived($t(singularKey));
  // Definite form (with article, e.g. "il Modello AI") — falls back to the
  // bare singular when the key is missing ($t echoes the key).
  let entityDefinite = $derived.by(() => {
    const v = $t(definiteKey);
    return v === definiteKey ? entityName : v;
  });

  let segments = $derived.by(() => {
    const raw = $t(`app.common.${action}EntityConfirm`, {
      entity: ENTITY_MARK,
      name: NAME_MARK
    });
    const [pre, rest = ''] = raw.split(ENTITY_MARK);
    const [mid, post = ''] = rest.split(NAME_MARK);
    return { pre, mid, post };
  });
</script>

{segments.pre}<span class="font-semibold">{entityDefinite}</span>{segments.mid}{#if recordName}&nbsp;<em class="font-semibold">"{recordName}"</em>{/if}{segments.post}{#if action === 'delete'}<span class="mt-1 block">{$t('app.common.deleteConfirm')}</span>{/if}
