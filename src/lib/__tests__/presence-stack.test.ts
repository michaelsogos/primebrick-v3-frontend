/**
 * presence-stack — pure ordering/cap/ring logic for the unified presence
 * avatar stack (ai-plans/collaboration-visual-merge §6.4 UX decisions).
 */
import { describe, it, expect } from 'vitest';
import {
  orderPresenceStack,
  capPresenceStack,
  presenceRing,
  EDITED_WINDOW_MS,
} from '$lib/collaboration/presence-stack';
import type { PresenceEntry } from '@primebrick/ui';

const SELF = 'u-self';
const T0 = 1_000_000;

function entry(partial: Partial<PresenceEntry> & { user_uuid: string }): PresenceEntry {
  return {
    user_name: partial.user_uuid,
    avatar_color: null,
    avatar_initials: null,
    status: 'READING',
    last_seen_at: T0,
    tab_count: 1,
    ...partial,
  };
}

describe('orderPresenceStack', () => {
  it('editors before readers, each by last_seen_at desc', () => {
    const ordered = orderPresenceStack(
      [
        entry({ user_uuid: 'r-old', last_seen_at: T0 - 5000 }),
        entry({ user_uuid: 'r-new', last_seen_at: T0 }),
      ],
      [
        entry({ user_uuid: 'e-old', status: 'EDITING', last_seen_at: T0 - 9000 }),
        entry({ user_uuid: 'e-new', status: 'EDITING', last_seen_at: T0 - 100 }),
      ],
      SELF,
    );
    expect(ordered.map((e) => e.user_uuid)).toEqual(['e-new', 'e-old', 'r-new', 'r-old']);
  });

  it('excludes the viewer from the stack', () => {
    const ordered = orderPresenceStack(
      [entry({ user_uuid: SELF }), entry({ user_uuid: 'other' })],
      [],
      SELF,
    );
    expect(ordered.map((e) => e.user_uuid)).toEqual(['other']);
  });

  it('empty when only the viewer is present', () => {
    expect(orderPresenceStack([entry({ user_uuid: SELF })], [], SELF)).toEqual([]);
    expect(orderPresenceStack([], [], SELF)).toEqual([]);
  });
});

describe('capPresenceStack', () => {
  it('shows max 4 others; the tail collapses into +N', () => {
    const six = Array.from({ length: 6 }, (_, i) =>
      entry({ user_uuid: `u${i}`, last_seen_at: T0 - i }),
    );
    const { visible, hiddenCount } = capPresenceStack(six);
    expect(visible).toHaveLength(4);
    expect(visible.map((e) => e.user_uuid)).toEqual(['u0', 'u1', 'u2', 'u3']);
    expect(hiddenCount).toBe(2); // +N = others.length - 4
  });

  it('no badge at exactly 4 others (5 total incl. self)', () => {
    const four = Array.from({ length: 4 }, (_, i) => entry({ user_uuid: `u${i}` }));
    const { visible, hiddenCount } = capPresenceStack(four);
    expect(visible).toHaveLength(4);
    expect(hiddenCount).toBe(0);
  });
});

describe('presenceRing', () => {
  it('live EDITING always wins over past EDITED', () => {
    const e = entry({
      user_uuid: 'x',
      status: 'EDITING',
      edited_at: T0 - 1000,
    });
    expect(presenceRing(e, T0, T0 - 60_000)).toBe('editing');
  });

  it('EDITED ring: saved within 5min AND after my mount', () => {
    const mount = T0 - 120_000;
    const e = entry({ user_uuid: 'x', edited_at: T0 - 30_000 });
    expect(presenceRing(e, T0, mount)).toBe('edited');
  });

  it('no EDITED ring when the save predates my mount', () => {
    const mount = T0 - 10_000;
    const e = entry({ user_uuid: 'x', edited_at: T0 - 30_000 });
    expect(presenceRing(e, T0, mount)).toBe('none');
  });

  it('EDITED ring expires after the 5-min window', () => {
    const mount = T0 - 400_000;
    const e = entry({ user_uuid: 'x', edited_at: T0 - EDITED_WINDOW_MS });
    expect(presenceRing(e, T0, mount)).toBe('none');
  });

  it('plain reader gets no ring', () => {
    expect(presenceRing(entry({ user_uuid: 'x' }), T0, T0 - 60_000)).toBe('none');
  });
});
