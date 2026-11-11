import { describe, expect, it } from 'vitest';
import { createSessionCookieValue, readSessionCookieValue } from '@/lib/local-session';

describe('local session cookie', () => {
  it('round-trips and rejects a tampered signature', () => {
    process.env.LOCAL_AUTH_SECRET = 'test-secret';
    const value = createSessionCookieValue({ id: '11111111-1111-1111-1111-111111111111', email: 'a@example.com' });
    expect(readSessionCookieValue(value)?.email).toBe('a@example.com');
    const [body] = value.split('.');
    expect(readSessionCookieValue(`${body}.tampered`)).toBeNull();
    expect(readSessionCookieValue(undefined)).toBeNull();
  });
});
