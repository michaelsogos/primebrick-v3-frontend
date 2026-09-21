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

  // Auto-set default min length for string types ONCE, at form init.
  // Strings can be empty by default (min=0), but if required=true then min=1
  // (a required string must have at least 1 character).
  // Runs only on the first string-type pass: an explicit removal of the min
  // rule (manual clear or AI-applied JSON) must NOT re-inject the default —
  // `required` already enforces non-empty at validation time.
  let minDefaultApplied = false;
  $effect(() => {
    if (!STRING_TYPES.has(type) || minDefaultApplied) return;
    minDefaultApplied = true;
    if (!builder.validation?.rules?.min) {
      const required = builder.validation?.required === true;
      builder.setMin(required ? 1 : 0);
    }
  });

  // When required changes and min is still the default (0 or 1), update min
  // to match the new required state. If the user has set a custom min, don't
  // override it.
  $effect(() => {
    if (!STRING_TYPES.has(type)) return;
    const currentMin = builder.validation?.rules?.min?.value;
    if (currentMin === undefined) return; // min not set yet, handled above
    const required = builder.validation?.required === true;
    // Only auto-adjust if min is at the default values (0 or 1)
    if (required && currentMin === 0) {
      builder.setMin(1);
    } else if (!required && currentMin === 1) {
      builder.setMin(0);
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
  <JsonPreviewEditor {type} {builder} />
</div>
