import { diffNormalized } from '@/lib/diff';
import type { ChangeEmail } from '@/lib/email';
import { hashNormalized } from '@/lib/hash';
import { normalizeHtml } from '@/lib/normalize';
import type { CheckStatus } from '@/lib/types';

export type Evaluation = {
  status: CheckStatus;
  diffRemoved: string[];
  diffAdded: string[];
  errorMessage: string | null;
  normalizedText: string | null;
  contentHash: string | null;
  email: ChangeEmail | null;
};

/**
 * Compare a fresh fetch to the last snapshot.
 * No previous snapshot stores a baseline and is not a change.
 * Fetch failures are errors: no diff, no email.
 */
export async function evaluatePage(input: {
  pageUrl: string;
  previousText: string | null;
  historyUrl: string;
  recipient: string | null;
  fetchHtml: (url: string) => Promise<string>;
}): Promise<Evaluation> {
  let html: string;
  try {
    html = await input.fetchHtml(input.pageUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fetch failed';
    return {
      status: 'fetch_error',
      diffRemoved: [],
      diffAdded: [],
      errorMessage: message.slice(0, 500),
      normalizedText: null,
      contentHash: null,
      email: null,
    };
  }

  const normalizedText = normalizeHtml(html);
  const contentHash = hashNormalized(normalizedText);
  const diff =
    input.previousText == null
      ? { removed: [] as string[], added: [] as string[] }
      : diffNormalized(input.previousText, normalizedText);
  const changed = diff.removed.length > 0 || diff.added.length > 0;

  return {
    status: changed ? 'changed' : 'no_change',
    diffRemoved: diff.removed,
    diffAdded: diff.added,
    errorMessage: null,
    normalizedText,
    contentHash,
    email:
      changed && input.recipient
        ? {
            to: input.recipient,
            pageUrl: input.pageUrl,
            removed: diff.removed,
            added: diff.added,
            historyUrl: input.historyUrl,
          }
        : null,
  };
}
