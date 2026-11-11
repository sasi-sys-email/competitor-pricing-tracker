import { Resend } from 'resend';

export type ChangeEmail = {
  to: string;
  pageUrl: string;
  removed: string[];
  added: string[];
  historyUrl: string;
};

export type EmailSend = (email: ChangeEmail) => Promise<{ id: string }>;

export function formatChangeEmail(email: ChangeEmail): { subject: string; text: string } {
  const removed = email.removed.length > 0 ? email.removed.map((line) => `- ${line}`).join('\n') : '(none)';
  const added = email.added.length > 0 ? email.added.map((line) => `+ ${line}`).join('\n') : '(none)';
  return {
    subject: `Pricing change: ${email.pageUrl}`,
    text: [
      `Pricing page changed: ${email.pageUrl}`,
      '',
      'Removed:',
      removed,
      '',
      'Added:',
      added,
      '',
      `History: ${email.historyUrl}`,
    ].join('\n'),
  };
}

type ResendLike = {
  emails: {
    send: (payload: {
      from: string;
      to: string;
      subject: string;
      text: string;
    }) => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
  };
};

/** Real Resend client, or a test double with the same `emails.send` shape. */
export function createResendSender(client?: ResendLike): EmailSend {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    throw new Error('RESEND_FROM_EMAIL is not set');
  }
  const resend = client ?? new Resend(process.env.RESEND_API_KEY);
  return async (email) => {
    const formatted = formatChangeEmail(email);
    const { data, error } = await resend.emails.send({
      from,
      to: email.to,
      subject: formatted.subject,
      text: formatted.text,
    });
    if (error) {
      throw new Error(error.message);
    }
    return { id: data?.id ?? '' };
  };
}

export function defaultEmailSender(): EmailSend | null {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return null;
  return createResendSender();
}

export async function maybeSendChangeEmail(
  email: ChangeEmail | null,
  send: EmailSend | null,
): Promise<boolean> {
  if (!email || !send) return false;
  await send(email);
  return true;
}
