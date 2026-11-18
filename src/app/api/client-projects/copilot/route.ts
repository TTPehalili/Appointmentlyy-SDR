import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { isCpId } from '@/lib/server/clientProjectStore';
import { requireProjectOwner } from '@/lib/server/clientProjects/core';
import { cpFail } from '@/lib/server/clientProjects/http';
import { answerProjectQuestion, SUGGESTED_QUESTIONS } from '@/lib/server/clientProjects/copilot';
import { aiMode } from '@/lib/server/clientProjects/ai';

/**
 * POST /api/client-projects/copilot   { question, projectId? }   (platform owner, Appointmentlyy workspace only)
 * "Ask Copilot" on the project page. The answer is built from server-computed facts (stats.ts); the
 * facts come back too, for the panel. Everyone else gets the same 401/403 as every other owner route.
 */
export async function POST(req: NextRequest) {
  const owner = await requireProjectOwner(req, 'ai');
  if (owner instanceof NextResponse) return owner;
  if (!rateLimit(`cp-owner-copilot:${owner.email}`, 40, 10 * 60_000)) return fail(429, 'Too many questions in a short time. Wait a few minutes.');
  const body = await readJson(req, 4 * 1024);
  if (!body || typeof body.question !== 'string' || !body.question.trim()) return fail(400, 'Ask a question.');
  if (body.projectId !== undefined && body.projectId !== null && !isCpId(body.projectId)) return fail(404, 'Project not found.');
  try {
    const out = await answerProjectQuestion(body.question, { projectId: (body.projectId as string | undefined) ?? null });
    if (body.projectId && !out.stats.length) return fail(404, 'Project not found.');
    return json({ success: true, ...out, ai: aiMode(), suggested: SUGGESTED_QUESTIONS });
  } catch (err) {
    return cpFail(err, 'copilot');
  }
}
