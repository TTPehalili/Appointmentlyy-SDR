import { NextRequest, NextResponse } from 'next/server';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { getClientProjectStore } from '@/lib/server/clientProjectStore';
import { cpFail, fileResponse, ownerTask, readCapped } from '@/lib/server/clientProjects/http';
import { addAttachment, attachmentOf, removeAttachment, setAttachmentVisible } from '@/lib/server/clientProjects/service';
import { CP_LIMITS } from '@/lib/clientProjects/types';

type Ctx = { params: Promise<{ id: string; taskId: string }> };

/**
 * GET /api/client-projects/:id/tasks/:taskId/attachments            the card's attachments (metadata)
 * GET /api/client-projects/:id/tasks/:taskId/attachments?fileId=...  one file's bytes (owner only)
 */
export async function GET(req: NextRequest, c: Ctx) {
  const { id, taskId } = await c.params;
  const o = await ownerTask(req, id, taskId, 'read');
  if (o instanceof NextResponse) return o;
  try {
    const fileId = req.nextUrl.searchParams.get('fileId');
    if (!fileId) {
      const files = (await getClientProjectStore().listFiles(id, 'attachment')).filter((f) => f.taskId === o.task.id);
      return json({ success: true, files, limits: { bytes: CP_LIMITS.fileBytes, perCard: CP_LIMITS.attachmentsPerTask } });
    }
    const f = await attachmentOf(o.project, o.task, fileId);
    const bytes = await getClientProjectStore().getFileBytes(f.id);
    if (!bytes) return fail(404, 'Attachment not found.');
    return fileResponse(bytes, f.mime, f.name, req.nextUrl.searchParams.get('download') === '1');
  } catch (err) {
    return cpFail(err, 'attachment get');
  }
}

/**
 * POST /api/client-projects/:id/tasks/:taskId/attachments   (owner only)
 * Body: the file itself (any Content-Type; the type is read from the bytes: PDF, PNG or JPG), name in
 * X-File-Name. New files are hidden from the client until the owner turns that on.
 */
export async function POST(req: NextRequest, c: Ctx) {
  const { id, taskId } = await c.params;
  const o = await ownerTask(req, id, taskId, 'upload');
  if (o instanceof NextResponse) return o;
  try {
    const bytes = await readCapped(req, CP_LIMITS.fileBytes);
    if (!bytes) return fail(413, `The file is larger than ${Math.floor(CP_LIMITS.fileBytes / 1024 / 1024)} MB.`);
    let name = 'attachment';
    try {
      name = decodeURIComponent(req.headers.get('x-file-name') || '') || name;
    } catch {
      /* keep the default name */
    }
    const file = await addAttachment(o.project, o.task, name, bytes, o.ctx);
    return json({ success: true, file });
  } catch (err) {
    return cpFail(err, 'attachment upload');
  }
}

/** PATCH ...?fileId=...  { clientVisible }   show or hide one file on the client board. */
export async function PATCH(req: NextRequest, c: Ctx) {
  const { id, taskId } = await c.params;
  const o = await ownerTask(req, id, taskId);
  if (o instanceof NextResponse) return o;
  const body = await readJson(req, 1024);
  if (!body || typeof body.clientVisible !== 'boolean') return fail(400, 'Send { clientVisible: true | false }.');
  try {
    const f = await attachmentOf(o.project, o.task, req.nextUrl.searchParams.get('fileId'));
    return json({ success: true, file: await setAttachmentVisible(o.project, o.task, f, body.clientVisible, o.ctx) });
  } catch (err) {
    return cpFail(err, 'attachment patch');
  }
}

/** DELETE ...?fileId=...   remove one attachment (the event log keeps its name and hash). */
export async function DELETE(req: NextRequest, c: Ctx) {
  const { id, taskId } = await c.params;
  const o = await ownerTask(req, id, taskId);
  if (o instanceof NextResponse) return o;
  try {
    const f = await attachmentOf(o.project, o.task, req.nextUrl.searchParams.get('fileId'));
    await removeAttachment(o.project, o.task, f, o.ctx);
    return json({ success: true });
  } catch (err) {
    return cpFail(err, 'attachment delete');
  }
}
