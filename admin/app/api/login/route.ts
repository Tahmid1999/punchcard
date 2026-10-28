import { NextRequest, NextResponse } from 'next/server';

import { API_URL, COOKIE } from '@/lib/session';

export async function POST(req: NextRequest) {
  const upstream = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: await req.text(),
    cache: 'no-store',
  });
  if (!upstream.ok) {
    return NextResponse.json({ message: 'wrong email or password' }, { status: 401 });
  }

  const { token } = (await upstream.json()) as { token: string };
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Same as the JWT's own expiry in the API.
    maxAge: 12 * 60 * 60,
  });
  return res;
}
