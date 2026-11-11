import type { PoolClient } from 'pg';
import { withAdmin, withUser } from '@/lib/db';
import { defaultEmailSender, maybeSendChangeEmail, type EmailSend } from '@/lib/email';
import { fetchHtml as defaultFetchHtml } from '@/lib/fetch-html';
import { hashNormalized } from '@/lib/hash';
import { historyUrl } from '@/lib/http';
import { PageInputError, assertUnderPageLimit, validatePageUrl } from '@/lib/limits';
import { normalizeHtml } from '@/lib/normalize';
import { evaluatePage } from '@/lib/run-check';
import {
  type CheckRecord,
  type CheckStatus,
  type PageRecord,
} from '@/lib/types';

export type FetchHtml = (url: string, options?: { variant?: string }) => Promise<string>;

export type CheckOptions = {
  variant?: 'before' | 'after';
  fetchHtml?: FetchHtml;
  sendEmail?: EmailSend | null;
  appBaseUrl?: string;
};

type PageRow = {
  id: string;
  user_id: string;
  url: string;
  created_at: Date | string;
  content_hash: string | null;
  snapshot_id: string | null;
  snapshot_created_at: Date | string | null;
  last_status: CheckStatus | null;
  last_checked_at: Date | string | null;
  last_email_sent: boolean | null;
};

function iso(value: Date | string | null): string {
  if (value == null) return '';
  return new Date(value).toISOString();
}

function asLines(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  }
  return [];
}

function mapPage(row: PageRow): PageRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    url: row.url,
    created_at: iso(row.created_at),
    snapshot: row.content_hash
      ? {
          id: row.snapshot_id ?? '',
          content_hash: row.content_hash,
          created_at: iso(row.snapshot_created_at),
        }
      : null,
    last_check: row.last_status
      ? {
          status: row.last_status,
          checked_at: iso(row.last_checked_at),
          email_sent: Boolean(row.last_email_sent),
        }
      : null,
  };
}

function mapCheck(row: {
  id: string;
  page_id: string;
  user_id: string;
  status: CheckStatus;
  diff_removed: unknown;
  diff_added: unknown;
  error_message: string | null;
  email_sent: boolean;
  checked_at: Date | string;
}): CheckRecord {
  return {
    id: row.id,
    page_id: row.page_id,
    user_id: row.user_id,
    status: row.status,
    diff_removed: asLines(row.diff_removed),
    diff_added: asLines(row.diff_added),
    error_message: row.error_message,
    email_sent: row.email_sent,
    checked_at: iso(row.checked_at),
  };
}

const PAGE_LIST_SQL = `
  select p.id, p.user_id, p.url, p.created_at,
         s.id as snapshot_id, s.content_hash, s.created_at as snapshot_created_at,
         c.status as last_status, c.checked_at as last_checked_at, c.email_sent as last_email_sent
  from public.pages p
  left join lateral (
    select id, content_hash, created_at
    from public.snapshots
    where page_id = p.id
    order by created_at desc
    limit 1
  ) s on true
  left join lateral (
    select status, checked_at, email_sent
    from public.checks
    where page_id = p.id
    order by checked_at desc
    limit 1
  ) c on true
`;

export function mapDatabaseError(error: unknown): PageInputError | null {
  if (typeof error !== 'object' || error == null || !('code' in error)) return null;
  const code = String((error as { code: string }).code);
  const message = String((error as { message?: string }).message ?? '');
  if (message.includes('PAGE_LIMIT')) {
    return new PageInputError('A user can track at most 10 pages');
  }
  if (code === '23514' && message.includes('pages_https')) {
    return new PageInputError('Only https URLs are allowed');
  }
  if (code === '23505') {
    return new PageInputError('That URL is already being tracked');
  }
  return null;
}

async function countPages(client: PoolClient, userId: string): Promise<number> {
  const result = await client.query<{ count: number }>(
    'select count(*)::int as count from public.pages where user_id = $1',
    [userId],
  );
  return result.rows[0]?.count ?? 0;
}

export async function listPagesForUser(userId: string): Promise<PageRecord[]> {
  return withUser(userId, async (client) => {
    const result = await client.query<PageRow>(
      `${PAGE_LIST_SQL} where p.user_id = $1 order by p.created_at desc`,
      [userId],
    );
    return result.rows.map(mapPage);
  });
}

