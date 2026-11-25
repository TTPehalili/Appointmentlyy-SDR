import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { limitPerUser } from '@/lib/server/userRateLimit';
import { getSupportTicketStore, isAttachmentId, normalizeTicketId } from '@/lib/server/supportTickets';
import { canSeeReporterFiles } from '@/lib/server/ticketScope';
import { sniffMatches } from '@/lib/server/supportScreenshots';
import { fail, storageFail, viewerOf } from '@/lib/server/supportTicketsHttp';

/**
 * GET /api/tickets/[id]/attachments/[attachmentId]
 * A screenshot, for the person who filed the report and Appointmentlyy support only (screenshots can show lead data,
 * so the rest of the workspace does not get them). Served exactly as the type it was checked as, with nosniff, a
 * sandboxing CSP, same-origin only, and never cached.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string; attachmentId: string }> }) {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  const limited = limitPerUser('tickets-file', session, { maxRequests: 240 });
  if (limited) return limited;
  const p = await context.params;
  const id = normalizeTicketId(p.id);
  if (!id || !isAttachmentId(p.attachmentId)) return fail(404, 'Not found.');
  try {
    const store = getSupportTicketStore();
    const t = await store.get(id);
    if (!t || !canSeeReporterFiles(t, viewerOf(session))) return fail(404, 'Not found.');
    const a = await store.getAttachment(id, p.attachmentId.toLowerCase());
    if (!a) return fail(404, 'Not found.');
    const bytes = Buffer.from(a.data, 'base64');
    // Exactly what was checked and saved, and still the type it was saved as.
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== a.sha256 || !sniffMatches(bytes, a.mime)) return fail(404, 'Not found.');
    const ext = a.mime === 'image/png' ? 'png' : a.mime === 'image/jpeg' ? 'jpg' : 'webp';
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': a.mime,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `inline; filename="${id}-screenshot.${ext}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Content-Security-Policy': "default-src 'none'; sandbox; frame-ancestors 'none'",
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (err) {
    return storageFail(err, 'file');
  }
}
