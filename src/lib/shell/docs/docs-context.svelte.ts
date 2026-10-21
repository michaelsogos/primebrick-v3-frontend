/**
 * Per-page documentation context — the deepest component that knows which
 * entity the user is working on (EntityListTable, create pages, …) claims
 * the context; the DocsPanel reads it to pick the matching user-guide doc.
 *
 * Matching is by `metadata.entity` in the KB index — never by filename.
 * `mode: 'create'` prefers `generated/<entity>-create.mdx` when the index
 * exposes one; `list` prefers the entity's main doc.
 */

export type DocsContextMode = 'list' | 'create';

export type DocsContext = {
  /** Entity name in snake_case (e.g. `customer`). */
  entity: string;
  mode: DocsContextMode;
};

const _state = $state<{ ctx: DocsContext | null }>({ ctx: null });

let _owner: symbol | null = null;

/**
 * Claim the docs context. Returns a release function — wire it as the
 * `$effect` cleanup so navigating away drops the stale context:
 *
 *   $effect(() => claimDocsContext({ entity, mode: 'list' }));
 */
export function claimDocsContext(ctx: DocsContext): () => void {
  const token = Symbol('docsContext');
  _owner = token;
  _state.ctx = ctx;
  return () => {
    if (_owner === token) {
      _owner = null;
      _state.ctx = null;
    }
  };
}

export const docsContext = {
  get entity(): string | null {
    return _state.ctx?.entity ?? null;
  },
  get mode(): DocsContextMode {
    return _state.ctx?.mode ?? 'list';
  },
  get active(): boolean {
    return _state.ctx !== null;
  }
};
