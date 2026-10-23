/**
 * host-bridges — the built-in `ctx.components` entries every remote
 * page/sheet receives: `openSheet` (delegates to the engine — validation
 * lives there: host registry ∪ remote `nav.sheets[]` decls) and
 * `mfaStepUp` (delegates to the host step-up composable). These are
 * contract-level tests: the bridges are what D5/D6 grant every remote
 * chunk.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/shell/sheets/sheet-manager.svelte', () => ({
  openSheet: vi.fn(),
}));

import { buildHostComponents } from '$lib/components/remote-page/host-bridges';
import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';

const fakeStepUp = () => ({
  dialogOpen: false,
  pendingAction: '',
  pendingTargetResource: '',
  executeWithToken: vi.fn(async () => new Response(null, { status: 200 })),
  handleAuthorized: vi.fn(),
});

describe('buildHostComponents', () => {
  beforeEach(() => vi.clearAllMocks());

  it('injects mfaStepUp + openSheet into the caller record (mutates same object)', () => {
    const caller = { remote: { marker: true } };
    const comps = buildHostComponents(fakeStepUp() as never, caller);
    expect(comps).toBe(caller);
    expect(typeof comps.mfaStepUp).toBe('function');
    expect(typeof comps.openSheet).toBe('function');
    expect(comps.remote).toEqual({ marker: true });
  });

  it('creates a fresh record when caller passes none', () => {
    const comps = buildHostComponents(fakeStepUp() as never);
    expect(typeof comps.mfaStepUp).toBe('function');
    expect(typeof comps.openSheet).toBe('function');
  });

  it('caller overrides keep precedence (??=) — tests can inject fakes', () => {
    const custom = vi.fn();
    const comps = buildHostComponents(fakeStepUp() as never, { mfaStepUp: custom });
    expect(comps.mfaStepUp).toBe(custom);
  });

  it('mfaStepUp delegates to the step-up composable with requestFn + context', async () => {
    const stepUp = fakeStepUp();
    const comps = buildHostComponents(stepUp as never);
    const requestFn = vi.fn(async () => new Response(null, { status: 200 }));
    const resp = await comps.mfaStepUp!(requestFn, { action: 'delete', target_resource: 'ai_model' });
    expect(resp.status).toBe(200);
    expect(stepUp.executeWithToken).toHaveBeenCalledWith(requestFn, {
      action: 'delete',
      target_resource: 'ai_model',
    });
  });

  it('openSheet delegates to the engine — the engine owns resolution + rejection', () => {
    const comps = buildHostComponents(fakeStepUp() as never);
    comps.openSheet!('shell.aiCerebellum', { models: [] }, { side: 'right' });
    expect(openSheet).toHaveBeenCalledWith('shell.aiCerebellum', { models: [] }, { side: 'right' });
    // A remote-declared key travels the same path — no bridge-side split.
    comps.openSheet!('ai.modelCache', { active_model_id: 'm1' });
    expect(openSheet).toHaveBeenCalledWith('ai.modelCache', { active_model_id: 'm1' }, undefined);
  });
});
