import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { tenantLogoImage } from '@/lib/server/tenantLogos';

/**
 * GET /api/tenant/logo/image?v=<version>[&t=<code>]
 * A workspace logo, for an <img> in the app shell. Members get their own workspace's logo; `t` may name another
 * workspace only for platform staff (the Client Projects provisioning preview). The URL carries the content hash, so a
 * matching `v` is cached for good. Served as exactly the checked type, with nosniff, a same-origin resource policy and
 * a sandboxing CSP (an SVG opened directly runs nothing; it is also the sanitised rebuild).
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  const t = (req.nextUrl.searchParams.get('t') || '').trim().toUpperCase();
  const code = t || session.tenantCode;
  if (code !== session.tenantCode && !session.isPlatformAdmin) return NextResponse.json({ success: false, error: 'Not found.' }, { status: 403 });
  try {
    const img = await tenantLogoImage(code);
    if (!img) return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const fresh = req.nextUrl.searchParams.get('v') === img.version;
    return new NextResponse(new Uint8Array(img.bytes), {
      headers: {
        'Content-Type': img.mime,
        'Content-Length': String(img.bytes.length),
        'Cache-Control': fresh ? 'private, max-age=31536000, immutable' : 'private, no-cache',
        ETag: `"${img.version}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'",
      },
    });
  } catch (err) {
    console.error('[tenant/logo/image]', err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, error: 'Could not load the logo.' }, { status: 500 });
  }
}
