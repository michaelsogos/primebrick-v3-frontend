/**
 * usePasswordPolicy — composable that fetches the active password policy
 * from the backend (`GET /api/v1/system/password-policy`) and exposes it
 * for FE validation and checklist rendering.
 *
 * Follows the composable state exposure pattern from AGENTS.md:
 *   - _state is internal (underscore prefix)
 *   - Exposed via get state() returning DeepReadonly
 *   - Mutations only through load()
 *   - $derived values exposed via individual getters
 */

import type { DeepReadonly } from "$lib/types/deep-readonly";
import { apiFetch } from "$lib/api";
import {
  PasswordPolicy,
  PasswordChecklistRule,
  type PasswordPolicyResponse,
  PASSWORD_POLICY_REGEXES,
  PASSWORD_POLICY_CHECKLIST_RULES,
  PASSWORD_POLICY_ERROR_LABEL_KEYS,
  DEFAULT_PASSWORD_POLICY,
  PASSWORD_SPECIAL_CHARS,
} from "$lib/types/password-policy";

const DEFAULT_RESPONSE: PasswordPolicyResponse = {
  policy: DEFAULT_PASSWORD_POLICY,
  errorLabelKey: PASSWORD_POLICY_ERROR_LABEL_KEYS[DEFAULT_PASSWORD_POLICY],
  checklistRules: PASSWORD_POLICY_CHECKLIST_RULES[DEFAULT_PASSWORD_POLICY],
  specialChars: PASSWORD_SPECIAL_CHARS,
};

export function usePasswordPolicy() {
  const _state = $state({
    policy: DEFAULT_RESPONSE.policy,
    errorLabelKey: DEFAULT_RESPONSE.errorLabelKey,
    checklistRules: [...DEFAULT_RESPONSE.checklistRules],
    specialChars: DEFAULT_RESPONSE.specialChars,
    loading: true,
    loaded: false,
  });

  const regex = $derived(PASSWORD_POLICY_REGEXES[_state.policy]);

  async function load() {
    _state.loading = true;
    try {
      const res = await apiFetch("/api/v1/system/password-policy");
      if (res.ok) {
        const data = (await res.json()) as PasswordPolicyResponse;
        _state.policy = data.policy;
        _state.errorLabelKey = data.errorLabelKey;
        _state.checklistRules = [...data.checklistRules];
        _state.specialChars = data.specialChars;
        _state.loaded = true;
      }
    } catch (e) {
      console.error("Failed to load password policy, using default:", e);
    } finally {
      _state.loading = false;
    }
  }

  return {
    get state(): DeepReadonly<typeof _state> {
      return _state as DeepReadonly<typeof _state>;
    },
    get regex() {
      return regex;
    },
    load,
  };
}
