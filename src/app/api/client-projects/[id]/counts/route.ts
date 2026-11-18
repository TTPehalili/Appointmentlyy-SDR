import { NextRequest, NextResponse } from 'next/server';
import { json } from '@/lib/server/agreements/core';
import { getClientProjectStore } from '@/lib/server/clientProjectStore';
import { cpFail, ownerProject } from '@/lib/server/clientProjects/http';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/client-projects/:id/counts   (owner only) what a permanent delete would remove. Round trips: 2. */
export async function GET(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id, 'read');
  if (o instanceof NextResponse) return o;
  try {
    const counts = await getClientProjectStore().countAll(id);
    return json({ success: true, counts: { ...counts, people: (o.project.people ?? []).length }, clientName: o.project.clientName });
  } catch (err) {
    return cpFail(err, 'counts');
  }
}
