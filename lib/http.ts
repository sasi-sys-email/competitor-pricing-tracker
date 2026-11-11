export function wantsJson(request: Request): boolean {
  const accept = request.headers.get('accept') ?? '';
  const type = request.headers.get('content-type') ?? '';
  return type.includes('application/json') || accept.includes('application/json');
}

export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  if (host) return `${proto}://${host}`;
  return url.origin;
}

export function appBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export function historyUrl(pageId: string, base = appBaseUrl()): string {
  return `${base.replace(/\/$/, '')}/pages/${pageId}/history`;
}

export function isSecureRequest(request: Request): boolean {
  return requestOrigin(request).startsWith('https://');
}
