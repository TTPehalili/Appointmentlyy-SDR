import { NextRequest, NextResponse } from 'next/server';
import { json } from '@/lib/server/agreements/core';
import { getClientProjectStore } from '@/lib/server/clientProjectStore';
import { cpFail, ownerProject } from '@/lib/server/clientProjects/http';
import { buildClientUpdate, buildDeliveryReport } from '@/lib/server/clientProjects/statusText';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/client-projects/:id/export   (owner only)
 * "Export progress": the weekly Delivery Report text and a short client note, built from the board
 * state alone (no AI). The owner pastes the report into the Agreements Delivery Report template.
 */
export async function GET(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id, 'read');
  if (o instanceof NextResponse) return o;
  try {
    const store = getClientProjectStore();
    const [tasks, events] = await Promise.all([store.listTasks(id), store.findEvents(id, { type: 'client_delay', limit: 1000 })]);
    return json({ success: true, deliveryReport: buildDeliveryReport(o.project, tasks, events), clientUpdate: buildClientUpdate(o.project, tasks), generatedAt: new Date().toISOString() });
  } catch (err) {
    return cpFail(err, 'export');
  }
}
