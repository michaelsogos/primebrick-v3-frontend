import { describe, it, expect } from 'vitest';
import { claimDocsContext, docsContext } from '$lib/shell/docs/docs-context.svelte';

describe('docs-context', () => {
  it('starts inactive', () => {
    expect(docsContext.active).toBe(false);
    expect(docsContext.entity).toBeNull();
    expect(docsContext.mode).toBe('list');
  });

  it('exposes the claimed context', () => {
    const release = claimDocsContext({ entity: 'customer', mode: 'list' });
    expect(docsContext.active).toBe(true);
    expect(docsContext.entity).toBe('customer');
    expect(docsContext.mode).toBe('list');
    release();
  });

  it('release clears the context only for the current owner', () => {
    const first = claimDocsContext({ entity: 'customer', mode: 'list' });
    claimDocsContext({ entity: 'organization', mode: 'create' });
    // Releasing the stale claim must not wipe the newer context.
    first();
    expect(docsContext.entity).toBe('organization');
    expect(docsContext.mode).toBe('create');
  });

  it('release clears the context for the owner', () => {
    const release = claimDocsContext({ entity: 'config_entry', mode: 'create' });
    release();
    expect(docsContext.active).toBe(false);
    expect(docsContext.entity).toBeNull();
    // mode falls back to 'list' when no context is claimed.
    expect(docsContext.mode).toBe('list');
  });
});
