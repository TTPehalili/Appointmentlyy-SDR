import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { isDemoSession } from '@/lib/demoMode';

/**
 * GET /api/demo/contacts: the 1,000 sample contacts for the platform owner's demo workspace
 * (Super Admin in APPOINTMENTLYY). Served from here so the records never ship in the client
 * bundle; every other session gets 403.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  if (!isDemoSession(session)) {
    return NextResponse.json({ success: false, error: 'Not available in this workspace.' }, { status: 403 });
  }
  const { default: contacts } = await import('@/lib/liveBpo1000Data.json');
  return NextResponse.json(
    { success: true, contacts },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
