import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { formatChangeEmail, maybeSendChangeEmail, createResendSender, type ChangeEmail } from '@/lib/email';
import { normalizeHtml } from '@/lib/normalize';
import { evaluatePage } from '@/lib/run-check';

function fixture(id: 'fx-noise' | 'fx-change', variant: 'before' | 'after'): string {
  return readFileSync(path.join(process.cwd(), 'fixtures', id, `${variant}.html`), 'utf8');
}

const history = 'http://localhost:3000/pages/page-1/history';

describe('check and email decisions', () => {
  it('fx-noise is no change and sends no email', async () => {
    const before = normalizeHtml(fixture('fx-noise', 'before'));
    const evaluation = await evaluatePage({
      pageUrl: 'https://fixtures.pricing-tracker.local/fx-noise/before.html',
      previousText: before,
      historyUrl: history,
      recipient: 'owner@example.com',
      fetchHtml: async () => fixture('fx-noise', 'after'),
    });
    expect(evaluation.status).toBe('no_change');
    expect(evaluation.diffRemoved).toEqual([]);
    expect(evaluation.diffAdded).toEqual([]);
    expect(evaluation.email).toBeNull();

    const sent: ChangeEmail[] = [];
    const delivered = await maybeSendChangeEmail(evaluation.email, async (email) => {
      sent.push(email);
      return { id: 'email-1' };
    });
    expect(delivered).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('fx-change sends one email containing the url, diff, and history link', async () => {
    const before = normalizeHtml(fixture('fx-change', 'before'));
    const pageUrl = 'https://fixtures.pricing-tracker.local/fx-change/before.html';
    const evaluation = await evaluatePage({
      pageUrl,
      previousText: before,
      historyUrl: history,
      recipient: 'owner@example.com',
      fetchHtml: async () => fixture('fx-change', 'after'),
    });
    expect(evaluation.status).toBe('changed');
    expect(evaluation.diffRemoved).toEqual(expect.arrayContaining(['Pro', '$29 per month', '5 seats']));
    expect(evaluation.diffAdded).toEqual(
      expect.arrayContaining(['Growth', '$39 per month', '10 seats', 'Custom roles']),
    );
    expect(evaluation.email).not.toBeNull();

    const sent: ChangeEmail[] = [];
    const delivered = await maybeSendChangeEmail(evaluation.email, async (email) => {
      sent.push(email);
      return { id: 'email-1' };
    });
    expect(delivered).toBe(true);
    expect(sent).toHaveLength(1);
    const formatted = formatChangeEmail(sent[0]);
    expect(formatted.subject).toContain(pageUrl);
    expect(formatted.text).toContain(pageUrl);
    expect(formatted.text).toContain(`History: ${history}`);
    for (const line of ['Pro', '$29 per month', '5 seats']) {
      expect(formatted.text).toContain(`- ${line}`);
    }
    for (const line of ['Growth', '$39 per month', '10 seats', 'Custom roles']) {
      expect(formatted.text).toContain(`+ ${line}`);
    }
  });

  it('a fetch error sends no email', async () => {
    const evaluation = await evaluatePage({
      pageUrl: 'https://pricing-tracker-unreachable.invalid/pricing',
      previousText: 'Pricing',
      historyUrl: history,
      recipient: 'owner@example.com',
      fetchHtml: async () => {
        throw new Error('getaddrinfo ENOTFOUND pricing-tracker-unreachable.invalid');
      },
    });
    expect(evaluation.status).toBe('fetch_error');
    expect(evaluation.email).toBeNull();
    expect(evaluation.diffRemoved).toEqual([]);
    const sent: ChangeEmail[] = [];
    await maybeSendChangeEmail(evaluation.email, async (email) => {
      sent.push(email);
      return { id: 'nope' };
    });
    expect(sent).toHaveLength(0);
  });

  it('builds the Resend payload from the change email', async () => {
    const calls: Array<Record<string, unknown>> = [];
    process.env.RESEND_FROM_EMAIL = 'Pricing Tracker <onboarding@resend.dev>';
    const send = createResendSender({
      emails: {
        send: async (payload) => {
          calls.push(payload);
          return { data: { id: 're_test_123' }, error: null };
        },
      },
    });
    const result = await send({
      to: 'owner@example.com',
      pageUrl: 'https://example.com/pricing',
      removed: ['$29 per month'],
      added: ['$39 per month'],
      historyUrl: history,
    });
    expect(result).toEqual({ id: 're_test_123' });
    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe('owner@example.com');
    expect(String(calls[0].text)).toContain('https://example.com/pricing');
    expect(String(calls[0].text)).toContain('- $29 per month');
    expect(String(calls[0].text)).toContain('+ $39 per month');
    expect(String(calls[0].text)).toContain(`History: ${history}`);
    delete process.env.RESEND_FROM_EMAIL;
  });
});
