import { describe, expect, it } from 'vitest';
import { MAX_PAGES_PER_USER, PageInputError, assertUnderPageLimit, validatePageUrl } from '@/lib/limits';

describe('https and page limit', () => {
  it('accepts https URLs and rejects everything else', () => {
    expect(validatePageUrl('https://example.com/pricing')).toBe('https://example.com/pricing');
    expect(validatePageUrl('HTTPS://Example.com/pricing')).toBe('https://example.com/pricing');
    for (const bad of ['http://example.com/pricing', 'ftp://example.com', 'javascript:alert(1)', 'not a url', '']) {
      expect(() => validatePageUrl(bad)).toThrow(PageInputError);
      try {
        validatePageUrl(bad);
      } catch (error) {
        expect((error as PageInputError).status).toBe(400);
        expect((error as Error).message).toMatch(/https/i);
      }
    }
  });

  it('rejects the 11th page and allows the 10th', () => {
    expect(MAX_PAGES_PER_USER).toBe(10);
    expect(() => assertUnderPageLimit(9)).not.toThrow();
    expect(() => assertUnderPageLimit(10)).toThrow(/at most 10 pages/);
    expect(() => assertUnderPageLimit(11)).toThrow(PageInputError);
  });
});
