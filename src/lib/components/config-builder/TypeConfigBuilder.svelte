<script lang="ts">
  import { useTypeConfigBuilder } from '$lib/config/type-config-builder.svelte';
  import { DEFAULT_MAX_LENGTH } from '$lib/config/type-config-schema';
  import type { ConfigEntryType } from '$lib/api-types';
  import ValidationRulesSection from './ValidationRulesSection.svelte';
  import WidgetConfigSection from './WidgetConfigSection.svelte';
  import JsonPreviewEditor from './JsonPreviewEditor.svelte';

  const STRING_TYPES: ReadonlySet<ConfigEntryType> = new Set([
    'string', 'text', 'secret', 'url', 'json',
  ]);

  let {
    type,
    configKey,
    type_config,
    onTypeConfigChange,
  }: {
    type: ConfigEntryType;
    configKey: string;
    type_config: string | null;
    onTypeConfigChange: (json: string) => void;
  } = $props();

  const builder = useTypeConfigBuilder(
    () => type,
    () => configKey,
    () => type_config,
    (json) => onTypeConfigChange(json),
  );

  // Auto-set default max length for string types if no max rule exists.
  // This enforces the 65535 cross-system compatibility limit by default.
  // The user can override it in the ValidationRulesSection UI.
  $effect(() => {
    if (STRING_TYPES.has(type) && !builder.validation?.rules?.max) {
      builder.setMax(DEFAULT_MAX_LENGTH);
    }
  });

  // Sync configKey to the builder when it changes (user typing in the key field).
  // The builder re-generates auto error_label_keys for rules that weren't custom-set.
  $effect(() => {
    builder.setConfigKey(configKey);
  });
</script>

<div class="space-y-6">
  <ValidationRulesSection {type} {configKey} {builder} />
  <WidgetConfigSection {type} {builder} />
  <JsonPreviewEditor {builder} />
</div>
