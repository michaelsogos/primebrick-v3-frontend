/**
 * Password policy types — mirror of the BE PasswordPolicy enum and configs.
 * Kept in sync manually with `primebrick-be-v3/src/modules/auth/password-policy.ts`.
 *
 * The FE uses these to:
 *   1. Build the zod validation schema dynamically (regex per policy)
 *   2. Render the correct PasswordChecklist items
 *   3. Show the correct error message (errorLabelKey)
 */

export enum PasswordPolicy {
  ALPHA_NUMERIC = "alpha_numeric",
  LETTER_AND_NUMBER = "letter_and_number",
  LETTER_NUMBER_SPECIAL = "letter_number_special",
  MIXED_CASE_SPECIAL = "mixed_case_special",
}

export const DEFAULT_PASSWORD_POLICY = PasswordPolicy.LETTER_NUMBER_SPECIAL;

export const PASSWORD_SPECIAL_CHARS = "*-_.#@!|?^:";

export enum PasswordChecklistRule {
  LENGTH = "length",
  LETTER = "letter",
  LOWERCASE = "lowercase",
  UPPERCASE = "uppercase",
  NUMBER = "number",
  SPECIAL = "special",
}

/** Shape returned by GET /api/v1/system/password-policy */
export interface PasswordPolicyResponse {
  policy: PasswordPolicy;
  errorLabelKey: string;
  checklistRules: PasswordChecklistRule[];
  specialChars: string;
}

/**
 * Per-policy regex (must match BE exactly).
 * Used for FE zod validation and live checklist checks.
 *
 * In the character class [*\-_.#@!|?^:]:
 *   - `\-` is escaped to be a literal hyphen (not a range)
 *   - `^` is NOT at the start, so it's literal
 *   - `|` inside [] is literal
 */
export const PASSWORD_POLICY_REGEXES: Record<PasswordPolicy, RegExp> = {
  [PasswordPolicy.ALPHA_NUMERIC]: /^[A-Za-z0-9]{8,64}$/,
  [PasswordPolicy.LETTER_AND_NUMBER]: /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{8,64}$/,
  [PasswordPolicy.LETTER_NUMBER_SPECIAL]:
    /^(?=.*[A-Za-z])(?=.*\d)(?=.*[*\-_.#@!|?^:])[A-Za-z0-9*\-_.#@!|?^:]{8,64}$/,
  [PasswordPolicy.MIXED_CASE_SPECIAL]:
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[*\-_.#@!|?^:])[A-Za-z0-9*\-_.#@!|?^:]{8,64}$/,
};

/** Per-policy checklist rules (must match BE exactly). */
export const PASSWORD_POLICY_CHECKLIST_RULES: Record<PasswordPolicy, PasswordChecklistRule[]> = {
  [PasswordPolicy.ALPHA_NUMERIC]: [PasswordChecklistRule.LENGTH],
  [PasswordPolicy.LETTER_AND_NUMBER]: [
    PasswordChecklistRule.LENGTH,
    PasswordChecklistRule.LETTER,
    PasswordChecklistRule.NUMBER,
  ],
  [PasswordPolicy.LETTER_NUMBER_SPECIAL]: [
    PasswordChecklistRule.LENGTH,
    PasswordChecklistRule.LETTER,
    PasswordChecklistRule.NUMBER,
    PasswordChecklistRule.SPECIAL,
  ],
  [PasswordPolicy.MIXED_CASE_SPECIAL]: [
    PasswordChecklistRule.LENGTH,
    PasswordChecklistRule.LOWERCASE,
    PasswordChecklistRule.UPPERCASE,
    PasswordChecklistRule.NUMBER,
    PasswordChecklistRule.SPECIAL,
  ],
};

/** Per-policy error label key (must match BE exactly). */
export const PASSWORD_POLICY_ERROR_LABEL_KEYS: Record<PasswordPolicy, string> = {
  [PasswordPolicy.ALPHA_NUMERIC]: "validation.passwordPolicyAlphaNumeric",
  [PasswordPolicy.LETTER_AND_NUMBER]: "validation.passwordPolicyLetterAndNumber",
  [PasswordPolicy.LETTER_NUMBER_SPECIAL]: "validation.passwordPolicyLetterNumberSpecial",
  [PasswordPolicy.MIXED_CASE_SPECIAL]: "validation.passwordPolicyMixedCaseSpecial",
};
