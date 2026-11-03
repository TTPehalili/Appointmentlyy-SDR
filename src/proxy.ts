import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Appointmentlyy SDR — Multi-Tenant Custom Domain Edge Router (Next.js 16 `proxy.ts`)
 *
 * Production Primary Host: app.appointmentlyy.com
 * Customer Custom Domains: e.g. app.customerwebsiteurl.com, app.apexglobalbpo.com
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
  { tenantCode: string; tenantName: string }
> = {
  'app.appointmentlyy.com': {
    tenantCode: 'APPOINTMENTLYY',
    tenantName: 'Appointmentlyy',
  },
  'app.apexglobalbpo.com': {
    tenantCode: 'APEX-GLOBAL',
    tenantName: 'Apex Global BPO',
  },
  'app.shorepartnersbpo.com': {
    tenantCode: 'SHORE-PARTNERS',
    tenantName: 'ShorePartners BPO',
  },
  'sdr.cloudstaffoutsourcing.com': {
    tenantCode: 'CLOUD-STAFF',
    tenantName: 'CloudStaff Outsourcing',
  },
};

export function proxy(request: NextRequest) {
  const rawHost =
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    'app.appointmentlyy.com';

  // Strip port (e.g., localhost:3001 -> localhost)
  const cleanHost = rawHost.toLowerCase().replace(/:\d+$/, '').trim();

  // Allow query parameter `?custom_domain=app.customerwebsiteurl.com` for instant testing
  const previewDomainParam = request.nextUrl.searchParams
    .get('custom_domain')
    ?.toLowerCase()
    .trim();

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
