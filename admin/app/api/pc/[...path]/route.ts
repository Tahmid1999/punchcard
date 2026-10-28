import { NextRequest } from 'next/server';

import { API_URL, COOKIE } from '@/lib/session';

// The body is passed through as bytes with its own content type, so the
// multipart face upload works the same as the JSON calls.
async function forward(req: NextRequest, path: string[]): Promise<Response> {
  const target = new URL(`${API_URL}/${path.join('/')}`);
  target.search = req.nextUrl.search;

  const headers: Record<string, string> = {
    authorization: `Bearer ${req.cookies.get(COOKIE)?.value ?? ''}`,
  };
  const type = req.headers.get('content-type');
  if (type) headers['content-type'] = type;

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'DELETE' ? undefined : await req.arrayBuffer(),
    cache: 'no-store',
  });

  return new Response(upstream.status === 204 ? null : await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

type Ctx = { params: { path: string[] } };

export const GET = (req: NextRequest, { params }: Ctx) => forward(req, params.path);
export const POST = (req: NextRequest, { params }: Ctx) => forward(req, params.path);
export const DELETE = (req: NextRequest, { params }: Ctx) => forward(req, params.path);

export const dynamic = 'force-dynamic';
