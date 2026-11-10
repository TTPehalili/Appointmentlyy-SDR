import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, validateTextPayload } from '@/lib/security';

export async function POST(req: NextRequest) {
  try {
    // 1. Enforce rate limiting (120 requests/minute per client IP)
    const rateLimitResponse = applyRateLimit(req, { maxRequests: 120, windowMs: 60000 });
    if (rateLimitResponse) return rateLimitResponse;

    const { text, voiceId, voiceSettings, modelId } = await req.json();

    // 2. Validate payload size to prevent quota drainage
    const validation = validateTextPayload(text, 1200);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const apiKey = (process.env.ELEVENLABS_API_KEY || '').trim();

    // Default to Eric (conversational executive male) if voiceId not provided
    const targetVoiceId = voiceId || 'cjVigY5qzO86Huf0OWal';

    const preferredModel = modelId || 'eleven_flash_v2_5';

    const candidateModels = [
      {
        id: preferredModel,
        settings: {
          stability: voiceSettings?.stability ?? 0.50,
          similarity_boost: voiceSettings?.similarity_boost ?? 0.75,
          style: voiceSettings?.style ?? 0.08,
          use_speaker_boost: true
        }
      },
      ...(preferredModel !== 'eleven_turbo_v2_5' ? [{
        id: 'eleven_turbo_v2_5',
        settings: {
          stability: voiceSettings?.stability ?? 0.48,
          similarity_boost: voiceSettings?.similarity_boost ?? 0.75,
          style: voiceSettings?.style ?? 0.08,
          use_speaker_boost: true
        }
      }] : []),
      {
        id: 'eleven_multilingual_v2',
        settings: {
          stability: voiceSettings?.stability ?? 0.50,
          similarity_boost: voiceSettings?.similarity_boost ?? 0.75,
          style: voiceSettings?.style ?? 0.10,
          use_speaker_boost: true
        }
      }
    ];

    let lastError = '';

    for (const candidate of candidateModels) {
      try {
        const response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}?optimize_streaming_latency=4`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': apiKey,
              'Content-Type': 'application/json',
              Accept: 'audio/mpeg'
            },
            body: JSON.stringify({
              text,
              model_id: candidate.id,
              voice_settings: candidate.settings
            })
          }
        );

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const base64Audio = Buffer.from(arrayBuffer).toString('base64');
          return NextResponse.json({
            audio: `data:audio/mpeg;base64,${base64Audio}`,
            voiceId: targetVoiceId,
            model: candidate.id
          });
        } else {
          lastError = await response.text();
          console.warn(`[ElevenLabs TTS] Model ${candidate.id} failed (${response.status}):`, lastError);
        }
      } catch (err: any) {
        lastError = err?.message || String(err);
        console.warn(`[ElevenLabs TTS] Synthesis attempt error:`, err);
      }
    }

    return NextResponse.json(
      { error: `ElevenLabs TTS failed: ${lastError}` },
      { status: 502 }
    );
  } catch (error: any) {
    console.error('[ElevenLabs TTS Route] Fatal error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error during speech synthesis' },
      { status: 500 }
    );
  }
}
