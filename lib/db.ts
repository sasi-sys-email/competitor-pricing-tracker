import { Pool, type PoolClient } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    pool = new Pool({ connectionString, max: 8 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    const current = pool;
    pool = null;
    await current.end();
  }
}

/** Cron and local auth. The login role bypasses RLS (Supabase `postgres` user). */
export async function withAdmin<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * User request. Sets the JWT subject claim, then switches to `authenticated`
 * so the row-level security policies apply for the rest of the transaction.
 */
export async function withUser<T>(userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await client.query('set local role authenticated');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // The connection may already be aborted.
    }
    throw error;
  } finally {
    client.release();
  }
}
