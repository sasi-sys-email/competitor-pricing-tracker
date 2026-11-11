import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { diffNormalized } from '@/lib/diff';
import { fetchHtml } from '@/lib/fetch-html';
import { normalizeHtml } from '@/lib/normalize';

function fixture(id: 'fx-noise' | 'fx-change', variant: 'before' | 'after'): string {
  return readFileSync(path.join(process.cwd(), 'fixtures', id, `${variant}.html`), 'utf8');
}

describe('fixtures', () => {
  it('fx-noise ignores banner, cookie, and date differences', () => {
    const before = fixture('fx-noise', 'before');
    const after = fixture('fx-noise', 'after');
    expect(before).not.toBe(after);
    const normalized = normalizeHtml(before);
    expect(normalized).toBe(normalizeHtml(after));
    expect(normalized).toContain('$29 per month');
    expect(normalized).toContain('Pro');
    expect(normalized).toContain('5 seats');
    expect(normalized.toLowerCase()).not.toContain('cookie');
    expect(normalized).not.toContain('Black Friday');
    expect(normalized).not.toContain('Holiday sale');
    expect(normalized).not.toContain('2026');
    expect(normalized).not.toContain('2025');
    expect(diffNormalized(normalized, normalizeHtml(after))).toEqual({ removed: [], added: [] });
  });

  it('fx-change records the price, plan name, seat limit, and added feature', () => {
    const before = normalizeHtml(fixture('fx-change', 'before'));
    const after = normalizeHtml(fixture('fx-change', 'after'));
    const diff = diffNormalized(before, after);
    expect(diff.removed).toContain('Pro');
    expect(diff.removed).toContain('$29 per month');
    expect(diff.removed).toContain('5 seats');
    expect(diff.added).toContain('Growth');
    expect(diff.added).toContain('$39 per month');
    expect(diff.added).toContain('10 seats');
    expect(diff.added).toContain('Custom roles');
    expect(diff.removed.join('\n')).not.toContain('Black Friday');
    expect(diff.added.join('\n')).not.toContain('Webinar');
    expect(diff.removed).not.toContain('$19 per month');
    expect(diff.added).not.toContain('Business');
  });

  it('serves the committed HTML pairs from the local fixture host', async () => {
    const url = 'https://fixtures.pricing-tracker.local/fx-noise/before.html?n=1';
    const html = await fetchHtml(url);
    expect(html).toContain('data-fixture="fx-noise"');
    expect(html).toContain('data-variant="before"');
    const after = await fetchHtml(url, { variant: 'after' });
    expect(after).toContain('data-variant="after"');
    expect(normalizeHtml(html)).toBe(normalizeHtml(after));
  });
});
