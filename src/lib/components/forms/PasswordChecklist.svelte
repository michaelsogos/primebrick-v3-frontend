<script lang="ts">
  import { t } from '$lib/i18n';
  import { CircleCheckBig } from '@primebrick/ui/vendor/lucide';
  import { Circle } from '@primebrick/ui/vendor/lucide';
  import { PasswordChecklistRule } from '$lib/types/password-policy';

  let {
    password,
    rules,
    specialChars = '*-_.#@!|?^:',
  }: {
    password: string;
    rules: PasswordChecklistRule[];
    specialChars?: string;
  } = $props();

  // Per-rule check functions and i18n label keys
  const ruleChecks: Record<PasswordChecklistRule, { labelKey: string; test: (pw: string) => boolean }> = {
    [PasswordChecklistRule.LENGTH]: {
      labelKey: 'app.common.validation.password_min_length',
      test: (pw) => pw.length >= 8,
    },
    [PasswordChecklistRule.LETTER]: {
      labelKey: 'app.common.validation.password_letter',
      test: (pw) => /[A-Za-z]/.test(pw),
    },
    [PasswordChecklistRule.LOWERCASE]: {
      labelKey: 'app.common.validation.password_lowercase',
      test: (pw) => /[a-z]/.test(pw),
    },
    [PasswordChecklistRule.UPPERCASE]: {
      labelKey: 'app.common.validation.password_uppercase',
      test: (pw) => /[A-Z]/.test(pw),
    },
    [PasswordChecklistRule.NUMBER]: {
      labelKey: 'app.common.validation.password_number',
      test: (pw) => /\d/.test(pw),
    },
    [PasswordChecklistRule.SPECIAL]: {
      labelKey: 'app.common.validation.password_special',
      test: (pw) => {
        // Escape regex special chars from the set for safe use in a character class
        const escaped = specialChars.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        return new RegExp(`[${escaped}]`).test(pw);
      },
    },
  };

  const checks = $derived(
    rules.map((rule) => ({
      key: rule,
      label: $t(ruleChecks[rule].labelKey),
      valid: ruleChecks[rule].test(password),
    })),
  );
</script>

<ul class="space-y-1 mt-2">
  {#each checks as check (check.key)}
    <li class="flex items-center gap-2 text-xs">
      {#if check.valid}
        <CircleCheckBig class="size-3.5 text-success" />
        <span class="text-muted-foreground line-through">{check.label}</span>
      {:else}
        <Circle class="size-3.5 text-muted-foreground/50" />
        <span class="text-muted-foreground">{check.label}</span>
      {/if}
    </li>
  {/each}
</ul>
