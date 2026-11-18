import { NextRequest, NextResponse } from 'next/server';
import { json } from '@/lib/server/agreements/core';
import { cpFail, ownerProject } from '@/lib/server/clientProjects/http';
import { loadSop } from '@/lib/server/clientProjects/service';

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/client-projects/:id/sop   "Load SOP cards" into a project with no cards (409 otherwise; owner only). */
export async function POST(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id);
  if (o instanceof NextResponse) return o;
  try {
    return json({ success: true, cards: await loadSop(o.project, o.ctx) });
  } catch (err) {
    return cpFail(err, 'load sop');
  }
}
