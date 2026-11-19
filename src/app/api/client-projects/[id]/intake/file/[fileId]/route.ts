import { NextRequest, NextResponse } from 'next/server';
import { fail } from '@/lib/server/agreements/core';
import { getClientProjectStore, INTAKE_SOURCE, isCpId } from '@/lib/server/clientProjectStore';
import { cpFail, fileResponse, ownerProject } from '@/lib/server/clientProjects/http';

type Ctx = { params: Promise<{ id: string; fileId: string }> };

/**
 * GET /api/client-projects/:id/intake/file/:fileId   (owner only)
 * A client's upload, ALWAYS as a download (Content-Disposition: attachment), never inline, with nosniff and a
 * same-origin resource policy. SVG logos are the sanitised copy. There is no public route for these files.
 */
export async function GET(req: NextRequest, c: Ctx) {
  const { id, fileId } = await c.params;
  const o = await ownerProject(req, id, 'read');
  if (o instanceof NextResponse) return o;
  if (!isCpId(fileId)) return fail(404, 'File not found.');
  try {
    const s = getClientProjectStore();
    const f = await s.getFile(fileId);
    if (!f || f.projectId !== o.project.id || f.source !== INTAKE_SOURCE) return fail(404, 'File not found.');
    const bytes = await s.getFileBytes(f.id);
    if (!bytes) return fail(404, 'File not found.');
    return fileResponse(bytes, f.mime, f.name, true);
  } catch (err) {
    return cpFail(err, 'intake file');
  }
}
