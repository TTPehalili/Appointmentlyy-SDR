import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/apiSession';
import { applyRateLimit, validateTextPayload } from '@/lib/security';
import { synthesizeWithElevenLabs } from '@/lib/server/elevenlabsTts';

/**
 * ElevenLabs text-to-speech for the browser (Practice, the Dialer's AI customer, Live floor).
 * 200: { audio: data URL, voiceId, model, engine: 'elevenlabs' }
 * Error: { error, code, engine: 'elevenlabs' } so the UI can show "Voice unavailable, retry".
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Enforce rate limiting (120 requests/minute per client IP)
    const rateLimitResponse = applyRateLimit(req, { maxRequests: 120, windowMs: 60000 });
    if (rateLimitResponse) return rateLimitResponse;
    const auth = await requireApiSession(req);
    if (auth instanceof NextResponse) return auth;

    const { text, voiceId, voiceSettings, modelId } = await req.json();

    // 2. Validate payload size to prevent quota drainage
    const validation = validateTextPayload(text, 1200);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error, code: 'bad_request', engine: 'elevenlabs' }, { status: 400 });
    }

    const result = await synthesizeWithElevenLabs({ text, voiceId, voiceSettings, modelId });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code, engine: 'elevenlabs' }, { status: result.status });
    }
    return NextResponse.json({ audio: result.audio, voiceId: result.voiceId, model: result.model, engine: 'elevenlabs' });
  } catch (error) {
    console.error('[ElevenLabs TTS Route] Fatal error:', error);
    return NextResponse.json(
      { error: 'Speech synthesis failed. Retry in a moment.', code: 'upstream', engine: 'elevenlabs' },
      { status: 500 },
    );
  }
}
