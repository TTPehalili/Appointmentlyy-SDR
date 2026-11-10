import * as React from 'react';
import { AudioLines } from 'lucide-react';
import { cn } from '@/lib/cn';
import { VOICE_ENGINE_NAME } from '@/lib/elevenlabs/voiceEngine';

/**
 * Quiet "voice by ElevenLabs" credit for the screens where AI voices speak (Practice, the Dialer's
 * AI customer, Live floor). Text only: no logo asset ships in /public, so none is drawn here.
 *
 * - `pill`: bordered chip for page headers.
 * - `inline`: plain caption text for status rows and panels.
 * `onDark` is for the always-dark call surfaces (ink backgrounds) that don't follow the theme;
 * `inheritColor` takes the surrounding text colour (e.g. inside a tinted banner).
 */
export function ElevenLabsAttribution({
  label = 'AI voices powered by',
  detail,
  variant = 'inline',
  onDark = false,
  inheritColor = false,
  className,
}: {
  /** Text before the "ElevenLabs" name, e.g. "Voice:". */
  label?: string;
  /** Optional trailing detail, e.g. the model name. */
  detail?: string;
  variant?: 'pill' | 'inline';
  onDark?: boolean;
  inheritColor?: boolean;
  className?: string;
}) {
  const muted = inheritColor ? '' : onDark ? 'text-ink-400' : 'text-fg-secondary';
  const strong = inheritColor ? '' : onDark ? 'text-ink-50' : 'text-fg';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap',
        variant === 'pill'
          ? cn('h-7 rounded-full border px-2.5 text-small', onDark ? 'border-ink-700' : 'border-line bg-surface')
          : 'text-caption',
        muted,
        className,
      )}
      title={`Text-to-speech by ${VOICE_ENGINE_NAME}${detail ? ` (${detail})` : ''}`}
      data-voice-engine="elevenlabs"
    >
      <AudioLines className="size-3.5" aria-hidden />
      <span>
        {label} <span className={cn('font-medium', strong)}>{VOICE_ENGINE_NAME}</span>
        {detail ? <span> · {detail}</span> : null}
      </span>
    </span>
  );
}
