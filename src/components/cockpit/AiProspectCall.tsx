'use client';

import * as React from 'react';
import { Mic, MicOff, Send, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui';

/**
 * Demo workspace only: when a simulated call connects, an AI prospect "answers" and talks like a
 * real buyer. The rep speaks (browser speech recognition, Chrome) or types; the AI replies in
 * character through /api/sparring/chat (live_call mode, aware of the current script step) and is
 * voiced by ElevenLabs. Everything stops when the component unmounts (hang up / outcome).
 */

interface Turn {
  role: 'rep' | 'prospect';
  content: string;
}

type Status = 'connecting' | 'prospect' | 'listening' | 'thinking' | 'paused';

const STAGE_NAMES = ['opener', 'problem', 'solution', 'close'];

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function toAudioSrc(audio: unknown): string | null {
  if (typeof audio !== 'string' || !audio) return null;
  return audio.startsWith('data:') ? audio : `data:audio/mpeg;base64,${audio}`;
}

export function AiProspectCall({
  personaId,
  voiceId,
  voiceSettings,
  prospectName,
  scriptStep,
}: {
  personaId: string;
  voiceId: string;
  /** Same ElevenLabs settings the persona's replies use, so the greeting sounds identical. */
  voiceSettings?: Record<string, unknown>;
  prospectName: string;
  /** 1-4: Opener, Problem, Solution, Close (the tab the rep has open). */
  scriptStep: number;
}) {
  const firstName = prospectName.split(' ')[0] || 'there';
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [status, setStatus] = React.useState<Status>('connecting');
  const [interim, setInterim] = React.useState('');
  const [micOn, setMicOn] = React.useState(true);
  const [typed, setTyped] = React.useState('');
  const [speechSupported] = React.useState(
    () => typeof window !== 'undefined' && Boolean((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition),
  );

  const alive = React.useRef(true);
  const turnsRef = React.useRef<Turn[]>([]);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const recRef = React.useRef<Recognition | null>(null);
  const micOnRef = React.useRef(true);
  const busyRef = React.useRef(false);
  const stepRef = React.useRef(scriptStep);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    stepRef.current = scriptStep;
  }, [scriptStep]);
  React.useEffect(() => {
    micOnRef.current = micOn;
  }, [micOn]);
  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns, interim]);

  const pushTurn = React.useCallback((t: Turn) => {
    turnsRef.current = [...turnsRef.current, t];
    setTurns(turnsRef.current);
  }, []);

  const stopListening = React.useCallback(() => {
    const r = recRef.current;
    recRef.current = null;
    if (r) {
      r.onend = null;
      r.onresult = null;
      r.onerror = null;
      try {
        r.abort();
      } catch {}
    }
    setInterim('');
  }, []);

  const play = React.useCallback(async (src: string | null) => {
    if (!src || !alive.current) return;
    await new Promise<void>((resolve) => {
      const a = new Audio(src);
      audioRef.current = a;
      a.onended = () => resolve();
      a.onerror = () => resolve();
      a.play().catch(() => resolve());
    });
  }, []);

  const tts = React.useCallback(
    async (text: string): Promise<string | null> => {
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voiceId, voiceSettings, modelId: 'eleven_turbo_v2_5' }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return toAudioSrc(data.audio ?? data.audioUrl);
      } catch {
        return null;
      }
    },
    [voiceId, voiceSettings],
  );

  // Declared before use via a ref so listen() and respond() can call each other.
  const respondRef = React.useRef<(text: string) => void>(() => {});
  const listenRef = React.useRef<() => void>(() => {});

  const listen = React.useCallback(() => {
    if (!alive.current || !speechSupported || !micOnRef.current || busyRef.current) {
      if (alive.current && !busyRef.current) setStatus(micOnRef.current ? 'listening' : 'paused');
      return;
    }
    stopListening();
    const W = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else live += r[0].transcript;
      }
      setInterim(live || finalText);
    };
    rec.onerror = () => {};
    rec.onend = () => {
      if (!alive.current || recRef.current !== rec) return;
      recRef.current = null;
      const said = finalText.trim();
      if (said) respondRef.current(said);
      else setTimeout(() => alive.current && listenRef.current(), 250); // silence: keep listening
    };
    recRef.current = rec;
    setStatus('listening');
    try {
      rec.start();
    } catch {
      // already started / mic busy: try again shortly
      setTimeout(() => alive.current && listenRef.current(), 600);
    }
  }, [speechSupported, stopListening]);

  const respond = React.useCallback(
    async (text: string) => {
      if (!alive.current || busyRef.current || !text.trim()) return;
      busyRef.current = true;
      stopListening();
      pushTurn({ role: 'rep', content: text.trim() });
      setStatus('thinking');
      let reply = '';
      let audio: string | null = null;
      try {
        const res = await fetch('/api/sparring/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personaId,
            mode: 'live_call',
            scriptStage: STAGE_NAMES[Math.min(3, Math.max(0, stepRef.current - 1))],
            transcript: turnsRef.current.map((t) => ({ role: t.role, content: t.content })),
            repMessage: text.trim(),
            objectives: [],
            country: 'USA',
          }),
        });
        if (res.ok) {
          const data = await res.json();
          reply = String(data.reply || '').replace(/^["“]|["”]$/g, '');
          audio = toAudioSrc(data.audioUrl);
        }
      } catch {
        // fall through to a neutral reply
      }
      if (!alive.current) return;
      if (!reply) reply = 'Sorry, you cut out for a second there. Can you say that again?';
      pushTurn({ role: 'prospect', content: reply });
      setStatus('prospect');
      if (!audio) audio = await tts(reply);
      await play(audio);
      busyRef.current = false;
      if (alive.current) listen();
    },
    [personaId, pushTurn, stopListening, tts, play, listen],
  );

  React.useEffect(() => {
    respondRef.current = (t: string) => void respond(t);
    listenRef.current = listen;
  }, [respond, listen]);

  // Pick up: short greeting in the prospect's voice, then listen.
  React.useEffect(() => {
    alive.current = true;
    let cancelled = false;
    (async () => {
      busyRef.current = true;
      const greeting = 'Hello?';
      const src = await tts(greeting);
      if (cancelled) return;
      pushTurn({ role: 'prospect', content: greeting });
      setStatus('prospect');
      await play(src);
      busyRef.current = false;
      if (!cancelled) listen();
    })();
    return () => {
      cancelled = true;
      alive.current = false;
      stopListening();
      const a = audioRef.current;
      if (a) {
        a.onended = null;
        try {
          a.pause();
          a.removeAttribute('src');
          a.load();
        } catch {}
      }
    };
    // Runs once per connected call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    micOnRef.current = next;
    if (!next) {
      stopListening();
      if (!busyRef.current) setStatus('paused');
    } else if (!busyRef.current) {
      listen();
    }
  };

  const sendTyped = (e: React.FormEvent) => {
    e.preventDefault();
    const t = typed.trim();
    if (!t) return;
    setTyped('');
    void respond(t);
  };

  const statusText: Record<Status, string> = {
    connecting: 'Connecting…',
    prospect: `${firstName} is speaking…`,
    listening: speechSupported ? 'Listening… speak now' : 'Type your line below',
    thinking: `${firstName} is thinking…`,
    paused: 'Mic paused',
  };

  return (
    <div className="rounded-lg border border-success-500/40 bg-success-bg/30 p-3" aria-label={`Live call with ${prospectName}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-small font-medium text-fg">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-success-500 opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2.5 rounded-full bg-success-500" />
          </span>
          Live call with {prospectName}
          <span className="text-fg-tertiary">· step {Math.min(4, Math.max(1, scriptStep))}: {STAGE_NAMES[Math.min(3, Math.max(0, scriptStep - 1))]}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-small text-fg-secondary" aria-live="polite">
            {status === 'prospect' ? <Volume2 className="size-4 text-success-fg" aria-hidden /> : null}
            {statusText[status]}
          </span>
          {speechSupported && (
            <Button
              size="sm"
              variant={micOn ? 'secondary' : 'primary'}
              icon={micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
              onClick={toggleMic}
            >
              {micOn ? 'Mute' : 'Unmute'}
            </Button>
          )}
        </div>
      </div>

      <div ref={listRef} className="max-h-48 space-y-1.5 overflow-y-auto rounded-md bg-surface p-2.5 text-small">
        {turns.map((t, i) => (
          <p key={i} className={t.role === 'rep' ? 'text-fg' : 'text-fg-secondary'}>
            <span className="font-medium">{t.role === 'rep' ? 'You' : firstName}:</span> {t.content}
          </p>
        ))}
        {interim && (
          <p className="text-fg-tertiary italic">
            <span className="font-medium">You:</span> {interim}…
          </p>
        )}
      </div>

      <form onSubmit={sendTyped} className="mt-2 flex items-center gap-2">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={speechSupported ? 'Or type your line and press Enter' : 'Type your line and press Enter'}
          aria-label="Type what you say to the prospect"
          className="focus-ring h-9 min-w-0 flex-1 rounded-sm border border-line-strong bg-surface px-3 text-body text-fg placeholder:text-fg-disabled"
        />
        <Button type="submit" size="sm" variant="secondary" icon={<Send className="size-4" />} disabled={!typed.trim()}>
          Say
        </Button>
      </form>
    </div>
  );
}
