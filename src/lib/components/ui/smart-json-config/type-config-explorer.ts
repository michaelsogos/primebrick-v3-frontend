/**
 * type-config-explorer — type_config-specific schema pruning for the JSON
 * schema assistant.
 *
 * The canonical "what applies to this ConfigEntryType" knowledge is the
 * SDK TYPE_CAPABILITIES matrix, served via config_entry/meta and read
 * through useTypeCapabilities. This module prunes the type_config JSON
 * Schema to the properties applicable to the row's actual `type`.
 */
import type { TypeCapabilities, WidgetCapability } from '$lib/api-types';
import type { JsonSchemaObject } from '$lib/components/ui/smart-json-assistant/json-schema-explorer';

/**
 * Widget capability → the top-level type_config properties it covers.
 * Mirrors the WidgetCapability vocabulary in @primebrick/sdk
 * (src/config/type-capabilities.ts).
 */
const WIDGET_PROP_MAP: Record<WidgetCapability, string[]> = {
  currency: ['currency', 'allowed_currencies'],
  country: ['country', 'allowed_countries'],
  badge_values: ['values'],
  select_source: ['values_source', 'api_url', 'api_verb', 'value_field', 'label_field'],
  url_protocols: ['default_protocol', 'allowed_protocols'],
};

/**
 * Filter the validation sub-schema to the rules applicable per caps.
 * Deprecated rules (rules.url, rules.email) are never surfaced — the
 * capability matrix has no entries for them.
 */
function pruneValidation(node: JsonSchemaObject, caps: TypeCapabilities): JsonSchemaObject {
  const props = node?.properties ?? {};
  const kept: Record<string, JsonSchemaObject> = {};
  for (const [key, def] of Object.entries(props)) {
    if (key === 'unsigned') {
      if (caps.validation.unsigned) kept[key] = def;
    } else if (key === 'rules') {
      const ruleProps = def?.properties ?? {};
      const keptRules: Record<string, JsonSchemaObject> = {};
      if (caps.validation.min && ruleProps.min) keptRules.min = ruleProps.min;
      if (caps.validation.max && ruleProps.max) keptRules.max = ruleProps.max;
      if (caps.validation.regex && ruleProps.regex) keptRules.regex = ruleProps.regex;
      kept[key] = { ...def, properties: keptRules };
    } else {
      kept[key] = def; // required, required_error_label_key — always applicable
    }
  }
  return { ...node, properties: kept };
}

/**
 * Prune a type_config JSON Schema to the properties that apply to a row
 * with the given capabilities. The result drives both the explorer topics
 * and the system prompt — the model is never shown props that cannot
 * apply to this type.
 */
export function schemaForCapabilities(
  schema: JsonSchemaObject,
  caps: TypeCapabilities,
): JsonSchemaObject {
  const allowed = new Set<string>(['validation']);
  for (const [cap, props] of Object.entries(WIDGET_PROP_MAP)) {
    if (caps.widget[cap as WidgetCapability]) props.forEach((p) => allowed.add(p));
  }
  const kept: Record<string, JsonSchemaObject> = {};
  for (const [key, def] of Object.entries(schema?.properties ?? {})) {
    if (!allowed.has(key)) continue;
    kept[key] = key === 'validation' ? pruneValidation(def, caps) : def;
  }
  return { ...schema, properties: kept };
}
