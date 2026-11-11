import fs from 'fs';
import path from 'path';
import pg from 'pg';

function loadEnvFile(): void {
  const file = path.join(process.cwd(), '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    if (process.env[key] === undefined) {
      process.env[key] = trimmed.slice(eq + 1);
    }
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and set it.');
  }
  const dbName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
  const allowed = dbName === 'pricing_tracker' || dbName.endsWith('_test') || process.env.ALLOW_TEST_RESET === '1';
  if (!allowed) {
    throw new Error(
      `Refusing to reset database "${dbName}". Apply supabase/migrations/20261111120000_init.sql in the Supabase SQL editor instead.`,
    );
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('drop schema if exists public cascade');
    await client.query('create schema public');
    await client.query('drop schema if exists auth cascade');
    await client.query('drop schema if exists local_auth cascade');
    const bootstrap = fs.readFileSync(path.join(process.cwd(), 'supabase/local/bootstrap.sql'), 'utf8');
    const migration = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/20261111120000_init.sql'),
      'utf8',
    );
    await client.query(bootstrap);
    await client.query(migration);
  } finally {
    await client.end();
  }
  console.log(`Applied local bootstrap and migration to ${dbName}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
