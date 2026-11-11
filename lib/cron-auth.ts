import { timingSafeEqual } from 'crypto';

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export function cronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization ?? '');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
