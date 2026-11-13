/**
 * Server-side ElevenLabs text-to-speech, shared by /api/tts, /api/sparring/dial and
 * /api/sparring/chat so every AI voice on the platform goes through one code path, one model
 * policy and one set of error messages. Uses the platform key (ELEVENLABS_API_KEY), so it works the
 * same in the demo workspace and in every client workspace.
 */
import {
  ALLOWED_ELEVENLABS_MODELS,
  ELEVENLABS_MODELS,
  stripAudioTags,
  supportsAudioTags,
  type VoiceErrorCode,
  voiceErrorMessage,
} from '@/lib/elevenlabs/voiceEngine';

const TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
/** Eric: conversational executive male. Used when a caller doesn't pass a voice. */
export const DEFAULT_VOICE_ID = 'cjVigY5qzO86Huf0OWal';
const ATTEMPT_TIMEOUT_MS = 10_000;

export interface VoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
}

export type ElevenLabsTtsResult =
  | { ok: true; audio: string; model: string; voiceId: string }
  | { ok: false; code: VoiceErrorCode; status: number; error: string };

export function elevenLabsKey(): string {
  return (process.env.ELEVENLABS_API_KEY || '').trim();
}

/** ElevenLabs voice ids are short alphanumeric strings; anything else is refused (it goes in the URL). */
function safeVoiceId(voiceId: unknown): string {
  return typeof voiceId === 'string' && /^[A-Za-z0-9]{8,40}$/.test(voiceId) ? voiceId : DEFAULT_VOICE_ID;
}

function clamp01(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

/** Ordered, de-duplicated model chain: the requested model (if allowed), then the realtime pair. */
function modelChain(requested: unknown): string[] {
  const first = typeof requested === 'string' && ALLOWED_ELEVENLABS_MODELS.includes(requested) ? requested : ELEVENLABS_MODELS.realtime;
  return Array.from(new Set([first, ELEVENLABS_MODELS.realtime, ELEVENLABS_MODELS.realtimeFallback]));
}

/** Maps an ElevenLabs error response to one of our codes. `final` = trying another model won't help. */
function classify(status: number, body: string): { code: VoiceErrorCode; final: boolean } {
  let detailStatus = '';
  try {
    const parsed = JSON.parse(body) as { detail?: { status?: string } | string };
    detailStatus = typeof parsed.detail === 'object' && parsed.detail ? String(parsed.detail.status || '') : '';
  } catch {
    // not JSON
  }
  if (detailStatus === 'quota_exceeded') return { code: 'quota', final: true };
  if (status === 401 || status === 403) return { code: 'auth', final: true };
  if (status === 429) return { code: 'rate_limited', final: false };
  if (status === 400 || status === 404 || status === 422) return { code: 'bad_request', final: false };
  return { code: 'upstream', final: false };
}

/**
 * Voices `text` with ElevenLabs. Tries the requested model, then the realtime models, and stops early
 * on errors another model can't fix (missing or rejected key, quota). Returns a data: URL (audio/mpeg).
 */
export async function synthesizeWithElevenLabs({
  text,
  voiceId,
  voiceSettings,
  modelId,
}: {
  text: string;
  voiceId?: unknown;
  voiceSettings?: VoiceSettings | null;
  modelId?: unknown;
}): Promise<ElevenLabsTtsResult> {
  const apiKey = elevenLabsKey();
  if (!apiKey) {
    return { ok: false, code: 'not_configured', status: 503, error: voiceErrorMessage('not_configured') };
  }
  const voice = safeVoiceId(voiceId);
  const settings = {
    stability: clamp01(voiceSettings?.stability, 0.5),
    similarity_boost: clamp01(voiceSettings?.similarity_boost, 0.75),
    style: clamp01(voiceSettings?.style, 0.08),
    use_speaker_boost: voiceSettings?.use_speaker_boost ?? true,
  };

  let last: { code: VoiceErrorCode; status: number; detail: string } = { code: 'upstream', status: 502, detail: '' };
  for (const model of modelChain(modelId)) {
    // Audio tags like [laughs] are performed by v3/v4 models; any other model would read them aloud.
    const spoken = supportsAudioTags(model) ? text : stripAudioTags(text) || 'Ha.';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
    try {
      // v3/v4 models reject optimize_streaming_latency (400 unsupported_model); older ones use it.
      const query = supportsAudioTags(model) ? '' : '?optimize_streaming_latency=4';
      const res = await fetch(`${TTS_URL}/${voice}${query}`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text: spoken, model_id: model, voice_settings: settings }),
        signal: controller.signal,
      });
      if (res.ok) {
        const base64 = Buffer.from(await res.arrayBuffer()).toString('base64');
        return { ok: true, audio: `data:audio/mpeg;base64,${base64}`, model, voiceId: voice };
      }
      const body = await res.text().catch(() => '');
      const { code, final } = classify(res.status, body);
      console.warn(`[ElevenLabs TTS] ${model} failed (${res.status}, ${code}):`, body.slice(0, 200));
      last = { code, status: res.status === 429 ? 429 : 502, detail: body.slice(0, 200) };
      if (final) break;
    } catch (err) {
      console.warn(`[ElevenLabs TTS] ${model} request error:`, err);
      last = { code: 'network', status: 504, detail: err instanceof Error ? err.message : String(err) };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, code: last.code, status: last.status, error: voiceErrorMessage(last.code) };
}
