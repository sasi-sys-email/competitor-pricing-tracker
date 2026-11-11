import { describe, expect, it } from 'vitest';
import type { ChangeEmail } from '@/lib/email';
import { handleCron } from '@/lib/cron-handler';
import {
  addPageForUser,
  checkPageForUser,
  listChecksForUser,
  listPagesForUser,
  removePageForUser,
} from '@/lib/pages-service';
import { PageInputError } from '@/lib/limits';
import { insertUser, useTestDatabase } from '@/tests/db';

const fetchFixture = async (url: string, options?: { variant?: string }) => {
  const { fetchHtml } = await import('@/lib/fetch-html');
  return fetchHtml(url, options);
};

describe('page service', () => {
  useTestDatabase();

  it('adds a baseline snapshot, rejects http and the 11th URL, and removes a page', async () => {
    const userId = await insertUser('owner@example.com');
    const added = await addPageForUser(
      userId,
      'https://fixtures.pricing-tracker.local/fx-noise/before.html',
      { fetchHtml: fetchFixture },
    );
    expect(added.page.snapshot?.content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(added.check).toBeNull();

    const listed = await listPagesForUser(userId);
    expect(listed).toHaveLength(1);
    expect(listed[0].snapshot?.content_hash).toBe(added.page.snapshot?.content_hash);

    await expect(addPageForUser(userId, 'http://example.com/pricing')).rejects.toBeInstanceOf(PageInputError);

    for (let n = 2; n <= 10; n += 1) {
      await addPageForUser(userId, `https://fixtures.pricing-tracker.local/fx-noise/before.html?n=${n}`, {
        fetchHtml: fetchFixture,
      });
    }
    await expect(
      addPageForUser(userId, 'https://fixtures.pricing-tracker.local/fx-noise/before.html?n=11', {
        fetchHtml: fetchFixture,
      }),
    ).rejects.toThrow(/at most 10 pages/);
    expect(await listPagesForUser(userId)).toHaveLength(10);

    const removed = await removePageForUser(userId, added.page.id);
    expect(removed).toBe(true);
    expect(await listPagesForUser(userId)).toHaveLength(9);
  });

  it('stores fx-noise as no change with no email and fx-change with the four-line diff', async () => {
    const userId = await insertUser('diff@example.com');
    const sent: ChangeEmail[] = [];
    const sendEmail = async (email: ChangeEmail) => {
      sent.push(email);
      return { id: 'local-stub' };
    };

    const noise = await addPageForUser(userId, 'https://fixtures.pricing-tracker.local/fx-noise/before.html', {
      fetchHtml: fetchFixture,
    });
    const noiseCheck = await checkPageForUser(userId, noise.page.id, 'diff@example.com', {
      variant: 'after',
      fetchHtml: fetchFixture,
      sendEmail,
      appBaseUrl: 'http://localhost:3000',
    });
    expect(noiseCheck?.status).toBe('no_change');
    expect(noiseCheck?.email_sent).toBe(false);
    expect(noiseCheck?.diff_removed).toEqual([]);
    expect(noiseCheck?.diff_added).toEqual([]);

    const change = await addPageForUser(userId, 'https://fixtures.pricing-tracker.local/fx-change/before.html', {
      fetchHtml: fetchFixture,
    });
    const changeCheck = await checkPageForUser(userId, change.page.id, 'diff@example.com', {
      variant: 'after',
      fetchHtml: fetchFixture,
      sendEmail,
      appBaseUrl: 'http://localhost:3000',
    });
    expect(changeCheck?.status).toBe('changed');
    expect(changeCheck?.email_sent).toBe(true);
    expect(changeCheck?.diff_removed).toEqual(expect.arrayContaining(['Pro', '$29 per month', '5 seats']));
    expect(changeCheck?.diff_added).toEqual(
      expect.arrayContaining(['Growth', '$39 per month', '10 seats', 'Custom roles']),
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].historyUrl).toBe(`http://localhost:3000/pages/${change.page.id}/history`);

    const history = await listChecksForUser(userId, change.page.id);
    expect(history?.map((check) => check.status)).toEqual(['changed']);

    const failed = await addPageForUser(userId, 'https://pricing-tracker-unreachable.invalid/pricing', {
      fetchHtml: async () => {
        throw new Error('getaddrinfo ENOTFOUND pricing-tracker-unreachable.invalid');
      },
    });
    expect(failed.check?.status).toBe('fetch_error');
    expect(failed.check?.email_sent).toBe(false);
    expect(failed.page.snapshot).toBeNull();
    expect(sent).toHaveLength(1);
  });

  it('gives every page a check row when the cron secret is presented', async () => {
    const userA = await insertUser('cron-a@example.com');
    const userB = await insertUser('cron-b@example.com');
    await addPageForUser(userA, 'https://fixtures.pricing-tracker.local/fx-noise/before.html', {
      fetchHtml: fetchFixture,
    });
    await addPageForUser(userB, 'https://fixtures.pricing-tracker.local/fx-change/before.html?user=b', {
      fetchHtml: fetchFixture,
    });

    const previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'cron-secret';
    try {
      const denied = await handleCron(new Request('http://localhost/api/cron/check'));
      expect(denied.status).toBe(401);

      const allowed = await handleCron(
        new Request('http://localhost/api/cron/check', {
          headers: { authorization: 'Bearer cron-secret' },
        }),
        { fetchHtml: fetchFixture, sendEmail: null },
      );
      expect(allowed.status).toBe(200);
      const body = allowed.body as { checked: number; checks: { status: string; checked_at: string }[] };
      expect(body.checked).toBe(2);
      expect(body.checks).toHaveLength(2);
      for (const check of body.checks) {
        expect(check.status).toBe('no_change');
        expect(Number.isNaN(Date.parse(check.checked_at))).toBe(false);
      }
    } finally {
      process.env.CRON_SECRET = previous;
    }

    const checksA = await listChecksForUser(userA, (await listPagesForUser(userA))[0].id);
    const checksB = await listChecksForUser(userB, (await listPagesForUser(userB))[0].id);
    expect(checksA).toHaveLength(1);
    expect(checksB).toHaveLength(1);
    expect(await listPagesForUser(userB)).toHaveLength(1);
    expect(await listPagesForUser(userA)).toHaveLength(1);
    const cross = await listPagesForUser(userB);
    expect(cross.every((page) => page.user_id === userB)).toBe(true);
  });
});
