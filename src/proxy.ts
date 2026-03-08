import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  // Check for next-auth session cookie (database strategy)
  const sessionToken =
    request.cookies.get('__Secure-next-auth.session-token') ?? request.cookies.get('next-auth.session-token');

  if (!sessionToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/categories/:path*', '/recurring-expenses/:path*', '/trips/:path*', '/fiscal/:path*'],
};
