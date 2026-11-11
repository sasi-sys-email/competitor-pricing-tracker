import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://pricing:pricing@127.0.0.1:5432/pricing_tracker_test';

export default async function setup(): Promise<void> {
  const dbName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
  if (!dbName.endsWith('_test') && process.env.ALLOW_TEST_RESET !== '1') {
    throw new Error(`Refusing to reset database "${dbName}". Use a *_test database.`);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('drop schema if exists public cascade');
    await client.query('create schema public');
    await client.query('drop schema if exists auth cascade');
    await client.query('drop schema if exists local_auth cascade');
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const bootstrap = fs.readFileSync(path.join(root, 'supabase/local/bootstrap.sql'), 'utf8');
    const migration = fs.readFileSync(
      path.join(root, 'supabase/migrations/20261111120000_init.sql'),
      'utf8',
    );
    await client.query(bootstrap);
    await client.query(migration);
  } finally {
    await client.end();
  }
}
