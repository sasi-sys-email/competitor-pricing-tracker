import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { withAdmin } from '@/lib/db';
import { PageInputError } from '@/lib/limits';

export { MAGIC_PREVIEW_COOKIE, SESSION_COOKIE, isLocalAuthEnabled } from '@/lib/cookies';

type SessionPayload = {
  uid: string;
  email: string;
  exp: number;
};

function secret(): string {
  const value = process.env.LOCAL_AUTH_SECRET;
  if (!value) {
    throw new Error('LOCAL_AUTH_SECRET is not set');
  }
  return value;
}

function sign(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function createSessionCookieValue(user: { id: string; email: string }, now = Date.now()): string {
  const payload: SessionPayload = {
    uid: user.id,
    email: user.email,
    exp: Math.floor(now / 1000) + 60 * 60 * 24 * 7,
  };
  return sign(payload);
}

export function readSessionCookieValue(value: string | undefined | null, now = Date.now()): SessionPayload | null {
  if (!value) return null;
  const [body, sig] = value.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret()).update(body).digest('base64url');
  const actualBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload.uid || !payload.email || payload.exp * 1000 < now) return null;
    return payload;
  } catch {
    return null;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createLocalMagicLink(email: string, origin: string): Promise<string> {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new PageInputError('Enter a valid email');
  }
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await withAdmin(async (client) => {
    await client.query(
      `insert into local_auth.magic_links (token_hash, email, expires_at)
       values ($1, $2, now() + interval '15 minutes')`,
      [tokenHash, normalized],
    );
  });
  return `${origin}/auth/callback?token=${token}`;
}

export async function consumeLocalMagicLink(token: string): Promise<{ id: string; email: string }> {
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return withAdmin(async (client) => {
    const used = await client.query<{ email: string }>(
      `update local_auth.magic_links
       set used_at = now()
       where token_hash = $1 and used_at is null and expires_at > now()
       returning email`,
      [tokenHash],
    );
    if (!used.rows[0]) {
      throw new PageInputError('Magic link is invalid or expired', 400);
    }
    const email = used.rows[0].email;
    const user = await client.query<{ id: string; email: string }>(
      `insert into auth.users (email) values ($1)
       on conflict (email) do update set email = excluded.email
       returning id, email`,
      [email],
    );
    return user.rows[0];
  });
}
