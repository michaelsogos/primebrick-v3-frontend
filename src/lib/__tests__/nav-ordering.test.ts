/**
 * sortNavLeaves unit — the pinning/alphabetical mixing rule.
 * Labels are simulated by a dictionary so the test pins the RULE,
 * never a translation.
 */
import { describe, expect, it } from 'vitest';
import { sortNavLeaves } from '$lib/shell/nav-ordering';
import type { ModuleNavLink } from '$lib/api-types';

function leaf(id: string, label_key: string, order?: number, children?: ModuleNavLink[]): ModuleNavLink {
  return { id, label_key, href: `/x/${id}`, ...(order != null ? { order } : {}), ...(children ? { children } : {}) };
}

const dict: Record<string, string> = {
  'k.customers': 'Customers',
  'k.accounts': 'Accounts',
  'k.contacts': 'Contacts',
  'k.consents': 'Consents',
  'k.sequences': 'Sequences',
  'k.types': 'Types'
};
const labelOf = (key: string) => dict[key] ?? key;

describe('sortNavLeaves', () => {
  it('unpinned leaves sort alphabetically by translated label', () => {
    const out = sortNavLeaves([leaf('contacts', 'k.contacts'), leaf('accounts', 'k.accounts'), leaf('consents', 'k.consents')], labelOf);
    expect(out.map((l) => l.id)).toEqual(['accounts', 'consents', 'contacts']);
  });

  it('a pinned leaf occupies its position, unpinned fill the rest alphabetically', () => {
    const out = sortNavLeaves(
      [leaf('contacts', 'k.contacts'), leaf('customers', 'k.customers', 1), leaf('accounts', 'k.accounts')],
      labelOf
    );
    expect(out.map((l) => l.id)).toEqual(['customers', 'accounts', 'contacts']);
  });

  it('a pin beyond the array length clamps to last — sequences last by design', () => {
    const out = sortNavLeaves(
      [leaf('sequences', 'k.sequences', 1_000_000), leaf('types', 'k.types'), leaf('accounts', 'k.accounts')],
      labelOf
    );
    expect(out.map((l) => l.id)).toEqual(['accounts', 'types', 'sequences']);
  });

  it('colliding pins tie-break alphabetically and shift forward', () => {
    const out = sortNavLeaves(
      [leaf('contacts', 'k.contacts', 1), leaf('accounts', 'k.accounts', 1), leaf('types', 'k.types')],
      labelOf
    );
    expect(out.map((l) => l.id)).toEqual(['accounts', 'contacts', 'types']);
  });

  it('children recurse under the same rule', () => {
    const out = sortNavLeaves(
      [leaf('root', 'k.types', undefined, [leaf('contacts', 'k.contacts'), leaf('accounts', 'k.accounts')])],
      labelOf
    );
    expect(out[0].children?.map((l) => l.id)).toEqual(['accounts', 'contacts']);
  });

  it('raw untranslated keys sort by their own string — never crash', () => {
    const out = sortNavLeaves([leaf('b', 'raw.z'), leaf('a', 'raw.a')], labelOf);
    expect(out.map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('wire reality: order arriving as BigInt (ext-json codec) is coerced, never throws', () => {
    const bigintLeaf = { ...leaf('sequences', 'k.sequences'), order: BigInt(1_000_000) as unknown as number };
    const out = sortNavLeaves([bigintLeaf, leaf('types', 'k.types'), leaf('accounts', 'k.accounts')], labelOf);
    expect(out.map((l) => l.id)).toEqual(['accounts', 'types', 'sequences']);
  });
});
