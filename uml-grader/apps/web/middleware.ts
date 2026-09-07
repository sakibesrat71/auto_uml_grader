import { jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/', '/login', '/signup', '/signup/verify', '/teacher/signup'];
const AUTH_PAGES = ['/login', '/signup', '/signup/verify', '/teacher/signup'];
const ACCESS_TOKEN_COOKIE = 'access_token';

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}  // hey

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function getDashboardPathForRole(role?: string) {
  if (role === 'teacher') {
    return '/teacher/dashboard';
  }

  if (role === 'student') {
    return '/student/dashboard';
  }

  return '/login';
}

async function getTokenPayload(token: string): Promise<{ role?: string } | null> {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return { role: typeof payload.role === 'string' ? payload.role : undefined };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (process.env.NEXT_PUBLIC_DISABLE_AUTH_MIDDLEWARE === 'true') {
    return NextResponse.next();
  }

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const payload = token ? await getTokenPayload(token) : null;
  const hasValidToken = Boolean(payload);

  if (!isPublicPath(pathname) && !hasValidToken) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isAuthPage(pathname) && hasValidToken) {
    return NextResponse.redirect(
      new URL(getDashboardPathForRole(payload?.role), request.url),
    );
  }

  if (pathname.startsWith('/student') && payload?.role && payload.role !== 'student') {
    return NextResponse.redirect(
      new URL(getDashboardPathForRole(payload.role), request.url),
    );
  }

  if (pathname.startsWith('/teacher') && payload?.role && payload.role !== 'teacher') {
    return NextResponse.redirect(
      new URL(getDashboardPathForRole(payload.role), request.url),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
