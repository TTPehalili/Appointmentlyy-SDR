import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME, verifyAuthToken } from '@/lib/authToken';
import { getServerSession } from '@/lib/server/session';

const DEMO_LOGIN = process.env.NEXT_PUBLIC_DEMO_LOGIN === '1';

/** Pages anyone can open. Everything else in the app needs a signed-in session. */
function isPublicPage(pathname: string): boolean {
  return ['/login', '/design'].some((p) => pathname === p || pathname.startsWith(`${p}/`)) || pathname.startsWith('/certificate/');
}

/** API routes that work without a session (they authenticate some other way, or are sign-in itself). */
function isPublicApi(pathname: string, method: string): boolean {
  if (
    [
      '/api/auth/send-link',
      '/api/auth/verify',
      '/api/auth/logout',
      '/api/auth/me',
      '/api/auth/password/login',
      '/api/auth/password/forgot',
      '/api/auth/password/reset',
      '/api/health',
    ].includes(pathname)
  ) {
    return true;
  }
  // Workflow webhooks require their own secret; ElevenLabs posts call events.
  if (pathname.startsWith('/api/webhooks/') && !pathname.startsWith('/api/webhooks/test')) return true;
  // Resend delivers inbound mail here.
  if (pathname === '/api/email/inbound' && method === 'POST') return true;
  return false;
}

/** API areas only Appointmentlyy staff may call: they run code, hold shared credentials or bill. */
const STAFF_ONLY_API_PREFIXES = [
  '/api/workflows',
  '/api/projects',
  '/api/executions',
  '/api/credentials',
  '/api/mcp',
  '/api/nodes',
  '/api/admin/',
  '/api/webhooks/test',
  '/api/platform/',
];

/**
 * Coarse gate in front of every request: a valid, unexpired session cookie, and Super Admin for
 * staff-only APIs. Route handlers still re-check membership against storage (getServerSession),
 * so removed people and suspended workspaces are refused there even if their cookie is valid.
 */
async function authGate(request: NextRequest): Promise<NextResponse | null> {
  if (DEMO_LOGIN) return null; // demo builds keep the local, browser-only login
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');
  if (isApi ? isPublicApi(pathname, request.method) : isPublicPage(pathname)) return null;

  const session = verifyAuthToken(request.cookies.get(AUTH_COOKIE_NAME)?.value, ['session']);
  if (!session) {
    if (isApi) return NextResponse.json({ success: false, error: 'Please sign in.' }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  if (isApi && STAFF_ONLY_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    // These routes don't check the session themselves, so confirm staff status against storage
    // now (a cookie alone could belong to someone removed from the staff list).
    const live = session.role === 'Super Admin' ? await getServerSession(request) : null;
    if (!live?.isPlatformAdmin) {
      return NextResponse.json({ success: false, error: 'Appointmentlyy staff only.' }, { status: 403 });
    }
  }
  return null;
}

/**
 * Appointmentlyy SDR — Multi-Tenant Custom Domain Edge Router (Next.js 16 `proxy.ts`)
 *
 * Production Primary Host: app.appointmentlyy.com
 * Customer Custom Domains: e.g. app.customerwebsiteurl.com
 *
 * How it works:
 * 1. Reads the incoming `x-forwarded-host` or `host` header.
 * 2. Distinguishes between the primary platform host (`app.appointmentlyy.com` / `localhost`)
 *    and external customer white-label domains (`app.customerwebsiteurl.com`).
 * 3. Sets request/response headers & a lightweight readable cookie (`appy_active_host`)
 *    so client components (`session.ts`, `GlobalTopHeader.tsx`, `AppSidebar.tsx`)
 *    automatically detect when a user visits via a customer's custom domain and
 *    lock the workspace branding & tenant context accordingly.
 */

const PLATFORM_PRIMARY_HOSTS = new Set([
  'app.appointmentlyy.com',
  'appointmentlyy.com',
  'www.appointmentlyy.com',
  'localhost',
  '127.0.0.1',
]);

// Pre-seeded server-side map of known custom domains -> tenantCode
const KNOWN_CUSTOM_DOMAINS: Record<
  string,
  { tenantCode: string; tenantName: string; brandColor?: string }
> = {
  'app.appointmentlyy.com': {
    tenantCode: 'APPOINTMENTLYY',
    tenantName: 'Appointmentlyy',
  },
};

export async function proxy(request: NextRequest) {
  const blocked = await authGate(request);
  if (blocked) return blocked;

  const rawHost =
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    'app.appointmentlyy.com';

  // Strip port (e.g., localhost:3001 -> localhost)
  const cleanHost = rawHost.toLowerCase().replace(/:\d+$/, '').trim();

  // `?custom_domain=app.customerwebsiteurl.com` previews a white-label host (demo builds only).
  const previewDomainParam = DEMO_LOGIN
    ? request.nextUrl.searchParams.get('custom_domain')?.toLowerCase().trim()
    : undefined;

  const effectiveHost = previewDomainParam || cleanHost;
  const isCustomCustomerDomain =
    !PLATFORM_PRIMARY_HOSTS.has(effectiveHost) &&
    !effectiveHost.endsWith('.vercel.app');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-appointmentlyy-host', effectiveHost);
  requestHeaders.set(
    'x-appointmentlyy-is-custom-domain',
    isCustomCustomerDomain ? 'true' : 'false'
  );

  const matchedTenant = KNOWN_CUSTOM_DOMAINS[effectiveHost];
  if (matchedTenant) {
    requestHeaders.set('x-appointmentlyy-tenant-code', matchedTenant.tenantCode);
    requestHeaders.set('x-appointmentlyy-tenant-name', matchedTenant.tenantName);
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set('x-appointmentlyy-host', effectiveHost);
  response.cookies.set('appy_active_host', effectiveHost, {
    path: '/',
    sameSite: 'lax',
  });

  // White-label theme (redesign spec 7): the tenant brand colour rides in a cookie that the
  // <head> boot script in the root layout applies before first paint. On platform hosts the
  // signed-in workspace's brand sets that cookie (ThemeSync), so it is left alone here.
  if (matchedTenant?.brandColor && isCustomCustomerDomain) {
    response.cookies.set('appy_brand', matchedTenant.brandColor, { path: '/', sameSite: 'lax' });
  }

  if (matchedTenant) {
    response.cookies.set('appy_domain_tenant_code', matchedTenant.tenantCode, {
      path: '/',
      sameSite: 'lax',
    });
    response.cookies.set('appy_domain_tenant_name', matchedTenant.tenantName, {
      path: '/',
      sameSite: 'lax',
    });
  }

  return response;
}

export const config = {
  matcher: [
    // Run on all application routes while skipping static assets and internal _next files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

