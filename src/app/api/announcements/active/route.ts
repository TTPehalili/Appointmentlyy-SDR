import { NextRequest, NextResponse } from 'next/server';
import { announcementMatches, toActive } from '@/lib/announcements';
import { getAnnouncementStore } from '@/lib/server/announcementStore';
import { getServerSession } from '@/lib/server/session';

/**
 * GET /api/announcements/active: platform announcements live right now for the signed-in person
 * (newest first). Audience comes from the server session, never from the request.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  try {
    const live = await getAnnouncementStore().listLive(new Date().toISOString());
    const viewer = { role: session.role, isPlatformAdmin: session.isPlatformAdmin, tenantCode: session.tenantCode };
    const announcements = live.filter((a) => announcementMatches(a, viewer)).slice(0, 10).map(toActive);
    return NextResponse.json({ success: true, announcements }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[announcements/active GET]', err);
    return NextResponse.json({ success: false, error: 'Could not load announcements.' }, { status: 500 });
  }
}
