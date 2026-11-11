import { NextResponse } from 'next/server';
import { isSecureRequest, requestOrigin, wantsJson } from '@/lib/http';
import { PageInputError } from '@/lib/limits';
import { MAGIC_PREVIEW_COOKIE, isLocalAuthEnabled } from '@/lib/cookies';
import { createLocalMagicLink } from '@/lib/local-session';
import { createSupabaseServer, supabaseConfigured } from '@/lib/supabase/server';

export const runtime = 'nodejs';

async function readEmail(request: Request): Promise<string> {
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const body = (await request.json()) as { email?: string };
    return String(body.email ?? '');
  }
  const form = await request.formData();
  return String(form.get('email') ?? '');
}

export async function POST(request: Request) {
  const origin = requestOrigin(request);
  let email = '';
  try {
    email = await readEmail(request);
  } catch {
    email = '';
  }

  try {
    if (supabaseConfigured()) {
      const supabase = await createSupabaseServer();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${origin}/auth/callback` },
      });
      if (error) {
        throw new PageInputError(error.message || 'Sign-in failed', 400);
      }
      if (wantsJson(request)) {
        return NextResponse.json({ ok: true });
      }
      return NextResponse.redirect(new URL('/login?sent=1', origin), 303);
    }

    if (!isLocalAuthEnabled()) {
      throw new PageInputError('Sign-in is not configured', 400);
    }

    const magicLink = await createLocalMagicLink(email, origin);
    if (wantsJson(request)) {
      return NextResponse.json({ ok: true, magicLink });
    }
    const response = NextResponse.redirect(new URL('/login?sent=1', origin), 303);
    response.cookies.set(MAGIC_PREVIEW_COOKIE, magicLink, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: isSecureRequest(request),
      maxAge: 60 * 15,
    });
    return response;
  } catch (error) {
    const message = error instanceof PageInputError ? error.message : 'Sign-in failed';
    if (wantsJson(request)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const code = message.toLowerCase().includes('email') ? 'email' : 'config';
    return NextResponse.redirect(new URL(`/login?error=${code}`, origin), 303);
  }
}
