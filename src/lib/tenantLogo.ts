/**
 * Workspace logo rules shared by the server (validation) and the browser (limits, what to show). No 'use client' and no
 * browser or Node APIs: safe to import anywhere. Storage and the byte checks are in src/lib/server/tenantLogos.ts.
 */

/** Largest accepted logo (decoded bytes). */
export const LOGO_MAX_BYTES = 512 * 1024;
export const LOGO_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
export type LogoMime = (typeof LOGO_MIMES)[number];
export const LOGO_IMAGE_ROUTE = '/api/tenant/logo/image';
export const LOGO_ACCEPT = '.png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml';

/**
 * The URL an <img> uses for a workspace logo. Without `tenantCode` it is the signed-in workspace's own logo; platform
 * staff may name another workspace (the Client Projects provisioning preview). The version makes it cacheable for good.
 */
export function logoSrc(version: string, tenantCode?: string): string {
  const q = new URLSearchParams({ v: version });
  if (tenantCode) q.set('t', tenantCode);
  return `${LOGO_IMAGE_ROUTE}?${q.toString()}`;
}

export const fmtLogoSize = (n: number) => (n < 1024 ? `${n} B` : `${Math.round(n / 1024)} KB`);
