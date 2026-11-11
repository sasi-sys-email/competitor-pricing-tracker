import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { getCurrentUser } from '@/lib/auth';
import { listPagesForUser } from '@/lib/pages-service';
import { statusLabel } from '@/lib/types';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  limit: 'A user can track at most 10 pages.',
  duplicate: 'That URL is already being tracked.',
  https: 'Only https URLs are allowed.',
  empty: 'Enter an https URL.',
  missing: 'That page was not found.',
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; added?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const pages = await listPagesForUser(user.id);
  const error = params.error ? ERRORS[params.error] : undefined;

  return (
    <main className="wrap">
      <SiteHeader email={user.email} />
      <section className="card">
        <h1>Your pages</h1>
        <p className="muted">
          Paste a competitor pricing URL. We save a baseline immediately, then check it once a day.
          You can track up to 10 https pages.
        </p>
        {error ? <p className="banner">{error}</p> : null}
        {params.added ? <p className="banner ok">Page added. The baseline snapshot is saved.</p> : null}
        <form method="post" action="/api/pages">
          <label htmlFor="url">Pricing page URL</label>
          <div className="add-form">
            <input id="url" name="url" type="url" required placeholder="https://competitor.com/pricing" />
            <button type="submit">Add page</button>
          </div>
        </form>
        {pages.length === 0 ? (
          <p>No pages yet.</p>
        ) : (
          <ul className="page-list">
            {pages.map((page) => (
              <li key={page.id} className="page-card">
                <h2>
                  <a href={page.url}>{page.url}</a>
                </h2>
                <p className="muted">
                  Snapshot hash{' '}
                  <code className="hash">{page.snapshot?.content_hash ?? 'none yet'}</code>
                </p>
                <p className="row">
                  {page.last_check ? (
                    <span className={`pill ${page.last_check.status}`}>{statusLabel(page.last_check.status)}</span>
                  ) : (
                    <span className="muted">No checks yet</span>
                  )}
                </p>
                <div className="row">
                  <form method="post" action={`/api/pages/${page.id}/check`}>
                    <button type="submit">Check now</button>
                  </form>
                  <Link className="button secondary" href={`/pages/${page.id}/history`}>
                    History
                  </Link>
                  <form method="post" action={`/api/pages/${page.id}/delete`}>
                    <button type="submit" className="danger">
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
