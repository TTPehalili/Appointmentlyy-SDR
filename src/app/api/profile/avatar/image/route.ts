import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { avatarImage } from '@/lib/server/avatars';

/**
 * GET /api/profile/avatar/image?email=a@x.com&v=<version>
 * An uploaded profile photo from the signed-in person's current workspace. The URL carries the
 * photo's content hash, so a matching `v` is cached by the browser for good and a new photo gets
 * a new URL.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  const email = (req.nextUrl.searchParams.get('email') || '').trim().toLowerCase();
  if (!email) return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 });
  try {
    const img = await avatarImage(session.tenantCode, email);
    if (!img) return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const fresh = req.nextUrl.searchParams.get('v') === img.version;
    return new NextResponse(new Uint8Array(img.bytes), {
      headers: {
        'Content-Type': img.mime,
        'Content-Length': String(img.bytes.length),
        'Cache-Control': fresh ? 'private, max-age=31536000, immutable' : 'private, no-cache',
        ETag: `"${img.version}"`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (err) {
    console.error('[profile/avatar/image]', err);
    return NextResponse.json({ success: false, error: 'Could not load the photo.' }, { status: 500 });
  }
}
