import { NextRequest, NextResponse } from 'next/server';
import { getAnnouncementStore, isAnnouncementId } from '@/lib/server/announcementStore';
import { auditAnnouncement, requireStaff, validateWithTenants } from '@/lib/server/announcementApi';

type Ctx = { params: Promise<{ id: string }> };
const notFound = () => NextResponse.json({ success: false, error: 'Announcement not found.' }, { status: 404 });
const EDITABLE = ['title', 'message', 'linkUrl', 'linkLabel', 'kind', 'audience', 'workspaceCodes', 'publishAt', 'unpublishAt'];

/**
 * PATCH /api/platform/announcements/:id
 * Any subset of the announcement fields (validated as a whole), or { endNow: true } to take it
 * down immediately.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await requireStaff(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (!isAnnouncementId(id)) return notFound();
  try {
    const store = getAnnouncementStore();
    const current = await store.get(id);
    if (!current) return notFound();
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return NextResponse.json({ success: false, error: 'Send the changes as JSON.' }, { status: 400 });

    const endNow = body.endNow === true;
    const merged: Record<string, unknown> = { ...current };
    if (endNow) {
      const now = Date.now();
      // A scheduled one ends before it starts: keep the window valid (start < end).
      merged.publishAt = new Date(Math.min(Date.parse(current.publishAt), now - 1000)).toISOString();
      merged.unpublishAt = new Date(now).toISOString();
    } else {
      for (const k of EDITABLE) if (k in body) merged[k] = body[k];
    }
    const v = await validateWithTenants(merged);
    if ('error' in v) return v.error;
    const updated = await store.update(id, v.value);
    if (!updated) return notFound();
    await auditAnnouncement(session, endNow ? 'announcement.end' : 'announcement.update', id, {
      title: updated.title,
      publishAt: updated.publishAt,
      unpublishAt: updated.unpublishAt,
    });
    return NextResponse.json({ success: true, announcement: updated });
  } catch (err) {
    console.error('[platform/announcements PATCH]', err);
    return NextResponse.json({ success: false, error: 'Could not update the announcement.' }, { status: 500 });
  }
}

/** DELETE /api/platform/announcements/:id */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = await requireStaff(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (!isAnnouncementId(id)) return notFound();
  try {
    const store = getAnnouncementStore();
    const current = await store.get(id);
    if (!current || !(await store.remove(id))) return notFound();
    await auditAnnouncement(session, 'announcement.delete', id, { title: current.title });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[platform/announcements DELETE]', err);
    return NextResponse.json({ success: false, error: 'Could not delete the announcement.' }, { status: 500 });
  }
}
