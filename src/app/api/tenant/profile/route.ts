import { NextRequest, NextResponse } from 'next/server';
import { hasRank } from '@/lib/server/session';
import { getTenantStore } from '@/lib/server/tenantStore';
import { getCompanyProfileStore } from '@/lib/server/meetingPlanStore';
import { cleanCompanyProfile } from '@/lib/server/meetingPlan/profile';
import { fail, json, readJsonObject, requireSession } from '@/lib/server/meetingPlanApi';

/** GET /api/tenant/profile -> { profile } for the session's workspace (any member). */
export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  try {
    const profile = await getCompanyProfileStore().get(session.tenantCode);
    return json({ success: true, profile, canEdit: hasRank(session, 'Admin') });
  } catch (err) {
    console.error('[tenant/profile GET]', err);
    return fail(500, 'Could not load the company profile.');
  }
}

/** PUT /api/tenant/profile { profile: CompanyProfileInput } -> { profile } (Admin+). */
export async function PUT(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  if (!hasRank(session, 'Admin')) return fail(403, 'Only admins can change the company profile.');
  try {
    const body = await readJsonObject(req);
    if (!body) return fail(400, 'Send the profile as JSON.');
    const clean = cleanCompanyProfile(body.profile);
    if (!clean) return fail(400, 'Add at least a short summary or one service.', 'profile');
    const profile = await getCompanyProfileStore().put(session.tenantCode, clean, session.email);
    try {
      await getTenantStore().addAudit({
        actorEmail: session.email,
        tenantCode: session.tenantCode,
        action: 'company_profile.update',
        target: session.tenantCode,
        detail: { website: clean.website, services: clean.services.length },
      });
    } catch (err) {
      console.error('[tenant/profile audit]', err);
    }
    return json({ success: true, profile });
  } catch (err) {
    console.error('[tenant/profile PUT]', err);
    return fail(500, 'Could not save the company profile.');
  }
}
