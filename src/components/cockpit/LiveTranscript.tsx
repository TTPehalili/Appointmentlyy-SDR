'use client';

import React, { useEffect, useRef } from 'react';
import { TranscriptEntry } from '@/types';
import { Radio } from 'lucide-react';

interface LiveTranscriptProps {
  transcript: TranscriptEntry[];
  interimText: string;
  isListening?: boolean;
}

export default function LiveTranscript({
  transcript,
  interimText,
  isListening
}: LiveTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, interimText]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex shrink-0 items-center justify-between border-b border-line pb-2">
        <span className="text-caption text-fg-tertiary">
          Live transcript
        </span>
        <span className="flex items-center gap-1.5 text-caption text-fg-tertiary">
          {isListening && <span className="size-1.5 rounded-full bg-success-500 animate-pulse-soft" />}
          {isListening ? 'Listening' : 'Standby'}
        </span>
      </div>

      {/* Transcript Log Container */}
      <div
        ref={scrollRef}
        className="flex-1 select-text space-y-2 overflow-y-auto rounded-md border border-line bg-surface p-2.5 text-small"
      >
        {transcript.length === 0 && !interimText && (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            <Radio className="mb-1.5 size-5 text-fg-disabled" />
            <p className="text-small text-fg-secondary">Audio stream on standby.</p>
            <p className="mt-0.5 text-caption text-fg-tertiary">Start a call to see the live transcript.</p>
          </div>
        )}

        {transcript.map((entry) => {
          const isRep = entry.speaker === 'rep';
          return (
            <div key={entry.id} className="leading-snug">
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`inline-flex h-5 shrink-0 items-center rounded-sm px-1.5 text-caption ${
                    isRep
                      ? 'bg-subtle text-fg-secondary'
                      : 'bg-brand-tint text-brand-text'
                  }`}
                >
                  {isRep ? 'You' : 'Prospect'}
                </span>
                <span className="shrink-0 text-caption tabular-nums text-fg-tertiary">
                  {entry.timestamp}
                </span>
              </div>
              <p
                className={`mt-0.5 pl-1 ${
                  isRep ? 'font-normal text-fg-secondary' : 'font-medium text-fg'
                }`}
              >
                {entry.text}
              </p>
            </div>
          );
        })}

        {interimText && (
          <div className="border-t border-line pt-1 leading-snug">
            <span className="mr-1.5 inline-flex h-5 items-center rounded-sm bg-warning-bg px-1.5 text-caption text-warning-fg">
              Live
            </span>
            <span className="italic text-fg-secondary animate-pulse-soft">
              &quot;{interimText}&quot;
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
