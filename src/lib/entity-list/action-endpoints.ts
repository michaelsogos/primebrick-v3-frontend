/**
 * action-endpoints — resolve `meta.actions[].endpoint` into concrete URLs.
 *
 * Every enabled op carries `{method, path}` emitted by the BE route scan
 * (including ops under non-standard prefixes via `metaExtraScans`, e.g.
 * `/api/v1/auth/users`). Consumers dispatch to the declared endpoint instead
 * of recomputing the `/api/v1/entities/{entity}` convention — which is wrong
 * for entity ops that live elsewhere (read-only entity surface + RPC writes).
 *
 * The `/api/v1/entities/{entity}` + suffix convention remains the fallback
 * for actions whose endpoint is absent (stale/mocked metas).
 */
import type { EntityAction, EntityActionEndpoint } from './types';

/** Look up the declared endpoint for an op — null when the action or its
 *  endpoint is absent (disabled ops carry no endpoint). */
export function findActionEndpoint(
  actions: readonly EntityAction[] | undefined,
  op: string
): EntityActionEndpoint | null {
  const action = actions?.find((a) => a.op === op);
  return action?.endpoint ?? null;
}

/**
 * Substitute `:param` placeholders in an endpoint path.
 *
 * `:uuid` resolves from `row[uid]` (the meta-declared uid field — usually
 * `uuid` but not guaranteed). Any other `:name` resolves from `row[name]`,
 * falling back to `row[uid]`.
 */
export function fillActionPath(
  path: string,
  row: Record<string, unknown>,
  uid: string
): string {
  return path.replace(/:([A-Za-z_]\w*)/g, (match, name: string) => {
    const value = name === 'uuid' ? row[uid] : (row[name] ?? row[uid]);
    if (value === undefined || value === null) {
      if (import.meta.env.DEV) {
        console.warn(
          `[fillActionPath] placeholder ${match} unresolved — ` +
            `row has no "${name}" and uid "${uid}" is absent`,
          row
        );
      }
      return match;
    }
    return encodeURIComponent(String(value));
  });
}