export async function getPageForUser(userId: string, pageId: string): Promise<PageRecord | null> {
  return withUser(userId, async (client) => {
    const result = await client.query<PageRow>(
      `${PAGE_LIST_SQL} where p.id = $1 and p.user_id = $2`,
      [pageId, userId],
    );
    return result.rows[0] ? mapPage(result.rows[0]) : null;
  });
}

export async function listChecksForUser(userId: string, pageId: string): Promise<CheckRecord[] | null> {
  return withUser(userId, async (client) => {
    const owned = await client.query('select id from public.pages where id = $1 and user_id = $2', [
      pageId,
      userId,
    ]);
    if (owned.rowCount === 0) return null;
    const result = await client.query(
      `select id, page_id, user_id, status, diff_removed, diff_added, error_message, email_sent, checked_at
       from public.checks
       where page_id = $1
       order by checked_at desc, id desc`,
      [pageId],
    );
    return result.rows.map(mapCheck);
  });
}

async function insertCheck(
  client: PoolClient,
  input: {
    pageId: string;
    userId: string;
    status: CheckStatus;
    diffRemoved: string[];
    diffAdded: string[];
    errorMessage: string | null;
    emailSent: boolean;
  },
): Promise<CheckRecord> {
  const result = await client.query(
    `insert into public.checks
       (page_id, user_id, status, diff_removed, diff_added, error_message, email_sent)
     values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
     returning id, page_id, user_id, status, diff_removed, diff_added, error_message, email_sent, checked_at`,
    [
      input.pageId,
      input.userId,
      input.status,
      JSON.stringify(input.diffRemoved),
      JSON.stringify(input.diffAdded),
      input.errorMessage,
      input.emailSent,
    ],
  );
  return mapCheck(result.rows[0]);
}

export async function addPageForUser(
  userId: string,
  rawUrl: string,
  options?: { fetchHtml?: FetchHtml },
): Promise<{ page: PageRecord; check: CheckRecord | null }> {
  const url = validatePageUrl(rawUrl);
  const fetchImpl = options?.fetchHtml ?? defaultFetchHtml;

  await withUser(userId, async (client) => {
    assertUnderPageLimit(await countPages(client, userId));
  });

  let html: string | null = null;
  let fetchError: string | null = null;
  try {
    html = await fetchImpl(url);
  } catch (error) {
    fetchError = (error instanceof Error ? error.message : 'Fetch failed').slice(0, 500);
  }

  try {
    return await withUser(userId, async (client) => {
      assertUnderPageLimit(await countPages(client, userId));
      const inserted = await client.query<{ id: string }>(
        'insert into public.pages (user_id, url) values ($1, $2) returning id',
        [userId, url],
      );
      const pageId = inserted.rows[0].id;
      let check: CheckRecord | null = null;
      if (fetchError || html == null) {
        check = await insertCheck(client, {
          pageId,
          userId,
          status: 'fetch_error',
          diffRemoved: [],
          diffAdded: [],
          errorMessage: fetchError ?? 'Fetch failed',
          emailSent: false,
        });
      } else {
        const normalized = normalizeHtml(html);
        await client.query(
          `insert into public.snapshots (page_id, user_id, normalized_text, content_hash)
           values ($1, $2, $3, $4)`,
          [pageId, userId, normalized, hashNormalized(normalized)],
        );
      }
      const listed = await client.query<PageRow>(`${PAGE_LIST_SQL} where p.id = $1 and p.user_id = $2`, [
        pageId,
        userId,
      ]);
      return { page: mapPage(listed.rows[0]), check };
    });
  } catch (error) {
    const mapped = mapDatabaseError(error);
    if (mapped) throw mapped;
    throw error;
  }
}

export async function removePageForUser(userId: string, pageId: string): Promise<boolean> {
  return withUser(userId, async (client) => {
    const result = await client.query('delete from public.pages where id = $1 and user_id = $2', [
      pageId,
      userId,
    ]);
    return (result.rowCount ?? 0) > 0;
  });
}

type LoadedPage = {
  id: string;
  user_id: string;
  url: string;
  previousText: string | null;
  email: string | null;
};

async function loadForUser(userId: string, pageId: string): Promise<LoadedPage | null> {
  return withUser(userId, async (client) => {
    const page = await client.query<{ id: string; user_id: string; url: string }>(
      'select id, user_id, url from public.pages where id = $1 and user_id = $2',
      [pageId, userId],
    );
    if (!page.rows[0]) return null;
    const snap = await client.query<{ normalized_text: string }>(
      `select normalized_text from public.snapshots
       where page_id = $1
       order by created_at desc
       limit 1`,
      [pageId],
    );
    return {
      ...page.rows[0],
      previousText: snap.rows[0]?.normalized_text ?? null,
      email: null,
    };
  });
}

