'use client';

export default function ErrorPage() {
  return (
    <main className="wrap">
      <section className="card">
        <h1>Something went wrong</h1>
        <p>Reload the page. If this is a new setup, confirm DATABASE_URL and that the migration has been applied.</p>
        <a href="/dashboard">Back to the dashboard</a>
      </section>
    </main>
  );
}
