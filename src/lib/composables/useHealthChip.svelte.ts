import { get } from 'svelte/store';
import { backendState, type HealthChipState } from '$lib/backend-availability';
import { t } from '$lib/i18n';
import { APP_VERSION } from '$lib/version';

export type HealthChip = HealthChipState;

export function useHealthChip() {
  const health = $derived(backendState.health);
  const healthChip = $derived(backendState.healthChip as HealthChip);

  const healthChipLabel = $derived.by(() => {
    const tt = get(t);
    return healthChip === 'backend_offline'
      ? tt('shell.health.beOffline')
      : healthChip === 'db_offline'
        ? tt('shell.health.dbOffline')
        : healthChip === 'idp_offline'
          ? tt('shell.health.idpOffline')
          : healthChip === 'ok'
            ? tt('shell.health.beOnline')
            : tt('common.loading');
  });

  const healthChipClass = $derived(
    healthChip === 'backend_offline'
      ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
      : healthChip === 'db_offline'
        ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
        : healthChip === 'idp_offline'
          ? 'border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300'
          : healthChip === 'ok'
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : 'border-border/60 bg-muted/30 text-muted-foreground'
  );

  const healthChipTextClass = $derived(
    healthChip === 'backend_offline'
      ? 'text-destructive'
      : healthChip === 'db_offline'
        ? 'text-destructive'
        : healthChip === 'idp_offline'
          ? 'text-warning'
          : healthChip === 'ok'
            ? 'text-success'
            : 'text-muted-foreground'
  );

  return { health, healthChip, healthChipLabel, healthChipClass, healthChipTextClass, APP_VERSION };
}
