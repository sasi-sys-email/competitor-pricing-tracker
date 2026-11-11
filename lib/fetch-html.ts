import { readFile } from 'fs/promises';
import path from 'path';

export const FIXTURE_HOST = 'fixtures.pricing-tracker.local';
const MAX_BYTES = 2_000_000;

export class FetchFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FetchFailed';
  }
}

export function fixturesEnabled(): boolean {
  if (process.env.ALLOW_FIXTURES === '0') return false;
  if (process.env.ALLOW_FIXTURES === '1') return true;
  return process.env.VERCEL !== '1';
}

/** Map the local fixture host onto the committed HTML pairs. */
export function resolveFixtureFile(url: string, variant?: string): string | null {
  if (!fixturesEnabled()) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== FIXTURE_HOST) return null;
  const match = parsed.pathname.match(/^\/(fx-noise|fx-change)\/(before|after)\.html$/);
  if (!match) return null;
  const which = variant === 'before' || variant === 'after' ? variant : match[2];
  return path.join(process.cwd(), 'fixtures', match[1], `${which}.html`);
}

export async function fetchHtml(url: string, options?: { variant?: string }): Promise<string> {
  const fixture = resolveFixtureFile(url, options?.variant);
  if (fixture) {
    return readFile(fixture, 'utf8');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'PricingTracker/0.1',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fetch failed';
    throw new FetchFailed(message);
  }

  if (!response.ok) {
    throw new FetchFailed(`HTTP ${response.status}`);
  }

  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > MAX_BYTES) {
    throw new FetchFailed('Response exceeded 2MB');
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    throw new FetchFailed('Response exceeded 2MB');
  }
  return new TextDecoder().decode(buffer);
}
