import { describe, it, expect } from 'vitest';

/**
 * entity→service resolution — census-derived, the single source that
 * replaced the hand-maintained ENTITY_SERVICE_MAP:
 *
 *  - `module.entities` (the same declarations that produce each service's
 *    `/entities/*` routes) feed the map via registerEntityServices
 *  - owned entities resolve to `/svc/<code>/api/v1/entities/<e>`
 *  - unmapped entities — BE-owned or undeclared — keep the direct path
 *  - a re-census swaps the map atomically (no stale owner leaks across
 *    a service redeploy or language refetch)
 */

import { entityApiBase, registerEntityServices, serviceApiPrefix } from '$lib/api';

const CENSUS: readonly (readonly [string, string])[] = [
  ['job_schedule', 'job'],
  ['job_run', 'job'],
  ['job_trigger', 'job'],
  ['customer', 'crm'],
];

describe('entity→service map (census-derived)', () => {
  it('service-owned entity resolves through the /svc proxy', () => {
    registerEntityServices(CENSUS);
    expect(entityApiBase('job_schedule')).toBe('/svc/job/api/v1/entities/job_schedule');
    expect(serviceApiPrefix('job_schedule')).toBe('/svc/job');
  });

  it('unmapped entity keeps the BE-owned direct path', () => {
    registerEntityServices(CENSUS);
    expect(entityApiBase('user_profile')).toBe('/api/v1/entities/user_profile');
    expect(serviceApiPrefix('user_profile')).toBe('');
  });

  // The census legitimately declares 'api' as the owner of BE entities —
  // ownership is used for drill-through, but transport must stay direct:
  // /svc/api asks the gateway to proxy itself (no instance exists → 502).
  it('api-owned entity keeps the direct path — the gateway never proxies itself', () => {
    registerEntityServices([['user_profile', 'api'], ...CENSUS]);
    expect(entityApiBase('user_profile')).toBe('/api/v1/entities/user_profile');
    expect(serviceApiPrefix('user_profile')).toBe('');
    expect(entityApiBase('job_schedule')).toBe('/svc/job/api/v1/entities/job_schedule');
  });

  it('re-census swaps ownership — stale entries do not leak', () => {
    registerEntityServices(CENSUS);
    registerEntityServices([['job_schedule', 'job2']]);
    expect(entityApiBase('job_schedule')).toBe('/svc/job2/api/v1/entities/job_schedule');
    // 'customer' was not re-declared — it is gone, not stale-mapped to crm.
    expect(entityApiBase('customer')).toBe('/api/v1/entities/customer');
  });

  it('empty census falls everything back to the direct path', () => {
    registerEntityServices([]);
    expect(entityApiBase('job_schedule')).toBe('/api/v1/entities/job_schedule');
  });
});
