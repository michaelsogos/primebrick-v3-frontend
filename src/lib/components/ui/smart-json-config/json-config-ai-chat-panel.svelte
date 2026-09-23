<script lang="ts">
  /**
   * JsonConfigAiChatPanel — JSON config assistant panel.
   *
   * Thin wrapper over the shared AiChatPanel shell. Keeps only the
   * JSON-specific behavior: composable creation with the type_config schema,
   * the deterministic schema-explorer seed message, and the choice card
   * rendering (topic cascade + config preview).
   */
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { get } from 'svelte/store';
  import AiChatPanel from '$lib/components/ui/smart-ai/ai-chat-panel.svelte';
  import type { useAiAssistant } from '$lib/components/ui/smart-ai/use-ai-assistant.svelte';
  import { useJsonConfigAi } from './use-json-config-ai.svelte';
  import { schemaForCapabilities } from './type-config-explorer';
  import { localizeTopics } from './type-config-i18n';
  import { buildSchemaTopics, indexSchemaTopics, topicsToChoices, valueOptionsToChoices, errorLabelRuleFromPath, setJsonPath } from '$lib/components/ui/smart-json-assistant/json-schema-explorer';
  import JsonSchemaChoiceCard from '$lib/components/ui/smart-json-assistant/json-schema-choice-card.svelte';
  import { typeConfigJsonSchema, autoErrorLabelKey } from '$lib/config/type-config-schema';
  import { addPendingTranslation } from '$lib/i18n/pending-translations.svelte';
  import { UI_LANGS } from '$lib/i18n/languages';
  import { useTypeCapabilities } from '$lib/composables/useTypeCapabilities.svelte';
  import type { ConfigEntryType } from '$lib/api-types';
  import type { JsonAssistantChoice } from '$lib/components/ui/smart-json-assistant/json-schema.types';
  import type { ChatAction } from '$lib/components/ui/smart-ai/chat-actions';
  import type { ChatMessage } from '$lib/components/ui/smart-ai/ai-assistant.types';
  import { onMount } from 'svelte';
  import Bot from '@lucide/svelte/icons/bot';

  let {
    config_type,
    config_key = '',
    current_json = '',
    on_apply_json,
  }: {
    /** The config row's type — scopes topics and the prompt to applicable config. */
    config_type: ConfigEntryType;
    /** Row's config_key — drives auto-generated error_label_key suggestions.
     *  String or live getter (getter survives edits while the sheet is open). */
    config_key?: string | (() => string);
    /** Current type_config JSON — string or live getter (getter survives
     *  applies: the builder mutates while the sheet stays open). */
    current_json?: string | (() => string);
    /** Called with the COMPACT json when the user applies a candidate. */
    on_apply_json: (json: string) => void;
  } = $props();

  /** Snippet-facing handle — the shared base composable contract. */
  type AiHandle = ReturnType<typeof useAiAssistant<JsonAssistantChoice>>;
  /** Full JSON-schema handle — includes proposeCandidate. */
  type JsonAiHandle = ReturnType<typeof useJsonConfigAi>;

  // Deterministic explorer: TYPE_CAPABILITIES (SDK, via config_entry/meta)
  // scopes the schema to what this type can actually configure — no
  // agnostic JSON-path walk, no model involvement in navigation.
  const typeCapabilities = useTypeCapabilities();
  onMount(() => void typeCapabilities.ensureLoaded());
  const caps = $derived(typeCapabilities.capabilitiesFor(config_type));
  const scopedSchema = $derived(schemaForCapabilities(typeConfigJsonSchema as never, caps));
  const topics = $derived(buildSchemaTopics(scopedSchema));
  // Localized titles/descriptions — same i18n keys the builder form uses.
  const localizedTopics = $derived(localizeTopics(topics, caps, $t));
  const topicsIndex = $derived(indexSchemaTopics(localizedTopics));

  /**
   * Create the composable. The deterministic explorer message is seeded
   * ONLY when the model becomes ready — the shared panel renders its
   * standard download/VRAM loading frames while `messages` is empty, so
   * seeding earlier would suppress them (this assistant must look and
   * behave exactly like the regex one during the load lifecycle).
   */
  let created = $state<JsonAiHandle | null>(null);
  let capsLoaded = $state(false);

  function createComposable(id: string): JsonAiHandle {
    const c = useJsonConfigAi(
      id,
      current_json ?? '',
      () => scopedSchema,
      handleNewErrorMessage,
      handleChatAction,
      // Baseline revision: the typed text is a corrected error message —
      // re-run the same translate+preview flow with it (same key, new text).
      (text, choice) => handleNewErrorMessage(text, choice.path, errorLabelRuleFromPath(choice.path)),
    );
    created = c;
    void typeCapabilities.ensureLoaded().then(() => { capsLoaded = true; });
    return c;
  }

  // Seed whenever the conversation is empty and the model is ready — this
  // also re-seeds after "new session" (clearConversation empties messages).
  $effect(() => {
    if (!capsLoaded || !created?.state.is_ready) return;
    if (created.state.messages.length > 0) return;
    created.addLocalAssistantMessage(
      $t('app.smart.json.ai.explorer_intro'),
      topicsToChoices(localizedTopics),
    );
  });

  const currentJsonText = () =>
    typeof current_json === 'function' ? current_json() : current_json;
  const configKeyText = () =>
    typeof config_key === 'function' ? config_key() : config_key;

  /** Auto-generated error_label_key suggestion for a leaf path. */
  const suggestKey = (path: string) =>
    autoErrorLabelKey(configKeyText(), errorLabelRuleFromPath(path));

  /**
   * New error message flow: the model improves/translates the user's text
   * into every supported language, then a translations_preview card gates
   * per-language approval. NOTHING is inserted here — approved rows go to
   * the pending queue and are flushed atomically on the form save
   * ({entity, translations} tx); reject/discard leaves zero orphan rows.
   */
  async function handleNewErrorMessage(message: string, path: string, rule: string) {
    const ai = created;
    if (!ai) return;
    // A NEW user message always gets a user-owned key in custom.translations —
    // never reuse the system default: writing translations under
    // app.common.validation.* would overwrite shared seed rows for everyone.
    const key = `custom.config.${configKeyText().trim() || 'my_custom_setting'}.errors.${rule}`;
    const sourceLang = get(uiLang);
    const raw = await ai.generateOneOff(
      [
        'You are a UI copywriter. Rewrite and translate the given validation',
        'error message for each requested locale: short, clear, idiomatic.',
        `Respond with JSON ONLY, an object mapping each locale to its text: ${JSON.stringify(UI_LANGS)}.`,
      ].join(' '),
      `Source message (${sourceLang}): ${JSON.stringify(message)}`,
    );
    const match = raw.match(/\{[\s\S]*\}/);
    let generated: Record<string, string> = {};
    try {
      generated = match ? JSON.parse(match[0]) : {};
    } catch { generated = {}; }
    // Always seed the user's own text for their language even if the model
    // skipped it; fall back to the source text for missing locales.
    const translations: Record<string, string> = {};
    for (const lang of UI_LANGS) {
      translations[lang] =
        (generated[lang] ?? (lang === sourceLang ? message : generated[sourceLang])) || message;
    }
    ai.addLocalAssistantMessage(
      $t('app.smart.json.ai.translations_preview.intro', { key }),
      [{ kind: 'translations_preview', path, key, translations }],
    );
  }

  /**
   * Preview accepted — queue the approved languages as pending translations
   * (flushed inside the entity-save transaction) and propose the key merge
   * through the standard candidate card.
   */
  function handleAcceptTranslations(path: string, key: string, translations: Record<string, string>) {
    if (!created) return;
    addPendingTranslation(key, translations);
    proposeKeyMerge(path, key);
  }

  /**
   * Preview rejected — the key still lands in the JSON, but no translation
   * rows are queued: the user will provide translations later.
   */
  function handleRejectTranslations(path: string, key: string) {
    if (!created) return;
    proposeKeyMerge(path, key);
  }

  /** Deterministic merge — the proposed key lands in a preview card. */
  function proposeKeyMerge(path: string, key: string) {
    const ai = created;
    if (!ai) return;
    let merged: Record<string, unknown> = {};
    try {
      merged = JSON.parse(currentJsonText() || '{}');
    } catch { merged = {}; }
    ai.proposeCandidate(JSON.stringify(setJsonPath(merged, path, key)));
  }

  /**
   * Chat-action executor — the model resolved a pending choice from the
   * user's natural-language reply. Each branch reproduces EXACTLY the
   * semantics of the equivalent card click (JsonSchemaChoiceCard):
   * - topic pick → cascade / key-picker / value CTAs / leaf prompt
   * - value pick → "set X to V" model prompt
   * - config apply/discard → apply + condensed resolution (+ explorer reseed)
   * - translations_preview apply/discard → accept (all or langs subset) / reject
   * Navigation picks (topic/value) do NOT resolve the message — like clicks.
   */
  function handleChatAction(action: ChatAction, message: ChatMessage<JsonAssistantChoice>) {
    const ai = created;
    if (!ai) return;
    const choices = message.choices ?? [];
    const target =
      action.action === 'pick'
        ? choices[action.index ?? -1]
        : choices.find((c) => c.kind === 'config' || c.kind === 'translations_preview');
    if (!target) return;

    if (target.kind === 'topic') {
      const node = topicsIndex.get(target.path);
      const header = node?.description ? `${node.title}: ${node.description}` : (node?.title ?? target.title);
      if (node && node.children.length > 0) {
        ai.addLocalAssistantMessage(header, topicsToChoices(node.children));
      } else if (node?.leaf_kind === 'error_label_key') {
        ai.addLocalAssistantMessage(header, [{
          kind: 'key_picker',
          path: node.path,
          rule: errorLabelRuleFromPath(node.path),
          suggested_key: suggestKey(node.path),
        }]);
      } else if (node?.value_options?.length) {
        ai.addLocalAssistantMessage(header, valueOptionsToChoices(node.path, node.value_options));
      } else {
        const hint = node?.schema_description ?? node?.description;
        void ai.sendModelMessage(
          hint
            ? `Generate the type_config JSON for "${node?.title ?? target.title}". ${hint}`
            : `Generate the type_config JSON for "${target.title}".`,
        );
      }
      return;
    }

    if (target.kind === 'value') {
      void ai.sendModelMessage(
        `Set "${target.path}" to ${JSON.stringify(target.value)} and return the complete type_config JSON.`,
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
          topicsToChoices(localizedTopics),
        );
      } catch { /* invalid JSON cannot be applied anyway */ }
      return;
    }

    if (target.kind === 'translations_preview') {
      if (action.action === 'discard') {
        handleRejectTranslations(target.path, target.key);
        ai.resolveChoice(message.uuid, 'applied', {
          condensed_content: $t('app.smart.json.ai.translations_preview.key_only_summary', { key: target.key }),
        });
        return;
      }
      // Accept: explicit langs subset, or ALL languages when unspecified.
      const wanted = action.langs?.length
        ? action.langs
        : Object.keys(target.translations);
      const approved: Record<string, string> = {};
      for (const lang of wanted) {
        const value = target.translations[lang];
        if (value) approved[lang] = value;
      }
      handleAcceptTranslations(target.path, target.key, approved);
      ai.resolveChoice(message.uuid, 'applied', {
        condensed_content: $t('app.smart.json.ai.translations_preview.accepted_summary', {
          key: target.key,
          count: Object.keys(approved).length,
        }),
      });
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
  <!-- Assistant bubble: the local explorer header or the model's intro line
       (display_content carries the short intro; content keeps the raw model
       output for KV prefix reuse). -->
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
        object_label="type_config"
        suggest_key={suggestKey}
        on_accept_translations={handleAcceptTranslations}
        on_reject_translations={handleRejectTranslations}
        on_after_apply={() =>
          ai.addLocalAssistantMessage(
            $t('app.smart.json.ai.continue_hint'),
            topicsToChoices(localizedTopics),
          )}
      />
    {/each}
  </div>

  <!-- Closed-domain value CTAs — right-aligned row (primary + gradient secondary) -->
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
          object_label="type_config"
        />
      {/each}
    </div>
  {/if}

{/snippet}

<AiChatPanel
  assistant_id="smart_json_config"
  i18n_ns="app.smart.json.ai"
  topic_key="app.smart.json.ai.topic"
  testid_prefix="smart-json-ai"
  create_composable={createComposable}
  choices={choicesSnippet}
/>
