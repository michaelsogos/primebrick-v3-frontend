<script lang="ts">
  /**
   * JsonAiChatPanel — the GENERIC JSON-schema assistant panel.
   *
   * Thin wrapper over the shared AiChatPanel shell + the generic
   * `useJsonSchemaAi` composable + the deterministic schema explorer.
   * Fully schema-agnostic: the caller injects the JSON Schema, the live
   * document, the apply callback and a human-readable `object_label`
   * (used in prompts: "Generate the <label> JSON").
   *
   * The config-entry-specific flows (capability scoping, localized topic
   * titles, error_label_key key-picker and translation previews) live in
   * `smart-json-config/json-config-ai-chat-panel.svelte` — this panel
   * never produces `key_picker`/`translations_preview` choices.
   */
  import { t } from '$lib/i18n';
  import AiChatPanel from '$lib/components/ui/smart-ai/ai-chat-panel.svelte';
  import type { useAiAssistant } from '$lib/components/ui/smart-ai/use-ai-assistant.svelte';
  import { useJsonSchemaAi } from './use-json-schema-ai.svelte';
  import { buildSchemaTopics, indexSchemaTopics, topicsToChoices, valueOptionsToChoices } from './json-schema-explorer';
  import JsonSchemaChoiceCard from './json-schema-choice-card.svelte';
  import type { JsonAssistantChoice } from './json-schema.types';
  import type { ChatAction } from '$lib/components/ui/smart-ai/chat-actions';
  import type { ChatMessage } from '$lib/components/ui/smart-ai/ai-assistant.types';
  import { Bot } from '@primebrick/ui/vendor/lucide';

  let {
    schema,
    object_label = 'JSON',
    current_json = '',
    on_apply_json,
  }: {
    /** The document's JSON Schema — the ONLY truth for prompts, topics
     *  and candidate validation. */
    schema: Record<string, unknown>;
    /** Human-readable document name used in prompts ("Generate the
     *  <object_label> JSON for X") — e.g. 'filter', 'type_config'. */
    object_label?: string;
    /** Current document text — string or live getter (a snapshot goes
     *  stale after the user applies a candidate). */
    current_json?: string | (() => string);
    /** Called with the COMPACT json when the user applies a candidate. */
    on_apply_json: (json: string) => void;
  } = $props();

  /** Snippet-facing handle — the shared base composable contract. */
  type AiHandle = ReturnType<typeof useAiAssistant<JsonAssistantChoice>>;
  type JsonAiHandle = ReturnType<typeof useJsonSchemaAi>;

  // Deterministic explorer: the schema's own properties/items tree —
  // no capability scoping, no localization (generic path; schema
  // descriptions surface verbatim).
  const topics = $derived(buildSchemaTopics(schema as never));
  const topicsIndex = $derived(indexSchemaTopics(topics));

  function buildSystemPrompt(resolvedSchema: object, json: string): string {
    return [
      `You are a JSON editing assistant for a "${object_label}" document.`,
      'The JSON Schema below is the ONLY source of truth for valid output:',
      JSON.stringify(resolvedSchema),
      '',
      'Rules:',
      '- Answer questions about what the document can contain using only the schema.',
      '- When asked to produce or modify the document, respond with JSON ONLY:',
      `  a complete ${object_label} document valid against the schema.`,
      '  No prose, no markdown fences, no explanation around the JSON.',
      '- Never invent properties not present in the schema.',
      '- Always preserve existing content the user did not ask to change —',
      '  apply the request as a merge, never as a reset.',
      '',
      'Current document:',
      json.trim() || '(empty)',
    ].join('\n');
  }

  /** Candidate validation — syntax gate; schema conformance is enforced
   *  by the system prompt plus the unknown-key strict check (which also
   *  feeds the validate-and-repair loop). */
  function validateCandidate(json: string) {
    try {
      JSON.parse(json);
      return { valid: true, errors: [] as string[] };
    } catch {
      return { valid: false, errors: ['Invalid JSON syntax'] };
    }
  }

  let created = $state<JsonAiHandle | null>(null);

  function createComposable(id: string): JsonAiHandle {
    const c = useJsonSchemaAi(id, {
      current_json: current_json ?? '',
      schema,
      validate: validateCandidate,
      build_system_prompt: buildSystemPrompt,
      assistant_key: 'json_generic',
      i18n_ns: 'app.smart.json.ai',
      on_chat_action: handleChatAction,
    });
    created = c;
    return c;
  }

  // Seed the deterministic explorer once the model is ready — same
  // load-lifecycle contract as the config panel (loading frames render
  // while `messages` is empty, so seeding earlier would suppress them).
  $effect(() => {
    if (!created?.state.is_ready) return;
    if (created.state.messages.length > 0) return;
    created.addLocalAssistantMessage(
      $t('app.smart.json.ai.explorer_intro'),
      topicsToChoices(topics),
    );
  });

  /**
   * Chat-action executor — the model resolved a pending choice from the
   * user's natural-language reply. Mirrors the card-click semantics:
   * - topic pick → cascade / value CTAs / leaf prompt
   * - value pick → "set X to V" model prompt
   * - config apply/discard → apply + condensed resolution (+ explorer reseed)
   * Navigation picks do NOT resolve the message — like clicks.
   */
  function handleChatAction(action: ChatAction, message: ChatMessage<JsonAssistantChoice>) {
    const ai = created;
    if (!ai) return;
    const choices = message.choices ?? [];
    const target =
      action.action === 'pick'
        ? choices[action.index ?? -1]
        : choices.find((c) => c.kind === 'config');
    if (!target) return;

    if (target.kind === 'topic') {
      const node = topicsIndex.get(target.path);
      const header = node?.description ? `${node.title}: ${node.description}` : (node?.title ?? target.title);
      if (node && node.children.length > 0) {
        ai.addLocalAssistantMessage(header, topicsToChoices(node.children));
      } else if (node?.value_options?.length) {
        ai.addLocalAssistantMessage(header, valueOptionsToChoices(node.path, node.value_options));
      } else {
        const hint = node?.schema_description ?? node?.description;
        void ai.sendModelMessage(
          hint
            ? `Generate the ${object_label} JSON for "${node?.title ?? target.title}". ${hint}`
            : `Generate the ${object_label} JSON for "${target.title}".`,
        );
      }
      return;
    }

    if (target.kind === 'value') {
      void ai.sendModelMessage(
        `Set "${target.path}" to ${JSON.stringify(target.value)} and return the complete ${object_label} JSON.`,
      );
      return;
    }

    if (target.kind === 'config') {
      if (action.action === 'discard' || !target.valid) {
        ai.resolveChoice(message.uuid, 'discarded', {
          condensed_content: $t('app.smart.json.ai.discarded_summary'),
        });
        return;
      }
      try {
        const compact = JSON.stringify(JSON.parse(target.json));
        on_apply_json(compact);
        ai.resolveChoice(message.uuid, 'applied', {
          condensed_content: $t('app.smart.json.ai.applied_summary', { json: compact }),
        });
        ai.addLocalAssistantMessage(
          $t('app.smart.json.ai.continue_hint'),
          topicsToChoices(topics),
        );
      } catch { /* invalid JSON cannot be applied anyway */ }
    }
  }
