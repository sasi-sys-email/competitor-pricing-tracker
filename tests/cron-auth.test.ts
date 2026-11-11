import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { cronAuthorized } from '@/lib/cron-auth';
import { handleCron } from '@/lib/cron-handler';

describe('cron auth', () => {
  it('rejects a missing or wrong secret and accepts the bearer token', () => {
    expect(cronAuthorized(null, undefined)).toBe(false);
    expect(cronAuthorized(null, 'topsecret')).toBe(false);
    expect(cronAuthorized('Bearer topsecret', undefined)).toBe(false);
    expect(cronAuthorized('Bearer wrong', 'topsecret')).toBe(false);
    expect(cronAuthorized('Bearer topsecret', 'topsecret')).toBe(true);
    expect(cronAuthorized('bearer topsecret', 'topsecret')).toBe(false);
  });

  it('returns 401 from the cron handler before touching pages', async () => {
    const previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'topsecret';
    try {
      const denied = await handleCron(new Request('http://localhost/api/cron/check'));
      expect(denied.status).toBe(401);
      expect(denied.body).toEqual({ error: 'unauthorized' });
    } finally {
      process.env.CRON_SECRET = previous;
    }
  });

  it('schedules a daily call to /api/cron/check', () => {
    const vercel = JSON.parse(readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons: { path: string; schedule: string }[];
    };
    expect(vercel.crons).toHaveLength(1);
    expect(vercel.crons[0].path).toBe('/api/cron/check');
    const [minute, hour, dayOfMonth, month, dayOfWeek] = vercel.crons[0].schedule.split(' ');
    expect(vercel.crons[0].schedule).toBe('0 8 * * *');
    expect(minute).toBe('0');
    expect(hour).not.toBe('*');
    expect(hour).not.toContain(',');
    expect(hour).not.toContain('/');
    expect(dayOfMonth).toBe('*');
    expect(month).toBe('*');
    expect(dayOfWeek).toBe('*');
  });
});
