import { load } from 'cheerio';

const DROP =
  'script, style, nav, footer, noscript, [id*="cookie" i], [class*="cookie" i], [id*="banner" i], [class*="banner" i], [id*="announcement" i], [class*="announcement" i], [id*="promo" i], [class*="promo" i]';

const MONTH =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

const STRIP_PATTERNS: RegExp[] = [
  new RegExp(`\\b(?:${MONTH})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\,?\\s+\\d{4}\\b`, 'gi'),
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH})\\.?\\,?\\s+\\d{4}\\b`, 'gi'),
  /\b\d{4}-\d{2}-\d{2}(?:[tT ]\d{2}:\d{2}(?::\d{2})?(?:Z|z)?)?\b/g,
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
  /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\b/gi,
  /\b(?:19|20)\d{2}\b/g,
];

const BLOCKS =
  'address, article, aside, blockquote, br, dd, div, dl, dt, figcaption, figure, h1, h2, h3, h4, h5, h6, header, hr, li, main, p, pre, section, table, td, th, tr, ul, ol';

/** Visible text used for comparison. Noise, dates, times, and years are removed. */
export function normalizeHtml(html: string): string {
  const $ = load(html);
  $(DROP).remove();
  $(BLOCKS).prepend('\n');
  const textSource = $('body').length > 0 ? $('body').text() : $.root().text();
  return textSource
    .split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .filter((line) => line.length > 0)
    .join('\n');
}

export function normalizeLine(line: string): string {
  let text = line.replace(/\s+/g, ' ').trim();
  for (const pattern of STRIP_PATTERNS) {
    pattern.lastIndex = 0;
    text = text.replace(pattern, ' ');
  }
  return text.replace(/\s+/g, ' ').trim();
}
