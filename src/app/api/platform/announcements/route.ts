import { NextRequest, NextResponse } from 'next/server';
import { getAnnouncementStore } from '@/lib/server/announcementStore';
import { auditAnnouncement, requireStaff, validateWithTenants } from '@/lib/server/announcementApi';

/** GET /api/platform/announcements: every announcement, newest first (platform staff only). */
export async function GET(req: NextRequest) {
  const session = await requireStaff(req);
  if (session instanceof NextResponse) return session;
  try {
    const store = getAnnouncementStore();
    return NextResponse.json(
      { success: true, announcements: await store.list(), storage: store.backend },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[platform/announcements GET]', err);
    return NextResponse.json({ success: false, error: 'Could not load announcements.' }, { status: 500 });
  }
}

/** POST /api/platform/announcements { title, message, linkUrl?, linkLabel?, kind, audience, workspaceCodes?, publishAt, unpublishAt } */
export async function POST(req: NextRequest) {
  const session = await requireStaff(req);
  if (session instanceof NextResponse) return session;
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return NextResponse.json({ success: false, error: 'Send the announcement as JSON.' }, { status: 400 });
    const v = await validateWithTenants(body);
    if ('error' in v) return v.error;
    const created = await getAnnouncementStore().create(v.value, session.email);
    await auditAnnouncement(session, 'announcement.create', created.id, {
      title: created.title,
      audience: created.audience,
      publishAt: created.publishAt,
      unpublishAt: created.unpublishAt,
    });
    return NextResponse.json({ success: true, announcement: created });
  } catch (err) {
    console.error('[platform/announcements POST]', err);
    return NextResponse.json({ success: false, error: 'Could not save the announcement.' }, { status: 500 });
  }
}
