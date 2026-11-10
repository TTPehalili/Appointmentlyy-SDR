import { NextRequest, NextResponse } from 'next/server';
import { SPARRING_PERSONAS, getPersonaVoiceByCountry, SparringCountry } from '@/lib/personas';
import { applyRateLimit } from '@/lib/security';

export async function POST(req: NextRequest) {
  try {
    const rateLimitResponse = applyRateLimit(req, { maxRequests: 120, windowMs: 60000 });
    if (rateLimitResponse) return rateLimitResponse;

    const { personaId, country } = await req.json();
    const persona = SPARRING_PERSONAS.find(p => p.id === personaId) || SPARRING_PERSONAS[0];
    const voiceConfig = getPersonaVoiceByCountry(persona, (country as SparringCountry) || 'USA');
    const elevenApiKey = (process.env.ELEVENLABS_API_KEY || '').trim();

    const greetingText = `${persona.name} here. ${persona.coreObjection}`;

    let audioUrl: string | null = null;
    if (elevenApiKey) {
      const candidateModels = ['eleven_turbo_v2_5', 'eleven_multilingual_v2'];
      for (const modelId of candidateModels) {
        try {
          const ttsRes = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceConfig.voiceId}?optimize_streaming_latency=4`,
            {
              method: 'POST',
              headers: {
                'xi-api-key': elevenApiKey,
                'Content-Type': 'application/json',
                Accept: 'audio/mpeg'
              },
              body: JSON.stringify({
                text: greetingText,
                model_id: modelId,
                voice_settings: persona.voiceSettings || {
                  stability: 0.48,
                  similarity_boost: 0.75,
                  style: 0.08,
                  use_speaker_boost: true
                }
              })
            }
          );

          if (ttsRes.ok) {
            const ab = await ttsRes.arrayBuffer();
            const base64 = Buffer.from(ab).toString('base64');
            audioUrl = `data:audio/mpeg;base64,${base64}`;
            break;
          } else {
            const errTxt = await ttsRes.text();
            console.warn(`[Dial Route TTS] Model ${modelId} status ${ttsRes.status}:`, errTxt);
          }
        } catch (err) {
          console.warn('[Dial Route TTS Error]:', err);
        }
      }
    }

    return NextResponse.json({
      greetingText,
      audioUrl,
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
