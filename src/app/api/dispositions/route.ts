import { NextResponse, type NextRequest } from 'next/server';
import { hasRank } from '@/lib/server/session';
import { fail, json, readJsonObject, requireSession } from '@/lib/server/emailTemplateApi';
import type { CallDisposition } from '@/lib/dispositionStore';
import {
  MAX_DISPOSITIONS_PER_WORKSPACE,
  cleanDisposition,
  listDispositions,
  removeDisposition,
  replaceDispositions,
  upsertDisposition,
} from '@/lib/server/dispositionStore';

// Each workspace has its own list; the workspace always comes from the session, never the request.
// Anyone in the workspace may read it; only Admins (and platform staff) may change it.

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  return json({ success: true, dispositions: listDispositions(session.tenantCode) });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  if (!hasRank(session, 'Admin')) return fail(403, 'Only workspace admins can change call dispositions.');

  const body = await readJsonObject(req);
  if (!body) return fail(400, 'Invalid payload');

  if (Array.isArray(body.dispositions)) {
    if (body.dispositions.length > MAX_DISPOSITIONS_PER_WORKSPACE) {
      return fail(400, `At most ${MAX_DISPOSITIONS_PER_WORKSPACE} dispositions per workspace.`, 'dispositions');
    }
    const next: CallDisposition[] = [];
    const seen = new Set<string>();
    for (const raw of body.dispositions) {
      const c = cleanDisposition(raw);
      if (!c.ok) return fail(400, `Invalid disposition field: ${c.field}`, c.field);
      if (seen.has(c.value.id)) continue;
      seen.add(c.value.id);
      next.push(c.value);
    }
    replaceDispositions(session.tenantCode, next);
    return json({ success: true, count: next.length });
  }

  if (body.disposition !== undefined) {
    const c = cleanDisposition(body.disposition);
    if (!c.ok) return fail(400, `Invalid disposition field: ${c.field}`, c.field);
    if (!upsertDisposition(session.tenantCode, c.value)) {
      return fail(400, `At most ${MAX_DISPOSITIONS_PER_WORKSPACE} dispositions per workspace.`, 'disposition');
    }
    return json({ success: true, disposition: c.value });
  }

  return fail(400, 'Invalid payload');
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  if (!hasRank(session, 'Admin')) return fail(403, 'Only workspace admins can change call dispositions.');

  const id = (new URL(req.url).searchParams.get('id') || '').trim();
  if (!id || id.length > 80) return fail(400, 'Missing id query param', 'id');
  removeDisposition(session.tenantCode, id);
  return json({ success: true, deletedId: id });
}
