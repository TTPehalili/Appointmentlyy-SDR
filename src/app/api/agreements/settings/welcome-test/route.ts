import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { fail, json, readJson, requireOwner } from '@/lib/server/agreements/core';
import { WelcomeError, sendWelcomeTest } from '@/lib/server/agreements/welcome';
import { safeBookingLink, welcomeTemplateProblem } from '@/lib/agreements/welcome';

/**
 * POST /api/agreements/settings/welcome-test { kickoffBookingLink?, welcomeSubject?, welcomeBody? }  (platform owner only)
 * "Send a test to me": renders the welcome email (the given, possibly unsaved, template) with sample values and
 * emails it to the owner's notification address only. Nothing is saved.
 */
export async function POST(req: NextRequest) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  if (!rateLimit(`agr-welcome-test:${owner.email}`, 10, 10 * 60_000)) return fail(429, 'Too many test emails. Wait a few minutes.');
  const body = await readJson(req, 64 * 1024);
  if (!body) return fail(400, 'Send the template as JSON.');
  const kickoffBookingLink = String(body.kickoffBookingLink ?? '').trim();
  const welcomeSubject = String(body.welcomeSubject ?? '').trim();
  const welcomeBody = String(body.welcomeBody ?? '').replace(/\r\n?/g, '\n').trim();
  if (kickoffBookingLink && !safeBookingLink(kickoffBookingLink)) return fail(400, 'The kickoff booking link must be a full https:// address (a Google Calendar booking page or Calendly).');
  const problem = welcomeTemplateProblem('subject', welcomeSubject) || welcomeTemplateProblem('body', welcomeBody);
  if (problem) return fail(400, problem);
  try {
    const r = await sendWelcomeTest({ kickoffBookingLink, welcomeSubject, welcomeBody });
    if (!r.ok) return fail(502, r.error || 'The test email was not sent.');
    return json({ success: true, to: r.to });
  } catch (err) {
    if (err instanceof WelcomeError) return fail(err.status, err.message);
    console.error('[agreements/settings/welcome-test]', err instanceof Error ? err.message.slice(0, 200) : 'error');
    return fail(500, 'Could not send the test email.');
  }
}
