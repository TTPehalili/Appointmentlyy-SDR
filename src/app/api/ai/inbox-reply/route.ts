import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { applyRateLimit } from '@/lib/security';
import {
  actionHasMove,
  buildInboxReplyPrompt,
  extractReply,
  fallbackReply,
  meetsLength,
  parseInboxReplyRequest,
  replySubject,
  ruleViolations,
  type InboxReplyMove,
  type InboxReplyResult,
} from '@/lib/inboxReply';

/** Fast flash models, tried in order. */
const CANDIDATE_MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash'];
const MODEL_TIMEOUT_MS = 12000;

async function callGemini(model: string, apiKey: string, prompt: string): Promise<string | null> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.5, maxOutputTokens: 2048 },
      }),
    });
    if (!res.ok) {
      console.warn(`[InboxReply] ${model} returned ${res.status}`);
      return null;
    }
    const data = await res.json();
    const parts: { text?: string; thought?: boolean }[] = data?.candidates?.[0]?.content?.parts ?? [];
    return parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('') || null;
  } catch (err) {
    console.warn(`[InboxReply] ${model} failed:`, err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const limited = applyRateLimit(req, { maxRequests: 30, windowMs: 60000 });
  if (limited) return limited;

  const raw = await req.json().catch(() => null);
  const parsed = parseInboxReplyRequest(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const request = parsed.value;
  // The sender is whoever is signed in; fall back to the server session when the client omits it.
  request.sender = {
    name: request.sender?.name || session.name,
    company: request.sender?.company || session.identity.tenant.name,
  };

  const subject = replySubject(request.thread);
  const apiKey = process.env.GOOGLE_API_KEY;

  if (apiKey) {
    const prompt = buildInboxReplyPrompt(request);
    // Take the first answer that keeps the length and content rules; otherwise the least bad one.
    let best: { reply: string; move?: InboxReplyMove; score: number } | null = null;
    for (const model of CANDIDATE_MODELS) {
      const text = await callGemini(model, apiKey, prompt);
      if (!text) continue;
      const out = extractReply(text);
      if (!out.reply) continue;
      const violations = ruleViolations(request, out.reply);
      const lengthOk = meetsLength(request, out.reply);
      if (violations.length) console.warn(`[InboxReply] ${model} broke rules:`, violations.join(', '));
      const score = violations.length * 10 + (lengthOk ? 0 : 5);
      if (!best || score < best.score) best = { ...out, score };
      if (score === 0) break;
    }
    if (best) {
      const result: InboxReplyResult = { reply: best.reply, subject };
      if (actionHasMove(request.action) && best.move) result.move = best.move;
      return NextResponse.json(result);
    }
  }

  const fb = fallbackReply(request);
  const result: InboxReplyResult = { reply: fb.reply, subject, fallback: true };
  if (fb.move) result.move = fb.move;
  return NextResponse.json(result);
}
