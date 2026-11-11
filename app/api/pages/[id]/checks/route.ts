import { NextResponse } from 'next/server';
import { isUser, requireUser } from '@/lib/api-user';
import { getPageForUser, listChecksForUser } from '@/lib/pages-service';
import { toCheckJson } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request);
  if (!isUser(user)) return user;
  const { id } = await context.params;
  const page = await getPageForUser(user.id, id);
  if (!page) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const checks = await listChecksForUser(user.id, id);
  return NextResponse.json({
    page: { id: page.id, url: page.url, user_id: page.user_id },
    checks: (checks ?? []).map(toCheckJson),
  });
}
