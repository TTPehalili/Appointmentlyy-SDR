import { NextRequest, NextResponse } from 'next/server';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { isCpId } from '@/lib/server/clientProjectStore';
import { requireProjectOwner } from '@/lib/server/clientProjects/core';
import { cpFail } from '@/lib/server/clientProjects/http';
import { listNotifications, markNotificationsSeen } from '@/lib/server/clientProjects/service';

/**
 * GET  /api/client-projects/notifications                      the owner's inbox (client actions, defects, mentions, assignments)
 * POST /api/client-projects/notifications  { projectId? }      mark read (one project, or all)
 * Platform owner only. Built from the event log; nothing is sent from here.
 */
export async function GET(req: NextRequest) {
  const owner = await requireProjectOwner(req, 'read');
  if (owner instanceof NextResponse) return owner;
  try {
    const limit = Math.max(1, Math.min(200, Math.trunc(Number(req.nextUrl.searchParams.get('limit') || 60)) || 60));
    return json({ success: true, ...(await listNotifications(owner.email, limit)) });
  } catch (err) {
    return cpFail(err, 'notifications');
  }
}

export async function POST(req: NextRequest) {
  const owner = await requireProjectOwner(req, 'write');
  if (owner instanceof NextResponse) return owner;
  const body = (await readJson(req, 1024)) ?? {};
  if (body.projectId !== undefined && !isCpId(body.projectId)) return fail(404, 'Project not found.');
  try {
    return json({ success: true, marked: await markNotificationsSeen(body.projectId as string | undefined) });
  } catch (err) {
    return cpFail(err, 'notifications seen');
  }
}
