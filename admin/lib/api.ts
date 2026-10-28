const BASE = '/api/pc';

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const form = body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    method,
    // fetch sets the multipart boundary itself when the body is FormData.
    headers: form || body === undefined ? undefined : { 'content-type': 'application/json' },
    body: form ? body : body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401) {
    window.location.assign('/login');
    throw new Error('signed out');
  }
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const m = (JSON.parse(text) as { message?: string | string[] }).message;
      if (m) message = Array.isArray(m) ? m.join(', ') : m;
    } catch {
      // not json, keep the text
    }
    throw new Error(`${res.status} ${message}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const apiGet = <T>(path: string) => send<T>('GET', path);
export const apiPost = <T>(path: string, body?: unknown) => send<T>('POST', path, body);
export const apiDelete = (path: string) => send<void>('DELETE', path);
