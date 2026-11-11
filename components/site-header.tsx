import Link from 'next/link';

export function SiteHeader({ email }: { email: string }) {
  return (
    <header className="top">
      <div>
        <Link href="/dashboard" className="brand">
          Pricing tracker
        </Link>
        <p className="tag">Daily checks for competitor pricing pages</p>
      </div>
      <div className="who">
        <span>{email}</span>
        <form method="post" action="/api/auth/sign-out">
          <button type="submit" className="secondary">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
