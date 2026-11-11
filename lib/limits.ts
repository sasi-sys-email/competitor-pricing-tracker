export const MAX_PAGES_PER_USER = 10;

export class PageInputError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'PageInputError';
    this.status = status;
  }
}

/** Accept only absolute https URLs. Returns a canonical form. */
export function validatePageUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new PageInputError('Enter an https URL');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new PageInputError('Only https URLs are allowed');
  }
  if (parsed.protocol !== 'https:' || parsed.hostname.length === 0) {
    throw new PageInputError('Only https URLs are allowed');
  }
  return parsed.toString();
}

export function assertUnderPageLimit(existingCount: number): void {
  if (existingCount >= MAX_PAGES_PER_USER) {
    throw new PageInputError('A user can track at most 10 pages');
  }
}
