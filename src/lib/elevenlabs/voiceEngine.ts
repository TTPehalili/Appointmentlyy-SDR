/**
 * ElevenLabs is the platform's AI voice engine: every AI-generated voice in Practice (Sparring
 * sessions and Mock dialer), the Dialer's AI customer and the Live floor is synthesised by
 * ElevenLabs text-to-speech. There is no other TTS provider and no browser speech fallback.
 *
 * Client-safe: model ids and labels only, no keys.
 */

export const VOICE_ENGINE_NAME = 'ElevenLabs';

/** ElevenLabs TTS models used across the platform, by use. */
export const ELEVENLABS_MODELS = {
  /** Live two-way calls (AI customer, Sparring, Mock dialer): low latency, ~250 ms per line. */
  realtime: 'eleven_turbo_v2_5',
  /** Same latency class, used if the realtime model fails for a voice. */
  realtimeFallback: 'eleven_flash_v2_5',
  /** Live floor listen-in: the most expressive model; turns are pre-fetched, so latency is hidden. */
  expressive: 'eleven_v4_turbo',
} as const;

/** Models a client may ask /api/tts for. Anything else uses the realtime model. */
export const ALLOWED_ELEVENLABS_MODELS: readonly string[] = [
  'eleven_v4_turbo',
  'eleven_v4',
  'eleven_v3',
  'eleven_v3_conversational',
  'eleven_turbo_v2_5',
  'eleven_flash_v2_5',
  'eleven_multilingual_v2',
];

export const ELEVENLABS_MODEL_LABELS: Record<string, string> = {
  eleven_v4_turbo: 'Eleven v4 Turbo',
  eleven_v4: 'Eleven v4',
  eleven_v3: 'Eleven v3',
  eleven_v3_conversational: 'Eleven v3 Conversational',
  eleven_turbo_v2_5: 'Turbo v2.5',
  eleven_flash_v2_5: 'Flash v2.5',
  eleven_multilingual_v2: 'Multilingual v2',
};

export function elevenLabsModelLabel(modelId: string): string {
  return ELEVENLABS_MODEL_LABELS[modelId] || modelId;
}

/** Error codes /api/tts (and the sparring routes' `voiceError`) return when ElevenLabs can't voice a line. */
export type VoiceErrorCode = 'not_configured' | 'auth' | 'quota' | 'rate_limited' | 'bad_request' | 'upstream' | 'network';

/** Failures that a retry a moment later can fix. Missing/rejected keys and quota can't. */
export function isRetryableVoiceError(code: string | undefined | null): boolean {
  return code === 'rate_limited' || code === 'upstream' || code === 'network' || code === 'bad_request' || !code;
}

/** Short, rep-facing explanation of a voice failure. */
export function voiceErrorMessage(code: string | undefined | null): string {
  switch (code) {
    case 'not_configured':
      return 'ElevenLabs voice is not set up on this server yet.';
    case 'auth':
      return 'ElevenLabs rejected the voice key. An admin needs to check it.';
    case 'quota':
      return 'The ElevenLabs character quota is used up.';
    case 'rate_limited':
      return 'ElevenLabs is busy. Retry in a moment.';
    case 'network':
      return 'Could not reach ElevenLabs. Check the connection and retry.';
    default:
      return 'ElevenLabs could not voice this line.';
  }
}
