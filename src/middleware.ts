import { NextRequest, NextResponse } from 'next/server';

import { requireAdminSession } from '@/lib/supabase/middleware';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import {
  PUBLIC_REGISTRATION_RATE_LIMIT,
  PUBLIC_REGISTRATION_RATE_WINDOW_MS,
} from '@/lib/constants';

// ─── Rate limit the public registration submission (Phase 37 — §12.5) ───────
// The public form submits via a Server Action, which POSTs to the page path
// `/` with a `Next-Action` header. We throttle those POSTs to 10 per minute
// per client IP and return a localized 429 when the limit is exceeded.
function handlePublicRegistration(request: NextRequest): NextResponse | null {
  const isServerAction =
    request.method === 'POST' && request.headers.has('next-action');

  if (!isServerAction) {
    return null;
  }

  const ip = getClientIp(request);
  const { allowed, remaining, limit, retryAfter } = checkRateLimit(
    `public-registration:${ip}`,
    PUBLIC_REGISTRATION_RATE_LIMIT,
    PUBLIC_REGISTRATION_RATE_WINDOW_MS,
  );

  if (!allowed) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message:
            'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.',
          details: {},
        },
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', String(limit));
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── Admin route protection ───────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') {
      return NextResponse.next();
    }

    const session = await requireAdminSession(request);

    if (!session) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }

    // ── Role-based route boundaries ──
    // Super admin: management dashboard + own profile only — they hold no
    // prison scope, so prison-data pages would just render empty states.
    // Regular admin: everything EXCEPT the super-admin area.
    const isSuperArea = pathname.startsWith('/admin/super');
    const isProfile = pathname.startsWith('/admin/profile');

    if (session.role === 'super_admin' && !isSuperArea && !isProfile) {
      return NextResponse.redirect(new URL('/admin/super', request.url));
    }

    if (session.role === 'admin' && isSuperArea) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }

    return session.response;
  }

  // ─── Public registration submission rate limiting ─────────────────────────
  if (pathname === '/') {
    const rateLimited = handlePublicRegistration(request);
    if (rateLimited) {
      return rateLimited;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/'],
};
