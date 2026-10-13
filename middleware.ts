import { NextResponse, type NextRequest } from 'next/server';

// Cheap first gate: no session cookie -> login page.
// Real authorization is enforced server-side in the admin layout and every admin API.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/admin') && pathname !== '/admin/login' && !req.cookies.get('perez_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/admin/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*'] };
