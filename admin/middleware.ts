import { NextRequest, NextResponse } from 'next/server';

import { COOKIE } from './lib/session';

// Only checks that a cookie is there. Whether the token is still good is the
// API's call; a 401 from it sends the page back here through lib/api.ts.
export function middleware(req: NextRequest) {
  if (req.cookies.has(COOKIE)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ message: 'not signed in' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = { matcher: ['/((?!login|api/login|_next|favicon.ico).*)'] };
