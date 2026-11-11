import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/cookies';
import { updateSupabaseSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return updateSupabaseSession(request);
  }

  const path = request.nextUrl.pathname;
  const isProtected = path.startsWith('/dashboard') || path.startsWith('/pages');
  if (isProtected && !request.cookies.get(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
