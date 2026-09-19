/**
 * type-config-i18n — localized titles/descriptions for the schema explorer
 * topics. Reuses the SAME i18n keys the builder's second column already
 * renders (system.settings.config.typeConfig.* — BE-owned, 7 locales) so
 * the assistant speaks the exact same vocabulary as the form.
 *
 * Gaps not covered by form keys fall back to app.smart.json.ai.topics.*.
 * min/max pick minLength/minValue (resp. max) based on capabilities.
 */
import type { TypeCapabilities } from '$lib/api-types';
import type { SchemaTopic } from '$lib/components/ui/smart-json-assistant/json-schema.types';

const FORM = 'system.settings.config.typeConfig';
const AI = 'app.smart.json.ai.topics';

interface TopicI18n {
  title_key?: string;
  desc_key?: string;
}

/** Static path → form-key map (min/max resolved separately — caps-aware). */
const PATH_I18N: Record<string, TopicI18n> = {
  validation: { title_key: `${FORM}.validationRules`, desc_key: `${AI}.desc.validation` },
  'validation.required': { title_key: `${FORM}.required`, desc_key: `${FORM}.requiredHelp` },
  'validation.required_error_label_key': { title_key: `${FORM}.requiredErrorLabelKey`, desc_key: `${AI}.desc.error_label_key` },
  'validation.unsigned': { title_key: `${FORM}.unsigned`, desc_key: `${FORM}.unsignedHelp` },
  'validation.rules': { title_key: `${AI}.rules`, desc_key: `${AI}.desc.rules` },
  'validation.rules.regex': { title_key: `${FORM}.regexPattern`, desc_key: `${AI}.desc.regex` },
  'validation.rules.regex.pattern': { title_key: `${FORM}.regexPattern`, desc_key: `${AI}.desc.regex` },
  'validation.rules.regex.flags': { title_key: `${AI}.flags`, desc_key: `${AI}.desc.flags` },
  'validation.rules.regex.error_label_key': { title_key: `${FORM}.regexErrorLabelKey`, desc_key: `${AI}.desc.error_label_key` },
  'validation.rules.url': { title_key: `${FORM}.urlProtocols`, desc_key: `${AI}.desc.url` },
  'validation.rules.url.protocols': { title_key: `${FORM}.urlProtocols`, desc_key: `${AI}.desc.url` },
  'validation.rules.url.error_label_key': { title_key: `${FORM}.urlErrorLabelKey`, desc_key: `${AI}.desc.error_label_key` },
  'validation.rules.min.error_label_key': { title_key: `${FORM}.minErrorLabelKey`, desc_key: `${AI}.desc.error_label_key` },
  'validation.rules.max.error_label_key': { title_key: `${FORM}.maxErrorLabelKey`, desc_key: `${AI}.desc.error_label_key` },
  'validation.rules.email': { title_key: `${FORM}.emailValidation`, desc_key: `${FORM}.emailValidationHelp` },
  'validation.rules.email.error_label_key': { title_key: `${FORM}.errorLabelKey`, desc_key: `${AI}.desc.error_label_key` },
  currency: { title_key: `${FORM}.defaultCurrency`, desc_key: `${AI}.desc.currency` },
  allowed_currencies: { title_key: `${AI}.allowed_currencies`, desc_key: `${AI}.desc.allowed_currencies` },
  values: { title_key: `${FORM}.badgeValues`, desc_key: `${AI}.desc.values` },
  values_source: { title_key: `${FORM}.selectSource`, desc_key: `${AI}.desc.values_source` },
  api_url: { title_key: `${FORM}.apiUrl`, desc_key: `${AI}.desc.api_url` },
  api_verb: { title_key: `${FORM}.httpVerb`, desc_key: `${AI}.desc.api_verb` },
  value_field: { title_key: `${FORM}.valueField`, desc_key: `${AI}.desc.value_field` },
  label_field: { title_key: `${FORM}.labelField`, desc_key: `${AI}.desc.label_field` },
  default_protocol: { title_key: `${AI}.default_protocol`, desc_key: `${AI}.desc.default_protocol` },
  allowed_protocols: { title_key: `${FORM}.urlProtocols`, desc_key: `${AI}.desc.allowed_protocols` },
  country: { title_key: `${AI}.country`, desc_key: `${AI}.desc.country` },
  allowed_countries: { title_key: `${AI}.allowed_countries`, desc_key: `${AI}.desc.allowed_countries` },
};

/**
 * Resolve localized title/desc keys for a schema path. min/max titles are
 * capability-aware (length for string types, value for numeric).
 */
export function topicI18nKeys(path: string, caps: TypeCapabilities | null): TopicI18n | null {
  const lengthKind = caps?.validation.min === 'length';
  if (path === 'validation.rules.min' || path === 'validation.rules.min.value') {
    return {
      title_key: lengthKind ? `${FORM}.minLength` : `${FORM}.minValue`,
      desc_key: lengthKind ? `${AI}.desc.min_length` : `${AI}.desc.min_value`,
    };
  }
  if (path === 'validation.rules.max' || path === 'validation.rules.max.value') {
    return {
      title_key: lengthKind ? `${FORM}.maxLength` : `${FORM}.maxValue`,
      desc_key: lengthKind ? `${AI}.desc.max_length` : `${AI}.desc.max_value`,
    };
  }
  const hit = PATH_I18N[path];
  if (hit) return hit;
  if (/(^|\.)error_label_key$|_error_label_key$/.test(path)) {
    return { title_key: `${AI}.error_label_key`, desc_key: `${AI}.desc.error_label_key` };
  }
  return null;
}

/**
 * Return a copy of the topic tree with localized titles/descriptions.
 * `translate` is the $t function; keys missing from the dict fall back to
 * the schema's own title/description (English).
 */
export function localizeTopics(
  topics: SchemaTopic[],
  caps: TypeCapabilities | null,
  translate: (key: string) => string,
): SchemaTopic[] {
  return topics.map((node) => {
    const i18n = topicI18nKeys(node.path, caps);
    const title = i18n?.title_key ? translate(i18n.title_key) : '';
    const description = i18n?.desc_key ? translate(i18n.desc_key) : '';
    return {
      ...node,
      // A raw key round-trips unchanged when untranslated — keep the schema
      // fallback in that case.
      title: title && title !== i18n?.title_key ? title : node.title,
      // The schema describe is English — NEVER leak it into the UI. Display
      // text is localized-or-empty; the original stays on schema_description
      // for model prompts (English is fine internally).
      description:
        description && description !== i18n?.desc_key ? description : '',
      schema_description: node.schema_description ?? node.description,
      children: localizeTopics(node.children, caps, translate),
    };
  });
}
