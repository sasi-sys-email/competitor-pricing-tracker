import { NextResponse } from 'next/server';
import { isUser, requireUser } from '@/lib/api-user';
import { requestOrigin, wantsJson } from '@/lib/http';
import { removePageForUser } from '@/lib/pages-service';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return remove(request, context);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return remove(request, context);
}

async function remove(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request);
  if (!isUser(user)) return user;
  const { id } = await context.params;
  const deleted = await removePageForUser(user.id, id);
  if (!deleted) {
    if (wantsJson(request)) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.redirect(new URL('/dashboard?error=missing', requestOrigin(request)), 303);
  }
  if (wantsJson(request)) {
    return NextResponse.json({ deleted: true, id });
  }
  return NextResponse.redirect(new URL('/dashboard', requestOrigin(request)), 303);
}
