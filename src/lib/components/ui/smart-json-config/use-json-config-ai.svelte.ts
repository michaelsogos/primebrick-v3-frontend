/**
 * useJsonConfigAi — type_config wiring for the generic JSON-schema
 * assistant (assistant_key: 'json_config'). Injects the type_config
 * zod validator, the type_config system prompt, and delegates the rest
 * to useJsonSchemaAi — nothing here is reusable machinery, only binding.
 */
import { useJsonSchemaAi } from '$lib/components/ui/smart-json-assistant/use-json-schema-ai.svelte';
import { typeConfigSchema } from '$lib/config/type-config-schema';
import type { JsonCandidateValidation } from '$lib/components/ui/smart-json-assistant/use-json-schema-ai.svelte';

function buildSystemPrompt(schema: object, current_json: string): string {
  const schemaCompact = JSON.stringify(schema);
  return [
    'You are a JSON configuration assistant for a "type_config" object.',
    'The JSON Schema below is the ONLY source of truth for valid output:',
    schemaCompact,
    '',
    'Rules:',
    '- Answer questions about what the user can configure using only the schema.',
    '- When asked to produce or modify a configuration, respond with JSON ONLY:',
    '  a complete type_config object valid against the schema.',
    '  No prose, no markdown fences, no explanation around the JSON.',
    '- Never invent properties not present in the schema.',
    '- Under "validation.rules" the ONLY valid keys are: min, max, url, email, regex.',
    '  There is no "length" rule: for exact/limited string length use min+max',
    '  (length semantics for string types), and "regex" for character constraints',
    '  (e.g. exactly 5 alphanumeric chars → min 5, max 5, regex "^[a-zA-Z0-9]+$").',
    '- When the user asks for a length/size limit, ALWAYS express it through',
    '  min AND max rules (they surface as numeric fields in the builder UI).',
    '  A regex quantifier alone is NOT enough — use regex only for',
    '  character-set constraints, never as a substitute for min/max.',
    '- Always preserve existing keys from the current configuration that the user',
    '  did not ask to change — apply the request as a merge, never as a reset.',
    '',
    'Example — user: "the value must be exactly 5 alphanumeric characters"',
    'Correct answer (min+max carry the length, regex the character set):',
    '{"validation":{"required":true,"rules":{',
    '"min":{"value":5,"error_label_key":"app.common.validation.tooShort"},',
    '"max":{"value":5,"error_label_key":"app.common.validation.tooLong"},',
    '"regex":{"pattern":"^[a-zA-Z0-9]+$","error_label_key":"app.common.validation.regexMismatch"}',
    '}}}',
    '',
    'Example — user: "the value must be at most 20 characters"',
    'Correct answer (no regex needed — length only):',
    '{"validation":{"required":true,"rules":{',
    '"max":{"value":20,"error_label_key":"app.common.validation.tooLong"}',
    '}}}',
    '',
    'Current configuration:',
    current_json.trim() || '(empty)',
  ].join('\n');
}

/** Validate a JSON candidate against the type_config zod schema. */
export function validateCandidate(json: string): JsonCandidateValidation {
  try {
    const parsed = JSON.parse(json);
    const result = typeConfigSchema.safeParse(parsed);
    if (result.success) return { valid: true, errors: [] };
    const errors = result.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    return { valid: false, errors };
  } catch {
    return { valid: false, errors: ['Invalid JSON syntax'] };
  }
}

export function useJsonConfigAi(
  model_id: string,
  current_json: string | (() => string),
  schema: object | (() => object),
  on_key_picker_free_text?: (message: string, path: string, rule: string) => void,
) {
  return useJsonSchemaAi(model_id, {
    current_json,
    schema,
    validate: validateCandidate,
    build_system_prompt: buildSystemPrompt,
    assistant_key: 'json_config',
    i18n_ns: 'app.smart.json.ai',
    on_key_picker_free_text,
  });
}
