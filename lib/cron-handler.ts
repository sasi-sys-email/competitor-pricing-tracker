import { cronAuthorized } from '@/lib/cron-auth';
import { runScheduledChecks, type CheckOptions } from '@/lib/pages-service';
import { toCheckJson } from '@/lib/types';

export async function handleCron(request: Request, options?: CheckOptions): Promise<{ status: number; body: unknown }> {
  if (!cronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return { status: 401, body: { error: 'unauthorized' } };
  }
  const checks = await runScheduledChecks(options);
  return {
    status: 200,
    body: {
      ok: true,
      checked: checks.length,
      checks: checks.map(toCheckJson),
    },
  };
}
