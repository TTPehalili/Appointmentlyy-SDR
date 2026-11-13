'use client';

import * as React from 'react';
import { AlertCircle, Mic, MicOff, RotateCcw, Send, Volume2 } from 'lucide-react';
import { Button, SegmentedControl } from '@/components/ui';
import { ElevenLabsAttribution } from '@/components/voice/ElevenLabsAttribution';
import { ELEVENLABS_MODELS, displayAudioTags, elevenLabsModelLabel, isRetryableVoiceError, voiceErrorMessage } from '@/lib/elevenlabs/voiceEngine';

/**
 * Simulated calls (demo workspace, and Practice in every workspace): when the call connects, an AI
 * prospect "answers" and talks like a real buyer. The rep speaks (browser speech recognition,
 * Chrome) or types; the AI replies in character through /api/sparring/chat (live_call mode, aware
 * of the current script step) and is voiced by ElevenLabs only. If ElevenLabs can't voice a line,
 * the line still shows as text with a "Voice unavailable, retry" notice: there is no browser or
 * other TTS fallback. Everything stops when the component unmounts (hang up / outcome).
 */

export interface Turn {
  role: 'rep' | 'prospect';
  content: string;
}

type Status = 'connecting' | 'prospect' | 'listening' | 'thinking' | 'paused';

const STAGE_NAMES = ['opener', 'problem', 'solution', 'close'];

/**
 * How long the rep must be silent before their turn is sent to the prospect. The rep picks it
 * (remembered on this computer) so natural pauses mid-sentence don't make the prospect jump in;
 * "Done talking" sends the turn straight away.
 */
const PAUSE_OPTIONS = { short: 1500, normal: 3000, long: 4500 } as const;
type PauseLength = keyof typeof PAUSE_OPTIONS;
const PAUSE_KEY = 'appy_ai_call_pause';

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

/** A line ElevenLabs couldn't voice, kept so the rep can retry it. */
interface VoiceIssue {
  text: string;
  code: string | null;
  message: string;
}

