import { NextResponse } from 'next/server';
import { requestOrigin, wantsJson } from '@/lib/http';
import { MAGIC_PREVIEW_COOKIE, SESSION_COOKIE } from '@/lib/cookies';
import { createSupabaseServer, supabaseConfigured } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (supabaseConfigured()) {
    const supabase = await createSupabaseServer();
    await supabase.auth.signOut();
  }
  const origin = requestOrigin(request);
  const response = wantsJson(request)
    ? NextResponse.json({ ok: true })
    : NextResponse.redirect(new URL('/login', origin), 303);
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  response.cookies.set(MAGIC_PREVIEW_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
