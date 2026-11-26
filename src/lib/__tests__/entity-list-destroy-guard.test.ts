/**
 * Regression test — `[svelte] derived_inert` warnings when navigating away
 * from an entity-list page while `init()` is still in flight.
 *
 * The composable's async chains (loadMeta → applyMetaDefaults → ensureVisibleKeys,
 * loadRows → loadSparklines) outlive the host component: after destruction they
 * resumed and read `$derived` values owned by the dead effect tree, producing
 * the warning burst (and pointless work). The fix bails every continuation on
 * a `destroyed` flag set in `onDestroy`.
 *
 * Behavioral proof (independent of whether the dev warning fires in jsdom):
 * once the host is destroyed, the in-flight meta resolution must NOT be
 * written into the instance state — the continuation has bailed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import EntityListDestroyHost from './EntityListDestroyHost.svelte';
import type { useEntityList } from '../composables/useEntityList.svelte';

type ListInstance = ReturnType<typeof useEntityList<Record<string, unknown>>>;

// The meta fetch is controllable — init() parks inside its first await.
let resolveMeta: (meta: unknown) => void = () => {};
vi.mock('$lib/api', () => ({
  apiFetchWithTimeout: vi.fn(() => new Promise(() => {}))
}));
vi.mock('$lib/entity-list', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/entity-list')>();
  return {
    ...actual,
    fetchEntityMeta: vi.fn(
      () =>
        new Promise((res) => {
          resolveMeta = res as (meta: unknown) => void;
        })
    )
  };
});
// Support composables are irrelevant to the destroy lifecycle — no-op them so
// the test exercises only useEntityList's own async chains.
vi.mock('$lib/composables/useSyncChannel.svelte', () => ({ useSyncChannel: () => {} }));
vi.mock('$lib/composables/use-service-availability.svelte', () => ({
  useServiceAvailability: () => ({ stamp: 'online|', available: true }),
  serviceCodeOf: () => 'crm'
}));
vi.mock('$lib/app-connectivity-events', () => ({ onConnectivityRestored: () => {} }));

const META = {
  columns: [{ key: 'name', type: 'text', sortable: true }],
  table: { default_sort: { key: 'name', dir: 'asc' }, default_page_size: 25 }
};

describe('useEntityList destroy guards', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('post-destroy continuations bail — no state writes, no derived_inert warnings', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let list: ListInstance | null = null;
    const { unmount } = render(EntityListDestroyHost, {
      props: {
        capture: (l: ListInstance) => {
          list = l;
        }
      }
    });
    // init() is now parked in `await fetchEntityMeta(...)`.
    await new Promise((r) => setTimeout(r, 20));
    expect(list).not.toBeNull();

    unmount(); // host destroyed — exactly the "navigate away" moment
    resolveMeta(META); // the in-flight meta now resolves
    await new Promise((r) => setTimeout(r, 80));

    // Behavioral proof: the continuation bailed BEFORE writing state.
    expect(list!.state.meta).toBeNull();
    expect(list!.state.rows).toEqual([]);

    // Symptom proof: no derived_inert warning reached the console.
    const inertWarnings = warnSpy.mock.calls.filter((args) =>
      args.some((a) => typeof a === 'string' && a.includes('derived_inert'))
    );
    expect(inertWarnings).toHaveLength(0);
  });

  it('live path unaffected — meta resolution before destroy is applied normally', async () => {
    let list: ListInstance | null = null;
    render(EntityListDestroyHost, {
      props: {
        capture: (l: ListInstance) => {
          list = l;
        }
      }
    });
    await new Promise((r) => setTimeout(r, 20));
    resolveMeta(META);
    await new Promise((r) => setTimeout(r, 80));
    expect(list!.state.meta).not.toBeNull();
  });
});
