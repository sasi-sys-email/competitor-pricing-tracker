import { NextResponse } from 'next/server';
import { isSecureRequest, requestOrigin, wantsJson } from '@/lib/http';
import { PageInputError } from '@/lib/limits';
import { MAGIC_PREVIEW_COOKIE, SESSION_COOKIE, isLocalAuthEnabled } from '@/lib/cookies';
import { consumeLocalMagicLink, createSessionCookieValue } from '@/lib/local-session';
import { createSupabaseServer, supabaseConfigured } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = requestOrigin(request);
  const token = url.searchParams.get('token');
  const code = url.searchParams.get('code');

  if (code && supabaseConfigured()) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL('/login?error=auth', origin), 303);
    }
    return NextResponse.redirect(new URL('/dashboard', origin), 303);
  }

  if (token && isLocalAuthEnabled()) {
    try {
      const user = await consumeLocalMagicLink(token);
      const response = wantsJson(request)
        ? NextResponse.json({ ok: true, user: { id: user.id, email: user.email } })
        : NextResponse.redirect(new URL('/dashboard', origin), 303);
      response.cookies.set(SESSION_COOKIE, createSessionCookieValue(user), {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: isSecureRequest(request),
        maxAge: 60 * 60 * 24 * 7,
      });
      response.cookies.set(MAGIC_PREVIEW_COOKIE, '', { path: '/', maxAge: 0 });
      return response;
    } catch (error) {
      const message = error instanceof PageInputError ? error.message : 'Magic link is invalid or expired';
      if (wantsJson(request)) {
        return NextResponse.json({ error: message }, { status: 400 });
      }
      return NextResponse.redirect(new URL('/login?error=link', origin), 303);
    }
  }

  return NextResponse.redirect(new URL('/login?error=link', origin), 303);
}
