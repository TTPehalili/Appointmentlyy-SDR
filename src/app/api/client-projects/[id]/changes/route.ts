import { NextRequest, NextResponse } from 'next/server';
import { fail, json } from '@/lib/server/agreements/core';
import { getClientProjectStore, isCpId } from '@/lib/server/clientProjectStore';
import { requireProjectOwner } from '@/lib/server/clientProjects/core';
import { cpFail } from '@/lib/server/clientProjects/http';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/client-projects/:id/changes   (owner only)
 * "Has anything changed?": the newest event of the project (every change writes one). ONE query. The
 * project page polls this every 45 seconds while it is visible and refetches the project only when the
 * answer moves. An unknown project simply has no events (the full GET is what returns 404).
 */
export async function GET(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const owner = await requireProjectOwner(req, 'read');
  if (owner instanceof NextResponse) return owner;
  if (!isCpId(id)) return fail(404, 'Project not found.');
  try {
    const latest = await getClientProjectStore().latestEvent(id);
    return json({ success: true, latest: latest ? `${latest.at}~${latest.id}` : null });
  } catch (err) {
    return cpFail(err, 'changes');
  }
}
