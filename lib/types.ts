export type CheckStatus = 'no_change' | 'changed' | 'fetch_error';

export type CheckRecord = {
  id: string;
  page_id: string;
  user_id: string;
  status: CheckStatus;
  diff_removed: string[];
  diff_added: string[];
  error_message: string | null;
  email_sent: boolean;
  checked_at: string;
};

export type PageRecord = {
  id: string;
  user_id: string;
  url: string;
  created_at: string;
  snapshot: {
    id: string;
    content_hash: string;
    created_at: string;
  } | null;
  last_check: {
    status: CheckStatus;
    checked_at: string;
    email_sent: boolean;
  } | null;
};

export function statusLabel(status: CheckStatus): string {
  if (status === 'no_change') return 'no change';
  if (status === 'changed') return 'changed';
  return 'fetch error';
}

export function toCheckJson(check: CheckRecord) {
  return {
    id: check.id,
    page_id: check.page_id,
    user_id: check.user_id,
    status: check.status,
    diff: {
      removed: check.diff_removed,
      added: check.diff_added,
    },
    error_message: check.error_message,
    email_sent: check.email_sent,
    checked_at: check.checked_at,
  };
}
