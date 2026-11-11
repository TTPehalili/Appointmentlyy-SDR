import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { hasRank } from '@/lib/server/session';
import { draftCompanyProfile } from '@/lib/server/meetingPlan/profile';
import { normalizeWebsite } from '@/lib/server/meetingPlan/safeFetch';
import { fail, friendlyError, json, readJsonObject, requireSession, tenantDisplayName } from '@/lib/server/meetingPlanApi';

export const maxDuration = 60;

/** Drafts per workspace per hour (each one reads a website and calls the AI). */
const DRAFTS_PER_HOUR = 10;

/**
 * POST /api/tenant/profile/draft { website } -> { profile } (Admin+; not saved).
 * Reads the workspace's own website and drafts the Company profile for an admin to review.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  if (!hasRank(session, 'Admin')) return fail(403, 'Only admins can change the company profile.');
  try {
    const body = await readJsonObject(req);
    if (!body) return fail(400, 'Send the website as JSON.');
    const website = typeof body.website === 'string' ? body.website.trim() : '';
    if (!website || website.length > 300 || !normalizeWebsite(website)) {
      return fail(400, "That doesn't look like a public website address. Try something like yourcompany.com.", 'website');
    }
    if (!rateLimit(`profile-draft:${session.tenantCode}`, DRAFTS_PER_HOUR, 60 * 60_000)) {
      return fail(429, `This workspace has drafted ${DRAFTS_PER_HOUR} profiles in the last hour. Please try again later, or fill it in by hand.`);
    }
    const profile = await draftCompanyProfile({ website, tenantName: tenantDisplayName(session.identity.tenant) });
    return json({ success: true, profile });
  } catch (err) {
    console.error('[tenant/profile/draft POST]', err instanceof Error ? err.message : err);
    return fail(500, friendlyError(err, 'Could not draft the profile right now. Please try again, or fill it in by hand.'));
  }
}
