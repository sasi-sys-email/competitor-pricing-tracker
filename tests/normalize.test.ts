import { describe, expect, it } from 'vitest';
import { normalizeHtml, normalizeLine } from '@/lib/normalize';

describe('normalizeHtml', () => {
  it('drops script, style, nav, and footer', () => {
    const html = `
      <html><body>
        <nav>Navigation only</nav>
        <style>.x { color: red; }</style>
        <script>secretPrice = 1</script>
        <main><p>Visible plan</p></main>
        <footer>Copyright footer</footer>
      </body></html>`;
    const text = normalizeHtml(html);
    expect(text).toContain('Visible plan');
    expect(text).not.toContain('Navigation only');
    expect(text).not.toContain('secretPrice');
    expect(text).not.toContain('color: red');
    expect(text).not.toContain('Copyright footer');
  });

  it('drops elements whose class or id contains cookie, banner, announcement, or promo', () => {
    const html = `
      <html><body>
        <div class="CookieNotice">cookie text</div>
        <div id="top-banner">banner text</div>
        <div class="announcement-bar">announcement text</div>
        <section id="promo-ribbon">promo text</section>
        <p>Keep this price</p>
      </body></html>`;
    const text = normalizeHtml(html);
    expect(text).toBe('Keep this price');
  });

  it('keeps the word cookie when it is ordinary page copy', () => {
    const text = normalizeHtml('<html><body><p>We publish our cookie recipe</p></body></html>');
    expect(text).toBe('We publish our cookie recipe');
  });

  it('strips dates, times, and years and collapses whitespace', () => {
    expect(normalizeLine('Updated   Nov 10, 2026')).toBe('Updated');
    expect(normalizeLine('Updated December 1, 2025')).toBe('Updated');
    expect(normalizeLine('Plans for   2026')).toBe('Plans for');
    expect(normalizeLine('Last reviewed at 9:41 AM')).toBe('Last reviewed at');
    expect(normalizeLine('Last reviewed at 4:05 PM')).toBe('Last reviewed at');
    expect(normalizeLine('Seen 2026-11-10 and 11/10/2026')).toBe('Seen and');
  });

  it('splits block elements into lines', () => {
    const text = normalizeHtml('<html><body><h2>Pro</h2><p>$29 per month</p></body></html>');
    expect(text).toBe('Pro\n$29 per month');
  });
});
