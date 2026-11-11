import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="wrap">
      <section className="card">
        <h1>Page not found</h1>
        <p>That pricing page is not in your account.</p>
        <Link href="/dashboard">Back to dashboard</Link>
      </section>
    </main>
  );
}
