import { NextResponse } from 'next/server';
import { errorCode, isUser, requireUser } from '@/lib/api-user';
import { requestOrigin, wantsJson } from '@/lib/http';
import { PageInputError } from '@/lib/limits';
import { addPageForUser, listPagesForUser } from '@/lib/pages-service';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!isUser(user)) return user;
  const pages = await listPagesForUser(user.id);
  return NextResponse.json({ pages });
}

async function readUrl(request: Request): Promise<string> {
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const body = (await request.json()) as { url?: string };
    return String(body.url ?? '');
  }
  const form = await request.formData();
  return String(form.get('url') ?? '');
}

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!isUser(user)) return user;
  const origin = requestOrigin(request);
  try {
    const url = await readUrl(request);
    const result = await addPageForUser(user.id, url);
    if (wantsJson(request)) {
      return NextResponse.json(result, { status: 201 });
    }
    const next = result.check?.status === 'fetch_error'
      ? `/pages/${result.page.id}/history`
      : '/dashboard?added=1';
    return NextResponse.redirect(new URL(next, origin), 303);
  } catch (error) {
    if (error instanceof PageInputError) {
      if (wantsJson(request)) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      return NextResponse.redirect(new URL(`/dashboard?error=${errorCode(error)}`, origin), 303);
    }
    throw error;
  }
}