async function persistCheck(
  mode: 'user' | 'admin',
  userId: string,
  input: {
    pageId: string;
    normalizedText: string | null;
    contentHash: string | null;
    status: CheckStatus;
    diffRemoved: string[];
    diffAdded: string[];
    errorMessage: string | null;
    emailSent: boolean;
    saveSnapshot: boolean;
  },
): Promise<CheckRecord> {
  const run = mode === 'admin' ? withAdmin : (fn: (client: PoolClient) => Promise<CheckRecord>) => withUser(userId, fn);
  return run(async (client) => {
    if (input.saveSnapshot && input.normalizedText != null && input.contentHash != null) {
      await client.query(
        `insert into public.snapshots (page_id, user_id, normalized_text, content_hash)
         values ($1, $2, $3, $4)`,
        [input.pageId, userId, input.normalizedText, input.contentHash],
      );
    }
    return insertCheck(client, {
      pageId: input.pageId,
      userId,
      status: input.status,
      diffRemoved: input.diffRemoved,
      diffAdded: input.diffAdded,
      errorMessage: input.errorMessage,
      emailSent: input.emailSent,
    });
  });
}

export async function checkPageForUser(
  userId: string,
  pageId: string,
  recipient: string | null,
  options?: CheckOptions,
): Promise<CheckRecord | null> {
  const loaded = await loadForUser(userId, pageId);
  if (!loaded) return null;
  return runLoadedCheck(loaded, recipient, 'user', options);
}

async function runLoadedCheck(
  loaded: LoadedPage,
  recipient: string | null,
  mode: 'user' | 'admin',
  options?: CheckOptions,
): Promise<CheckRecord> {
  const fetchImpl = options?.fetchHtml ?? defaultFetchHtml;
  const variant = options?.variant;
  const evaluation = await evaluatePage({
    pageUrl: loaded.url,
    previousText: loaded.previousText,
    historyUrl: historyUrl(loaded.id, options?.appBaseUrl),
    recipient,
    fetchHtml: (url) => fetchImpl(url, variant ? { variant } : undefined),
  });

  const sender = options?.sendEmail === undefined ? defaultEmailSender() : options.sendEmail;
  let emailSent = false;
  try {
    emailSent = await maybeSendChangeEmail(evaluation.email, sender);
  } catch (error) {
    console.error('Change email failed:', error instanceof Error ? error.message : 'unknown error');
  }

  const saveSnapshot =
    evaluation.normalizedText != null &&
    (loaded.previousText == null || evaluation.status === 'changed');

  return persistCheck(mode, loaded.user_id, {
    pageId: loaded.id,
    normalizedText: evaluation.normalizedText,
    contentHash: evaluation.contentHash,
    status: evaluation.status,
    diffRemoved: evaluation.diffRemoved,
    diffAdded: evaluation.diffAdded,
    errorMessage: evaluation.errorMessage,
    emailSent,
    saveSnapshot,
  });
}

export type ScheduledPage = {
  id: string;
  user_id: string;
  url: string;
  email: string | null;
};

export async function listPagesForCron(): Promise<ScheduledPage[]> {
  return withAdmin(async (client) => {
    const result = await client.query<ScheduledPage>(
      `select p.id, p.user_id, p.url, u.email
       from public.pages p
       join auth.users u on u.id = p.user_id
       order by p.created_at asc`,
    );
    return result.rows;
  });
}

export async function runScheduledChecks(options?: CheckOptions): Promise<CheckRecord[]> {
  const pages = await listPagesForCron();
  const checks: CheckRecord[] = [];
  for (const page of pages) {
    const loaded = await withAdmin(async (client) => {
      const snap = await client.query<{ normalized_text: string }>(
        `select normalized_text from public.snapshots
         where page_id = $1
         order by created_at desc
         limit 1`,
        [page.id],
      );
      return {
        id: page.id,
        user_id: page.user_id,
        url: page.url,
        previousText: snap.rows[0]?.normalized_text ?? null,
        email: page.email,
      } satisfies LoadedPage;
    });
    checks.push(await runLoadedCheck(loaded, page.email, 'admin', options));
  }
  return checks;
}
