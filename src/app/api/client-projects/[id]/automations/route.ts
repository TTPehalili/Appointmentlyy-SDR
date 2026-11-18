import { NextRequest, NextResponse } from 'next/server';
import { json } from '@/lib/server/agreements/core';
import { mailStatus } from '@/lib/server/agreements/mail';
import { getClientProjectStore } from '@/lib/server/clientProjectStore';
import { cpFail, ownerProject } from '@/lib/server/clientProjects/http';
import { AUTOMATION_RULES } from '@/lib/clientProjects/types';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/client-projects/:id/automations   (owner only; the Automations tab)
 * The latest 30 firings and the count per rule (ONE grouped query). Round trips: 2.
 */
export async function GET(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id, 'read');
  if (o instanceof NextResponse) return o;
  try {
    const store = getClientProjectStore();
    const [events, counts] = await Promise.all([store.findEvents(id, { type: 'automation', limit: 30 }), store.countByRule(id)]);
    return json({ success: true, events, counts: Object.fromEntries(AUTOMATION_RULES.map((r) => [r, counts[r] ?? 0])), mail: mailStatus() });
  } catch (err) {
    return cpFail(err, 'automations');
  }
}
