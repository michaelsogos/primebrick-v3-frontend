/**
 * ai-cerebellum — pure resolution helpers for per-assistant model tuning.
 *
 * ai_models rows carry the model DEFAULTS. An ai_cerebellum row carries
 * OPTIONAL overrides for a specific (assistant_key, model_id) pair —
 * NULL fields inherit the model default.
 *
 * `resolveEffectiveParams(model, tuning)` merges a selected tuning over the
 * model defaults; `null`/`undefined` tuning → pure model defaults.
 */
import type { AiCerebellum, AiModel, ExecutionConfig } from '$lib/api-types';

/** Effective generation params after tuning resolution. */
export interface EffectiveAiParams {
  enable_thinking: boolean;
  temperature: number;
  top_p: number;
  max_tokens: number;
  repetition_penalty: number;
  execution_config: ExecutionConfig | null;
}

/**
 * Merge a cerebellum tuning over the model defaults.
 * `execution_config` is merged shallowly: tuning keys override model keys.
 */
export function resolveEffectiveParams(
  model: AiModel | undefined,
  tuning: AiCerebellum | null | undefined,
): EffectiveAiParams {
  const base: EffectiveAiParams = {
    enable_thinking: model?.enable_thinking ?? false,
    temperature: model?.temperature ?? 0.7,
    top_p: model?.top_p ?? 0.9,
    max_tokens: model?.max_tokens ?? 256,
    repetition_penalty: model?.repetition_penalty ?? 1.1,
    execution_config: model?.execution_config ?? null,
  };
  if (!tuning) return base;

  const execution_config = tuning.execution_config
    ? ({ ...(base.execution_config ?? {}), ...tuning.execution_config } as ExecutionConfig)
    : base.execution_config;

  return {
    enable_thinking: tuning.enable_thinking ?? base.enable_thinking,
    temperature: tuning.temperature ?? base.temperature,
    top_p: tuning.top_p ?? base.top_p,
    max_tokens: tuning.max_tokens ?? base.max_tokens,
    repetition_penalty: tuning.repetition_penalty ?? base.repetition_penalty,
    execution_config,
  };
}

/** Keys of EffectiveAiParams a tuning can override (excluding execution_config). */
const TUNABLE_KEYS = [
  'enable_thinking',
  'temperature',
  'top_p',
  'max_tokens',
  'repetition_penalty',
] as const;

/**
 * Returns the set of param keys the tuning actually overrides (non-NULL),
 * plus 'execution_config' when the tuning carries one. Used by the model
 * details popover to mark "tuned" values.
 */
export function tuningOverriddenKeys(
  tuning: AiCerebellum | null | undefined,
): Set<string> {
  const out = new Set<string>();
  if (!tuning) return out;
  for (const k of TUNABLE_KEYS) {
    if (tuning[k] !== null && tuning[k] !== undefined) out.add(k);
  }
  if (tuning.execution_config) out.add('execution_config');
  return out;
}
