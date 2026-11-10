import { NextRequest, NextResponse } from 'next/server';
import { SPARRING_PERSONAS, getPersonaVoiceByCountry, SparringCountry } from '@/lib/personas';
import { applyRateLimit } from '@/lib/security';
import { ELEVENLABS_MODELS } from '@/lib/elevenlabs/voiceEngine';
import { synthesizeWithElevenLabs } from '@/lib/server/elevenlabsTts';

export async function POST(req: NextRequest) {
  try {
    const rateLimitResponse = applyRateLimit(req, { maxRequests: 120, windowMs: 60000 });
    if (rateLimitResponse) return rateLimitResponse;

    const { personaId, country } = await req.json();
    const persona = SPARRING_PERSONAS.find(p => p.id === personaId) || SPARRING_PERSONAS[0];
    const voiceConfig = getPersonaVoiceByCountry(persona, (country as SparringCountry) || 'USA');

    const greetingText = `${persona.name} here. ${persona.coreObjection}`;

    // The buyer's greeting, voiced by ElevenLabs. On failure the client shows "Voice unavailable, retry".
    const voice = await synthesizeWithElevenLabs({
      text: greetingText,
      voiceId: voiceConfig.voiceId,
      voiceSettings: persona.voiceSettings,
      modelId: ELEVENLABS_MODELS.realtime,
    });

    return NextResponse.json({
      greetingText,
      audioUrl: voice.ok ? voice.audio : null,
      voiceModel: voice.ok ? voice.model : null,
      voiceError: voice.ok ? null : { code: voice.code, message: voice.error },
      scriptAssist: persona.initialScriptAssist
    });
  } catch (error: any) {
    console.error('[Sparring Dial Route] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Dial initiation failed' },
      { status: 500 }
    );
  }
}