type TtsResult = { src: string } | { src: null; code: string | null; message: string };

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
  scriptContext,
  objection,
  difficulty,
  onTurnsChange,
}: {
  personaId: string;
  voiceId: string;
  /** Same ElevenLabs settings the persona's replies use, so the greeting sounds identical. */
  voiceSettings?: Record<string, unknown>;
  prospectName: string;
  /** 1-4: Opener, Problem, Solution, Close (the tab the rep has open). */
  scriptStep: number;
  /** The rep's script for the open step, so the prospect reacts to the actual lines. */
  scriptContext?: { goal: string; text: string; tip: string };
  /** Objection the rep chose before dialing: the prospect's main objection for this call. */
  objection?: { label: string; line: string } | null;
  /** Practice mode: how hard the buyer is to win (friendly | realistic | tough). Omitted on normal calls. */
  difficulty?: string;
  /** Practice mode: receives the transcript after every turn (for the end-of-call summary). */
  onTurnsChange?: (turns: Turn[]) => void;
}) {
  const firstName = prospectName.split(' ')[0] || 'there';
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [status, setStatus] = React.useState<Status>('connecting');
  const [interim, setInterim] = React.useState('');
  const [micOn, setMicOn] = React.useState(true);
  const [typed, setTyped] = React.useState('');
  const [voiceIssue, setVoiceIssue] = React.useState<VoiceIssue | null>(null);
  const [retryingVoice, setRetryingVoice] = React.useState(false);
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
  const scriptRef = React.useRef(scriptContext);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  // What the rep has said so far in this turn (survives the browser restarting recognition).
  const pendingSpeech = React.useRef('');
  // Lines typed while the customer was speaking; sent as soon as they finish.
  const queuedLines = React.useRef<string[]>([]);
  const silenceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pause, setPause] = React.useState<PauseLength>('normal');
  const pauseMsRef = React.useRef<number>(PAUSE_OPTIONS.normal);
  // Ends the rep's current spoken turn now ("Done talking"); set while listening.
  const finishRef = React.useRef<(() => void) | null>(null);
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(PAUSE_KEY);
      if (saved === 'short' || saved === 'normal' || saved === 'long') setPause(saved);
    } catch {}
  }, []);
  React.useEffect(() => {
    pauseMsRef.current = PAUSE_OPTIONS[pause];
  }, [pause]);
  const choosePause = (next: PauseLength) => {
    setPause(next);
    try {
      localStorage.setItem(PAUSE_KEY, next);
    } catch {}
  };

  React.useEffect(() => {
    stepRef.current = scriptStep;
    scriptRef.current = scriptContext;
  }, [scriptStep, scriptContext]);
  React.useEffect(() => {
    micOnRef.current = micOn;
  }, [micOn]);
  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns, interim]);

  const onTurnsRef = React.useRef(onTurnsChange);
  React.useEffect(() => {
    onTurnsRef.current = onTurnsChange;
  }, [onTurnsChange]);

  const pushTurn = React.useCallback((t: Turn) => {
    turnsRef.current = [...turnsRef.current, t];
    setTurns(turnsRef.current);
    onTurnsRef.current?.(turnsRef.current);
  }, []);

  const stopListening = React.useCallback(() => {
    clearTimeout(silenceTimer.current ?? undefined);
    silenceTimer.current = null;
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

  // ElevenLabs only. Returns the audio, or why ElevenLabs couldn't voice the line.
  const tts = React.useCallback(
    async (text: string): Promise<TtsResult> => {
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voiceId, voiceSettings, modelId: ELEVENLABS_MODELS.live }),
        });
        const data = await res.json().catch(() => ({}));
        const src = res.ok ? toAudioSrc(data.audio ?? data.audioUrl) : null;
        if (src) return { src };
        const code = typeof data.code === 'string' ? data.code : null;
        return { src: null, code, message: typeof data.error === 'string' && data.error ? data.error : voiceErrorMessage(code) };
      } catch {
        return { src: null, code: 'network', message: voiceErrorMessage('network') };
      }
    },
    [voiceId, voiceSettings],
  );

  /** Plays an ElevenLabs line, or flags it as "voice unavailable" (the text is already on screen). */
  const speak = React.useCallback(
    async (text: string, result: TtsResult) => {
      if (result.src !== null) {
        setVoiceIssue(null);
        await play(result.src);
      } else if (alive.current) {
        setVoiceIssue({ text, code: result.code, message: result.message });
      }
    },
    [play],
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
    // Keep listening through short pauses; the rep's turn ends only after ~2s of silence, so they
    // can finish full sentences (and the whole script line) before the prospect answers.
    rec.continuous = true;
    let liveText = '';
    let finished = false;
    const finish = () => {
      if (!alive.current || finished) return;
      finished = true;
      if (finishRef.current === finish) finishRef.current = null;
      clearTimeout(silenceTimer.current ?? undefined);
      silenceTimer.current = null;
      const said = `${pendingSpeech.current} ${liveText}`.replace(/\s+/g, ' ').trim();
      pendingSpeech.current = '';
      if (recRef.current === rec) recRef.current = null;
      rec.onend = null;
      rec.onresult = null;
      try {
        rec.stop();
      } catch {}
      if (said) respondRef.current(said);
      else setTimeout(() => alive.current && listenRef.current(), 250);
    };
    rec.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) pendingSpeech.current = `${pendingSpeech.current} ${r[0].transcript}`;
        else live += r[0].transcript;
      }
      liveText = live;
      setInterim(`${pendingSpeech.current} ${live}`.replace(/\s+/g, ' ').trim());
      clearTimeout(silenceTimer.current ?? undefined);
      silenceTimer.current = setTimeout(finish, pauseMsRef.current);
    };
    rec.onerror = () => {};
    rec.onend = () => {
      // The browser can end a session on its own (long silence, network): keep what was said and
      // carry on listening; the silence timer decides when the turn is over.
      if (!alive.current || recRef.current !== rec) return;
      recRef.current = null;
      if (silenceTimer.current) {
        // Chrome stopped mid-pause. Keep what was said and listen again at once, so words the rep
        // adds after the pause are still heard; the new session times the pause from here.
        pendingSpeech.current = `${pendingSpeech.current} ${liveText}`;
        liveText = '';
        finished = true;
        if (finishRef.current === finish) finishRef.current = null;
        clearTimeout(silenceTimer.current);
        silenceTimer.current = null;
        setTimeout(() => alive.current && listenRef.current(), 50);
        return;
      }
      setTimeout(() => alive.current && listenRef.current(), 250);
    };
    recRef.current = rec;
    setStatus('listening');
    try {
      rec.start();
      finishRef.current = finish;
      // Carrying on a turn after a restart: show it and keep timing the pause.
      if (pendingSpeech.current.trim()) {
        setInterim(pendingSpeech.current.replace(/\s+/g, ' ').trim());
        silenceTimer.current = setTimeout(finish, pauseMsRef.current);
      }
    } catch {
      // already started / mic busy: try again shortly
      setTimeout(() => alive.current && listenRef.current(), 600);
    }
  }, [speechSupported, stopListening]);

  const respond = React.useCallback(
    async (text: string) => {
      if (!alive.current || !text.trim()) return;
      // Typed while the customer is talking/thinking: queue it and send when they finish.
      if (busyRef.current) {
        queuedLines.current = [...queuedLines.current, text.trim()];
        return;
      }
      busyRef.current = true;
      stopListening();
      pendingSpeech.current = '';
      pushTurn({ role: 'rep', content: text.trim() });
      setStatus('thinking');
      let reply = '';
      let audio: string | null = null;
      let serverVoiceError: { code?: string; message?: string } | null = null;
      try {
        const res = await fetch('/api/sparring/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personaId,
            mode: 'live_call',
            scriptStage: STAGE_NAMES[Math.min(3, Math.max(0, stepRef.current - 1))],
            scriptStepGoal: scriptRef.current?.goal || '',
            scriptStepText: scriptRef.current?.text || '',
            scriptStepTip: scriptRef.current?.tip || '',
            objectionLabel: objection?.label || '',
            objectionLine: objection?.line || '',
            ...(difficulty ? { difficulty } : {}),
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
          serverVoiceError = data.voiceError && typeof data.voiceError === 'object' ? data.voiceError : null;
        }
      } catch {
        // fall through to a neutral reply
      }
      if (!alive.current) return;
      if (!reply) reply = 'Sorry, you cut out for a second there. Can you say that again?';
      pushTurn({ role: 'prospect', content: reply });
      setStatus('prospect');
      let voiced: TtsResult;
      if (audio) voiced = { src: audio };
      else if (serverVoiceError && !isRetryableVoiceError(serverVoiceError.code)) {
        // Missing key, rejected key or quota: asking again right away can't help.
        voiced = { src: null, code: serverVoiceError.code ?? null, message: serverVoiceError.message || voiceErrorMessage(serverVoiceError.code) };
      } else voiced = await tts(reply);
      await speak(reply, voiced);
      busyRef.current = false;
      if (!alive.current) return;
      const queued = queuedLines.current.join(' ');
      queuedLines.current = [];
      if (queued) respondRef.current(queued);
      else listen();
    },
    [personaId, objection, difficulty, pushTurn, stopListening, tts, speak, listen],
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
      const voiced = await tts(greeting);
      if (cancelled) return;
      pushTurn({ role: 'prospect', content: greeting });
      setStatus('prospect');
      await speak(greeting, voiced);
      busyRef.current = false;
      if (cancelled) return;
      const queued = queuedLines.current.join(' ');
      queuedLines.current = [];
      if (queued) respondRef.current(queued);
      else listen();
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

  /** "Retry voice": asks ElevenLabs again for the line that failed and plays it. */
  const retryVoice = async () => {
    const issue = voiceIssue;
    if (!issue || busyRef.current || retryingVoice) return;
    busyRef.current = true;
    setRetryingVoice(true);
    stopListening();
    setStatus('prospect');
    const voiced = await tts(issue.text);
    if (!alive.current) return;
    setRetryingVoice(false);
    await speak(issue.text, voiced);
    busyRef.current = false;
    if (!alive.current) return;
    const queued = queuedLines.current.join(' ');
    queuedLines.current = [];
    if (queued) respondRef.current(queued);
    else listen();
  };

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
          <ElevenLabsAttribution label="Voice:" detail={elevenLabsModelLabel(ELEVENLABS_MODELS.live)} className="hidden sm:inline-flex" />
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

      {voiceIssue && (
        <div role="status" className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning-400 bg-warning-bg px-2.5 py-1.5 text-small text-warning-fg">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            <span>
              <span className="font-medium">Voice unavailable.</span> {voiceIssue.message} {firstName}&apos;s line is shown as text.
            </span>
          </span>
          {isRetryableVoiceError(voiceIssue.code) && (
            <Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => void retryVoice()} loading={retryingVoice} disabled={retryingVoice}>
              Retry voice
            </Button>
          )}
        </div>
      )}

      <div ref={listRef} className="max-h-48 space-y-1.5 overflow-y-auto rounded-md bg-surface p-2.5 text-small">
        {turns.map((t, i) => (
          <p key={i} className={t.role === 'rep' ? 'text-fg' : 'text-fg-secondary'}>
            <span className="font-medium">{t.role === 'rep' ? 'You' : firstName}:</span> {t.role === 'rep' ? t.content : displayAudioTags(t.content)}
          </p>
        ))}
        {interim && (
          <p className="text-fg-tertiary italic">
            <span className="font-medium">You:</span> {interim}…
          </p>
        )}
      </div>

      {speechSupported && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-small text-fg-secondary" title="How long you can pause before the prospect answers. Short 1.5s, Normal 3s, Long 4.5s.">
            Wait after you stop
          <SegmentedControl
            label="Wait after you stop"
            size="sm"
            value={pause}
            onChange={(v) => choosePause(v as PauseLength)}
            items={[
              { value: 'short', label: 'Short' },
              { value: 'normal', label: 'Normal' },
              { value: 'long', label: 'Long' },
            ]}
          />
          </span>
          {interim && status === 'listening' && (
            <Button size="sm" variant="primary" icon={<Send className="size-4" />} onClick={() => finishRef.current?.()} data-testid="done-talking">
              Done talking
            </Button>
          )}
        </div>
      )}

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
