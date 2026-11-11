import { NextResponse } from 'next/server';
import { fixtureVariant, isUser, requireUser } from '@/lib/api-user';
import { requestOrigin, wantsJson } from '@/lib/http';
import { checkPageForUser } from '@/lib/pages-service';
import { toCheckJson } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request);
  if (!isUser(user)) return user;
  const { id } = await context.params;
  const check = await checkPageForUser(user.id, id, user.email || null, {
    variant: fixtureVariant(request),
    appBaseUrl: requestOrigin(request),
  });
  if (!check) {
    if (wantsJson(request)) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.redirect(new URL('/dashboard?error=missing', requestOrigin(request)), 303);
  }
  if (wantsJson(request)) {
    return NextResponse.json({ check: toCheckJson(check) });
  }
  return NextResponse.redirect(new URL(`/pages/${id}/history`, requestOrigin(request)), 303);
}
