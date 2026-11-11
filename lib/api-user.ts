import { NextResponse } from 'next/server';
import { getCurrentUser, type CurrentUser } from '@/lib/auth';
import { isLocalAuthEnabled } from '@/lib/cookies';
import { wantsJson } from '@/lib/http';
import { PageInputError } from '@/lib/limits';

export async function requireUser(request: Request): Promise<CurrentUser | NextResponse> {
  const user = await getCurrentUser();
  if (user) return user;
  if (wantsJson(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', request.url), 303);
}

export function isUser(value: CurrentUser | NextResponse): value is CurrentUser {
  return !(value instanceof NextResponse);
}

export function errorCode(error: PageInputError): string {
  if (error.message.includes('10 pages')) return 'limit';
  if (error.message.includes('already')) return 'duplicate';
  if (error.message.includes('Enter an https')) return 'empty';
  return 'https';
}

export function fixtureVariant(request: Request): 'before' | 'after' | undefined {
  if (!isLocalAuthEnabled()) return undefined;
  const value = request.headers.get('x-fixture-variant');
  if (value === 'before' || value === 'after') return value;
  return undefined;
}
