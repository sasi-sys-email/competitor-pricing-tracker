import fs from 'fs';
import path from 'path';
import { formatChangeEmail } from '../lib/email';

function loadEnvFile(): void {
  const file = path.join(process.cwd(), '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(eq + 1);
  }
}

const base = (process.env.PROVE_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const outDir = process.env.PROVE_OUT_DIR ?? '/opt/cursor/artifacts/ac-proof';

class Jar {
  private cookies = new Map<string, string>();

  store(response: Response): void {
    const lines = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    for (const line of lines) {
      const pair = line.split(';')[0] ?? '';
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!value) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  header(): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

async function login(email: string): Promise<Jar> {
  const jar = new Jar();
  const created = await fetch(`${base}/api/auth/magic-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ email }),
  });
  const createdBody = (await created.json()) as { magicLink?: string; error?: string };
  if (!created.ok || !createdBody.magicLink) {
    throw new Error(`Magic link failed for ${email}: ${JSON.stringify(createdBody)}`);
  }
  const callback = await fetch(createdBody.magicLink, {
    headers: { accept: 'application/json' },
    redirect: 'manual',
  });
  jar.store(callback);
  const callbackBody = await callback.json();
  if (!callback.ok) {
    throw new Error(`Callback failed for ${email}: ${JSON.stringify(callbackBody)}`);
  }
  return jar;
}

async function api(jar: Jar, pathname: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const headers = new Headers(init?.headers);
  headers.set('accept', 'application/json');
  if (jar.header()) headers.set('cookie', jar.header());
  const response = await fetch(`${base}${pathname}`, { ...init, headers });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

function write(name: string, value: unknown): void {
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, name);
  const contents = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  fs.writeFileSync(file, contents.endsWith('\n') ? contents : `${contents}\n`);
  console.log(`wrote ${file}`);
}

async function main(): Promise<void> {
  loadEnvFile();
  const founder = await login('founder@example.com');
  const other = await login('other@example.com');
  const limits = await login('limits@example.com');

  const noise = await api(founder, '/api/pages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://fixtures.pricing-tracker.local/fx-noise/before.html' }),
  });
  write('ac2-add-page.json', noise);

  const httpRejected = await api(limits, '/api/pages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'http://example.com/pricing' }),
  });
  write('ac2-reject-http.json', httpRejected);

  const addedIds: string[] = [];
  for (let n = 1; n <= 10; n += 1) {
    const added = await api(limits, '/api/pages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: `https://fixtures.pricing-tracker.local/fx-noise/before.html?n=${n}`,
      }),
    });
    if (added.status !== 201) throw new Error(`Expected 201 for page ${n}: ${JSON.stringify(added)}`);
    addedIds.push((added.body as { page: { id: string } }).page.id);
  }
  const eleventh = await api(limits, '/api/pages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: 'https://fixtures.pricing-tracker.local/fx-noise/before.html?n=11',
    }),
  });
  write('ac2-reject-11th.json', eleventh);

  const removed = await api(limits, `/api/pages/${addedIds[0]}/delete`, { method: 'DELETE' });
  const limitsAfter = await api(limits, '/api/pages');
  write('ac2-remove.json', { removed, remaining: (limitsAfter.body as { pages: unknown[] }).pages.length });

  const change = await api(founder, '/api/pages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://fixtures.pricing-tracker.local/fx-change/before.html' }),
  });
  const unreachable = await api(founder, '/api/pages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://pricing-tracker-unreachable.invalid/pricing' }),
  });
  write('ac7-fetch-error-on-add.json', unreachable);

  const founderPages = await api(founder, '/api/pages');
  const otherPages = await api(other, '/api/pages');
  const noiseId = (noise.body as { page: { id: string } }).page.id;
  const otherTargeted = await api(other, `/api/pages/${noiseId}`);
  write('ac1-user-b-pages.json', otherPages);
  write('ac1-user-b-page-by-id.json', otherTargeted);
  write('ac1-user-a-pages.json', founderPages);

  const cronDenied = await fetch(`${base}/api/cron/check`);
  write('ac5-cron-401.json', { status: cronDenied.status, body: await cronDenied.json() });

  const cronOk = await fetch(`${base}/api/cron/check`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
  });
  const cronBody = await cronOk.json();
  write('ac5-cron-200.json', { status: cronOk.status, body: cronBody });

  const noiseCheck = await api(founder, `/api/pages/${noiseId}/check`, {
    method: 'POST',
    headers: { 'x-fixture-variant': 'after' },
  });
  write('ac3-fx-noise-check.json', { fixture_id: 'fx-noise', ...noiseCheck });

  const changeId = (change.body as { page: { id: string } }).page.id;
  const changeCheck = await api(founder, `/api/pages/${changeId}/check`, {
    method: 'POST',
    headers: { 'x-fixture-variant': 'after' },
  });
  write('ac4-fx-change-check.json', { fixture_id: 'fx-change', ...changeCheck });

  const noiseHistory = await api(founder, `/api/pages/${noiseId}/checks`);
  const changeHistory = await api(founder, `/api/pages/${changeId}/checks`);
  const errorId = (unreachable.body as { page: { id: string } }).page.id;
  const errorHistory = await api(founder, `/api/pages/${errorId}/checks`);
  write('ac7-history-fx-change.json', changeHistory);
  write('ac7-history-fetch-error.json', errorHistory);
  write('ac3-history-fx-noise.json', noiseHistory);

  const check = (changeCheck.body as { check: { diff: { removed: string[]; added: string[] }; email_sent: boolean } }).check;
  const preview = formatChangeEmail({
    to: 'founder@example.com',
    pageUrl: 'https://fixtures.pricing-tracker.local/fx-change/before.html',
    removed: check.diff.removed,
    added: check.diff.added,
    historyUrl: `${base}/pages/${changeId}/history`,
  });
  write(
    'ac6-email-preview.txt',
    [
      `email_sent on the live check (no Resend key in this environment): ${check.email_sent}`,
      `To: founder@example.com`,
      `Subject: ${preview.subject}`,
      '',
      preview.text,
      '',
    ].join('\n'),
  );

  const summary = {
    ac2_add_status: noise.status,
    ac2_hash: (noise.body as { page: { snapshot: { content_hash: string } | null } }).page.snapshot?.content_hash,
    ac2_http_status: httpRejected.status,
    ac2_eleventh_status: eleventh.status,
    ac2_removed: removed.status,
    ac1_other_pages: (otherPages.body as { pages: unknown[] }).pages.length,
    ac1_other_targeted_status: otherTargeted.status,
    ac5_denied: cronDenied.status,
    ac5_ok: cronOk.status,
    ac5_checked: (cronBody as { checked?: number }).checked,
    ac3_status: (noiseCheck.body as { check: { status: string; email_sent: boolean } }).check.status,
    ac3_email_sent: (noiseCheck.body as { check: { email_sent: boolean } }).check.email_sent,
    ac4_status: (changeCheck.body as { check: { status: string } }).check.status,
    ac4_removed: check.diff.removed,
    ac4_added: check.diff.added,
    ac7_error_statuses: (errorHistory.body as { checks: { status: string; email_sent: boolean }[] }).checks.map(
      (row) => ({ status: row.status, email_sent: row.email_sent }),
    ),
    change_history_order: (changeHistory.body as { checks: { status: string; checked_at: string }[] }).checks.map(
      (row) => row.status,
    ),
  };
  write('summary.json', summary);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
