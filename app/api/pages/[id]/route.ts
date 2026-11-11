import { NextResponse } from 'next/server';
import { isUser, requireUser } from '@/lib/api-user';
import { getPageForUser } from '@/lib/pages-service';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request);
  if (!isUser(user)) return user;
  const { id } = await context.params;
  const page = await getPageForUser(user.id, id);
  if (!page) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ page });
}
