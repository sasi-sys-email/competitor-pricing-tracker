import { describe, expect, it } from 'vitest';
import { diffIsEmpty, diffNormalized } from '@/lib/diff';

describe('diffNormalized', () => {
  it('is empty when the normalized text matches', () => {
    const text = 'Pro\n$29 per month\n5 seats';
    const diff = diffNormalized(text, text);
    expect(diff).toEqual({ removed: [], added: [] });
    expect(diffIsEmpty(diff)).toBe(true);
  });

  it('lists removed and added lines', () => {
    const diff = diffNormalized('Pro\n$29 per month\n5 seats', 'Growth\n$39 per month\n10 seats\nCustom roles');
    expect(diff.removed).toEqual(['Pro', '$29 per month', '5 seats']);
    expect(diff.added).toEqual(['Growth', '$39 per month', '10 seats', 'Custom roles']);
  });
});
