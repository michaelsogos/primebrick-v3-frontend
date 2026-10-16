import { get } from 'svelte/store';
import { backendState, type HealthChipState } from '$lib/backend-availability';
import { t } from '$lib/i18n';
import { APP_VERSION } from '$lib/version';

export type HealthChip = HealthChipState;

/** Pure function: maps chip state → i18n label string */
export function chipLabel(chip: HealthChipState): string {
  const tt = get(t);
  return chip === 'backend_offline'
    ? tt('app.health.beOffline')
    : chip === 'db_offline'
      ? tt('app.health.dbOffline')
      : chip === 'redis_offline'
        ? tt('app.health.redisOffline')
        : chip === 'nats_offline'
          ? tt('app.health.natsOffline')
          : chip === 'idp_offline'
            ? tt('app.health.idpOffline')
            : chip === 'ok'
              ? tt('app.health.beOnline')
              : tt('app.common.loading');
}

/** Pure function: maps chip state → CSS class string for the chip badge */
export function chipClass(chip: HealthChipState): string {
  return chip === 'backend_offline'
    ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
    : chip === 'db_offline'
      ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
      : chip === 'redis_offline'
        ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
        : chip === 'nats_offline'
          ? 'border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300'
          : chip === 'idp_offline'
            ? 'border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300'
            : chip === 'ok'
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-border/60 bg-muted/30 text-muted-foreground';
}

/** Pure function: maps chip state → text CSS class string */
export function chipTextClass(chip: HealthChipState): string {
  return chip === 'backend_offline'
    ? 'text-destructive'
    : chip === 'db_offline'
      ? 'text-destructive'
      : chip === 'redis_offline'
        ? 'text-destructive'
        : chip === 'nats_offline'
          ? 'text-warning'
          : chip === 'idp_offline'
            ? 'text-warning'
            : chip === 'ok'
              ? 'text-success'
              : 'text-muted-foreground';
}

/**
 * Composable: returns backendState reference + pure helper functions.
 * Consumers create their own $derived in the component script block.
 *
 * IMPORTANT: Do NOT return $derived values from this function.
 * The Svelte 5 compiler unwraps $derived with $.get() at the return point,
 * producing frozen snapshots — not reactive references.
 */
export function useHealthChip() {
  return { backendState, chipLabel, chipClass, chipTextClass, APP_VERSION };
}