</script>

{#snippet choicesSnippet({ ai, message }: {
  ai: AiHandle;
  message: {
    uuid: string;
    choices?: JsonAssistantChoice[];
    content: string;
    display_content?: string;
    resolution?: 'applied' | 'discarded';
  };
})}
  {@const bubble = message.display_content ?? message.content}
  {#if bubble && !(message.resolution === 'discarded' && !message.display_content)}
    <div class="flex gap-2 justify-start">
      <div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Bot class="size-4 text-primary" />
      </div>
      <div class="bg-muted rounded-lg px-3 py-2 text-xs whitespace-pre-wrap">
        {bubble}
      </div>
    </div>
  {/if}

  <div class="space-y-2" data-testid="smart-json-ai-choices">
    {#each (message.choices ?? []).filter((c) => c.kind !== 'value') as choice, i (i)}
      <JsonSchemaChoiceCard
        {choice}
        {ai}
        topics_index={topicsIndex}
        {on_apply_json}
        testid_prefix="smart-json-ai"
        message_uuid={message.uuid}
        resolution={message.resolution}
        i18n_ns="app.smart.json.ai"
        {object_label}
        on_after_apply={() =>
          ai.addLocalAssistantMessage(
            $t('app.smart.json.ai.continue_hint'),
            topicsToChoices(topics),
          )}
      />
    {/each}
  </div>

  {@const valueChoices = (message.choices ?? []).filter((c) => c.kind === 'value')}
  {#if valueChoices.length > 0 && !message.resolution}
    <div class="flex flex-wrap justify-end gap-2" data-testid="smart-json-ai-values">
      {#each valueChoices as choice, i (i)}
        <JsonSchemaChoiceCard
          {choice}
          {ai}
          topics_index={topicsIndex}
          {on_apply_json}
          testid_prefix="smart-json-ai"
          message_uuid={message.uuid}
          resolution={message.resolution}
          i18n_ns="app.smart.json.ai"
          {object_label}
        />
      {/each}
    </div>
  {/if}
{/snippet}

<AiChatPanel
  assistant_id="smart_json_generic"
  assistant_key="json_generic"
  i18n_ns="app.smart.json.ai"
  topic_key="app.smart.json.ai.topic"
  testid_prefix="smart-json-ai"
  create_composable={createComposable}
  choices={choicesSnippet}
/>
