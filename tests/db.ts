import { afterAll, beforeEach } from 'vitest';
import { closePool, withAdmin } from '@/lib/db';

export async function resetTables(): Promise<void> {
  await withAdmin(async (client) => {
    await client.query(
      'truncate public.checks, public.snapshots, public.pages, auth.users, local_auth.magic_links cascade',
    );
  });
}

export function useTestDatabase(): void {
  beforeEach(async () => {
    await resetTables();
  });
  afterAll(async () => {
    await closePool();
  });
}

export async function insertUser(email: string): Promise<string> {
  return withAdmin(async (client) => {
    const result = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [email],
    );
    return result.rows[0].id;
  });
}
