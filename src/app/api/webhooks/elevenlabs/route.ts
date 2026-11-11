import { NextRequest, NextResponse } from 'next/server';
import { QaEvaluator, DialogueTurn } from '@/lib/qaEvaluator';
import { getServiceSupabase } from '@/lib/supabase';
import { getServerSession } from '@/lib/server/session';
import {
  allowUnsignedWithoutSecret,
  logRejection,
  verifyElevenLabsSignature,
  webhookSecret,
} from '@/lib/server/webhookSignatures';

/**
 * Scores a practice (sparring) call with the QA engine.
 *
 * Two callers:
 * - The app itself (Practice page, Dialer practice call) with the signed-in member's session cookie.
 * - ElevenLabs post-call webhooks (no cookie): must carry a valid `ElevenLabs-Signature` when
 *   ELEVENLABS_WEBHOOK_SECRET is set. Without that secret, unsigned calls are refused in production.
 */
const ROUTE = 'ElevenLabs Webhook';
const SECRET_ENV = 'ELEVENLABS_WEBHOOK_SECRET';
const MAX_BODY_BYTES = 1_000_000;
const MAX_TURNS = 400;
const MAX_TURN_CHARS = 4000;

/** JSON.parse that returns null instead of throwing. */
function parseJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const unauthorized = () => NextResponse.json({ error: 'Unauthorized webhook call.' }, { status: 401 });

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
    }

    const session = await getServerSession(req);
    let fromProvider = false;
    if (!session) {
      const secret = webhookSecret(SECRET_ENV);
      if (secret) {
        const v = verifyElevenLabsSignature({ secret, header: req.headers.get('elevenlabs-signature'), rawBody });
        if (!v.ok) {
          logRejection(ROUTE, `Rejected a webhook call: ${v.reason}.`);
          return unauthorized();
        }
        fromProvider = true;
      } else if (!allowUnsignedWithoutSecret(ROUTE, SECRET_ENV)) {
        return unauthorized();
      }
    }

    const body = parseJson(rawBody);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Body must be a JSON object.' }, { status: 400 });
    }

    // ElevenLabs' own envelope: { type, event_timestamp, data: { conversation_id, transcript: [{ role: 'agent'|'user', message }] } }.
    // In practice calls the AI agent plays the prospect and the user is the rep.
    let rawTranscript = Array.isArray(body.transcript) ? body.transcript : [];
    let conversationId: string = body.conversation_id || body.sessionId || `session-${Date.now()}`;
    if (typeof body.type === 'string' && body.data && typeof body.data === 'object') {
      if (body.type !== 'post_call_transcription') {
        return NextResponse.json({ success: true, ignored: body.type });
      }
      conversationId = String(body.data.conversation_id || conversationId);
      rawTranscript = Array.isArray(body.data.transcript)
        ? body.data.transcript.map((t: { role?: unknown; message?: unknown } | null) => ({ role: t?.role === 'user' ? 'rep' : 'prospect', content: t?.message ?? '' }))
        : [];
    }
    conversationId = String(conversationId).slice(0, 120);

    const scenarioContext: string | undefined =
      typeof (body.scenarioContext || body.scenario) === 'string' ? String(body.scenarioContext || body.scenario).slice(0, 2000) : undefined;
    const repId: string = typeof body.repId === 'string' ? body.repId : '00000000-0000-0000-0000-000000000000';
    const campaignId: string | undefined = typeof body.campaignId === 'string' ? body.campaignId : undefined;

    // Convert raw turns into standard DialogueTurn format
    const turns: DialogueTurn[] = rawTranscript.slice(0, MAX_TURNS).map((t: any) => ({
      role: (t?.role || t?.speaker || 'rep').toLowerCase() === 'rep' || (t?.role || t?.speaker || '').toLowerCase() === 'agent' ? 'rep' : 'prospect',
      content: String(t?.content || t?.message || t?.text || '').slice(0, MAX_TURN_CHARS),
      timestamp: t?.timestamp || undefined
    }));

    if (turns.length === 0) {
      return NextResponse.json(
        { error: 'Transcript array is required and must not be empty.' },
        { status: 400 }
      );
    }

    // 1. Run Automated QA Evaluation & ARM Scoring Engine
    const evaluation = await QaEvaluator.evaluateCall(conversationId, turns, scenarioContext);

    // 2. Persist session to Supabase (only with the server's service key; never the public key)
    let savedSessionId: string = conversationId;
    if ((process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()) {
      try {
        const supabase = getServiceSupabase();
        const { data, error } = await supabase
          .from('sparring_sessions')
          .insert({
            rep_id: repId,
            campaign_id: campaignId || null,
            scenario: scenarioContext || 'AI Sparring Simulation',
            transcript: evaluation.annotatedTranscript,
            score: evaluation.overallScore,
            feedback: {
              overallGrade: evaluation.overallGrade,
              armExecutionScore: evaluation.armExecutionScore,
              scriptAdherenceScore: evaluation.scriptAdherenceScore,
              talkToListenRatio: evaluation.talkToListenRatio,
              strengths: evaluation.strengths,
              weaknesses: evaluation.weaknesses,
              coachingActionItems: evaluation.coachingActionItems
            }
          })
          .select('id')
          .single();

        if (error) console.warn('[ElevenLabs Webhook] Supabase persist failed:', error.message);
        else if (data) savedSessionId = data.id;
      } catch (dbErr) {
        console.warn('[ElevenLabs Webhook] Supabase persist note:', dbErr);
      }
    }

    if (fromProvider) {
      // ElevenLabs only needs a 2xx; don't echo the scorecard back to it.
      return NextResponse.json({ success: true, sessionId: savedSessionId });
    }
    return NextResponse.json({
      success: true,
      sessionId: savedSessionId,
      evaluation: {
        ...evaluation,
        sessionId: savedSessionId
      }
    });

  } catch (error: any) {
    console.error('[ElevenLabs Webhook] Error evaluating sparring session:', error);
    return NextResponse.json(
      { error: 'Failed to evaluate sparring session' },
      { status: 500 }
    );
  }
}
