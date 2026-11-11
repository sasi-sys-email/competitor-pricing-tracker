import { cookies } from 'next/headers';
import { isLocalAuthEnabled, SESSION_COOKIE } from '@/lib/cookies';
import { readSessionCookieValue } from '@/lib/local-session';
import { createSupabaseServer, supabaseConfigured } from '@/lib/supabase/server';

export type CurrentUser = {
  id: string;
  email: string;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (supabaseConfigured()) {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    return { id: user.id, email: user.email ?? '' };
  }
  if (!isLocalAuthEnabled()) return null;
  const cookieStore = await cookies();
  const session = readSessionCookieValue(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return { id: session.uid, email: session.email };
}
