<script lang="ts">
  import { t } from '$lib/i18n';
  import CircleCheckBig from '@lucide/svelte/icons/circle-check-big';
  import Circle from '@lucide/svelte/icons/circle';

  let { password }: { password: string } = $props();

  const checks = $derived([
    { key: 'length', label: $t('validation.passwordMinLength'), valid: password.length >= 8 },
    { key: 'uppercase', label: $t('validation.passwordUppercase'), valid: /[A-Z]/.test(password) },
    { key: 'lowercase', label: $t('validation.passwordLowercase'), valid: /[a-z]/.test(password) },
    { key: 'number', label: $t('validation.passwordNumber'), valid: /\d/.test(password) },
    { key: 'special', label: $t('validation.passwordSpecial'), valid: /[^A-Za-z0-9]/.test(password) },
  ]);
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
