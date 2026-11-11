import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { MAGIC_PREVIEW_COOKIE, isLocalAuthEnabled } from '@/lib/cookies';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  email: 'Enter a valid email address.',
  link: 'That magic link is invalid or has expired.',
  auth: 'Sign-in failed. Try again.',
  config: 'Sign-in is not configured. Set Supabase keys, or LOCAL_AUTH for a local demo.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');

  const params = await searchParams;
  const cookieStore = await cookies();
  const magicLink = cookieStore.get(MAGIC_PREVIEW_COOKIE)?.value;
  const error = params.error ? ERRORS[params.error] : undefined;

  return (
    <main className="wrap">
      <section className="login">
        <h1>Sign in</h1>
        <p className="muted">We email you a magic link. No password.</p>
        {error ? <p className="banner">{error}</p> : null}
        {params.sent ? (
          <p className="banner ok">Check your email for the sign-in link.</p>
        ) : null}
        {magicLink ? (
          <p className="banner ok">
            Local inbox:{' '}
            <a href={magicLink}>Open magic link</a>
          </p>
        ) : null}
        <form className="stack" method="post" action="/api/auth/magic-link">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" />
          <button type="submit">Email me a magic link</button>
        </form>
        {isLocalAuthEnabled() ? (
          <p className="muted">Local demo: the link appears on this page because no Supabase project is configured.</p>
        ) : null}
      </section>
    </main>
  );
}
