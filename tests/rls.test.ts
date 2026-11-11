import { describe, expect, it } from 'vitest';
import { withAdmin, withUser } from '@/lib/db';
import { insertUser, useTestDatabase } from '@/tests/db';

describe('row level security', () => {
  useTestDatabase();

  it('user B cannot read user A pages, snapshots, or checks', async () => {
    const userA = await insertUser('a@example.com');
    const userB = await insertUser('b@example.com');

    const inserted = await withUser(userA, async (client) => {
      const page = await client.query<{ id: string }>(
        'insert into public.pages (user_id, url) values ($1, $2) returning id',
        [userA, 'https://example.com/pricing'],
      );
      const pageId = page.rows[0].id;
      await client.query(
        `insert into public.snapshots (page_id, user_id, normalized_text, content_hash)
         values ($1, $2, 'Pro', 'hash')`,
        [pageId, userA],
      );
      await client.query(
        `insert into public.checks (page_id, user_id, status, diff_removed, diff_added, email_sent)
         values ($1, $2, 'no_change', '[]'::jsonb, '[]'::jsonb, false)`,
        [pageId, userA],
      );
      return pageId;
    });

    const asOwner = await withAdmin(async (client) => {
      const result = await client.query('select id from public.pages where id = $1', [inserted]);
      return result.rowCount;
    });
    expect(asOwner).toBe(1);

    const seenByB = await withUser(userB, async (client) => {
      const pages = await client.query('select * from public.pages');
      const snapshots = await client.query('select * from public.snapshots');
      const checks = await client.query('select * from public.checks');
      const targeted = await client.query('select * from public.pages where id = $1', [inserted]);
      return {
        pages: pages.rowCount,
        snapshots: snapshots.rowCount,
        checks: checks.rowCount,
        targeted: targeted.rowCount,
      };
    });
    expect(seenByB).toEqual({ pages: 0, snapshots: 0, checks: 0, targeted: 0 });

    const seenByA = await withUser(userA, async (client) => {
      const pages = await client.query('select id from public.pages');
      return pages.rowCount;
    });
    expect(seenByA).toBe(1);

    const deleted = await withUser(userB, async (client) => {
      const result = await client.query('delete from public.pages where id = $1', [inserted]);
      return result.rowCount;
    });
    expect(deleted).toBe(0);
  });

  it('rejects a non-https URL and the 11th page in the database', async () => {
    const userId = await insertUser('limit@example.com');
    await expect(
      withUser(userId, (client) =>
        client.query('insert into public.pages (user_id, url) values ($1, $2)', [
          userId,
          'http://example.com/pricing',
        ]),
      ),
    ).rejects.toMatchObject({ code: '23514' });

    await withUser(userId, async (client) => {
      for (let n = 1; n <= 10; n += 1) {
        await client.query('insert into public.pages (user_id, url) values ($1, $2)', [
          userId,
          `https://example.com/pricing?n=${n}`,
        ]);
      }
    });

    await expect(
      withUser(userId, (client) =>
        client.query('insert into public.pages (user_id, url) values ($1, $2)', [
          userId,
          'https://example.com/pricing?n=11',
        ]),
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining('PAGE_LIMIT') });
  });
});
