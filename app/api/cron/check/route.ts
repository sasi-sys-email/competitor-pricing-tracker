import { NextResponse } from 'next/server';
import { handleCron } from '@/lib/cron-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const result = await handleCron(request);
  return NextResponse.json(result.body, { status: result.status });
}
