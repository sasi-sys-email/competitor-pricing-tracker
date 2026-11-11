import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { getCurrentUser } from '@/lib/auth';
import { getPageForUser, listChecksForUser } from '@/lib/pages-service';
import { statusLabel } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const page = await getPageForUser(user.id, id);
  if (!page) notFound();
  const checks = await listChecksForUser(user.id, id);
  if (!checks) notFound();

  return (
    <main className="wrap">
      <SiteHeader email={user.email} />
      <Link className="back" href="/dashboard">
        Back to dashboard
      </Link>
      <section className="card">
        <h1>History</h1>
        <p className="hash">
          <a href={page.url}>{page.url}</a>
        </p>
        <p className="muted">Newest check first. A fetch error is not a content change and does not send email.</p>
        {checks.length === 0 ? (
          <p>No checks yet. Use Check now, or wait for the daily run.</p>
        ) : (
          <ol className="check-list">
            {checks.map((check) => (
              <li key={check.id} className="check-card">
                <header>
                  <time dateTime={check.checked_at}>{check.checked_at}</time>
                  <span className={`pill ${check.status}`}>{statusLabel(check.status)}</span>
                </header>
                <p className="muted">{check.email_sent ? 'Email sent' : 'No email'}</p>
                {check.status === 'fetch_error' ? <p className="banner">{check.error_message}</p> : null}
                {check.status === 'changed' ? (
                  <div className="diff">
                    <div>
                      <h3>Removed</h3>
                      {check.diff_removed.length === 0 ? (
                        <p className="muted">None</p>
                      ) : (
                        <ul>
                          {check.diff_removed.map((line, index) => (
                            <li key={`${check.id}-r-${index}`} className="removed">
                              {line}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <h3>Added</h3>
                      {check.diff_added.length === 0 ? (
                        <p className="muted">None</p>
                      ) : (
                        <ul>
                          {check.diff_added.map((line, index) => (
                            <li key={`${check.id}-a-${index}`} className="added">
                              {line}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
