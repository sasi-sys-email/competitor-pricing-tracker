export const SESSION_COOKIE = 'pt_session';
export const MAGIC_PREVIEW_COOKIE = 'pt_magic_preview';

export function isLocalAuthEnabled(): boolean {
  return (
    process.env.LOCAL_AUTH === '1' &&
    process.env.VERCEL !== '1' &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL
  );
}
