'use client';

import React, { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  PhoneOff, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX,
  Check,
  Clock,
  Sparkles,
  Send,
  ArrowLeft,
  CheckCircle2,
  Play,
  AlertCircle,
  Headphones,
  PhoneCall,
  Copy,
  CornerDownLeft,
  Info,
  Lightbulb,
  RotateCcw
} from 'lucide-react';
import { Badge, Button, Select, StatusDot, Tooltip, buttonClasses } from '@/components/ui';
import { SPARRING_PERSONAS, ScriptAssist, SparringCountry, getPersonaVoiceByCountry } from '@/lib/personas';
import { RepAccentKey, getRepVoice, RepVoiceProfile } from '@/lib/repVoices';
import { DialogueTurn } from '@/lib/qaEvaluator';
import { ElevenLabsAttribution } from '@/components/voice/ElevenLabsAttribution';
import { ELEVENLABS_MODELS, elevenLabsModelLabel, isRetryableVoiceError, voiceErrorMessage } from '@/lib/elevenlabs/voiceEngine';

/** A buyer line ElevenLabs couldn't voice: shown as text with "Voice unavailable, retry". */
interface VoiceIssue {
  text: string;
  voiceId: string;
  code: string | null;
  message: string;
}
type ServerVoiceError = { code?: string; message?: string } | null | undefined;

// 1-frame silent WAV to unlock browser audio without triggering empty-src error
const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

// Browser speech recognition types
interface SpeechRecognitionResultItem {
  transcript: string;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: {
    length: number;
    isFinal?: boolean;
    [index: number]: SpeechRecognitionResultItem;
  };
}
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

function SparringRoomContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const personaId = (params?.personaId as string) || '';
  const router = useRouter();
  const persona = SPARRING_PERSONAS.find(p => p.id === personaId) || SPARRING_PERSONAS[0];

  // Country Voice model accent selection (USA, Australia, UK)
  const [selectedCountry, setSelectedCountry] = useState<SparringCountry>('USA');
  // Rep Voice Accent (Arabic vs Filipino)
  const [selectedRepAccent, setSelectedRepAccent] = useState<RepAccentKey>('arabic');
  const [selectedRepGender, setSelectedRepGender] = useState<'male' | 'female'>('male');

  useEffect(() => {
    const countryQuery = searchParams.get('country') as SparringCountry | null;
    if (countryQuery === 'USA' || countryQuery === 'Australia' || countryQuery === 'UK') {
      setSelectedCountry(countryQuery);
      localStorage.setItem('sparring_country', countryQuery);
    } else {
      const saved = localStorage.getItem('sparring_country') as SparringCountry | null;
      if (saved === 'USA' || saved === 'Australia' || saved === 'UK') {
        setSelectedCountry(saved);
      }
    }

    const repQuery = searchParams.get('repAccent') as RepAccentKey | null;
    if (repQuery === 'arabic' || repQuery === 'filipino') {
      setSelectedRepAccent(repQuery);
      localStorage.setItem('sparring_rep_accent', repQuery);
    } else {
      const savedRep = localStorage.getItem('sparring_rep_accent') as RepAccentKey | null;
      if (savedRep === 'arabic' || savedRep === 'filipino') {
        setSelectedRepAccent(savedRep);
      }
    }
  }, [searchParams]);

  const handleCountryChange = async (country: SparringCountry) => {
    setSelectedCountry(country);
    localStorage.setItem('sparring_country', country);
    try {
      router.replace(`/practice/${persona.id}?country=${country}&repAccent=${selectedRepAccent}`, { scroll: false });
    } catch {}

    // If call is active, immediately re-synthesize in new accent so user hears instant voice change!
    if (callActive && transcript.length > 0) {
      const newVoiceConfig = getPersonaVoiceByCountry(persona, country);
      const lastProspectTurn = [...transcript].reverse().find(t => t.role === 'prospect');
      if (lastProspectTurn && lastProspectTurn.content) {
        setIsAiResponding(true);
        const newAudio = await synthesizeVoiceIfNeeded(lastProspectTurn.content, newVoiceConfig.voiceId);
        setIsAiResponding(false);
        if (newAudio) {
          lastProspectTurn.audioUrl = newAudio;
          playVoiceAudio(newAudio, lastProspectTurn.content);
        }
      }
    }
  };

  const handleRepAccentChange = (accent: RepAccentKey) => {
    setSelectedRepAccent(accent);
    localStorage.setItem('sparring_rep_accent', accent);
    try {
      router.replace(`/practice/${persona.id}?country=${selectedCountry}&repAccent=${accent}`, { scroll: false });
    } catch {}
  };

  const [callActive, setCallActive] = useState(false);
  const [callConnecting, setCallConnecting] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [repInput, setRepInput] = useState('');
  const [isAiResponding, setIsAiResponding] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isListeningMic, setIsListeningMic] = useState(false);
  const [activeAudioTurn, setActiveAudioTurn] = useState<number | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [liveTranscriptPreview, setLiveTranscriptPreview] = useState('');
  const [voiceIssue, setVoiceIssue] = useState<VoiceIssue | null>(null);
  const [retryingVoice, setRetryingVoice] = useState(false);

  const [transcript, setTranscript] = useState<(DialogueTurn & { audioUrl?: string })[]>([]);
  const [objectives, setObjectives] = useState(
    persona.objectives.map((o: any) => ({ ...o, completed: false }))
  );
  const [scriptAssist, setScriptAssist] = useState<ScriptAssist>(persona.initialScriptAssist);
  const [copiedScript, setCopiedScript] = useState(false);
  const [isFinishingCall, setIsFinishingCall] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const speechStreamRef = useRef<MediaStream | null>(null);
  const lastAudioUrlRef = useRef<string | null>(null);
  const lastTextRef = useRef<string>('');

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recognizedTextRef = useRef('');
  const isCallActiveRef = useRef(false);
  const isAiRespondingRef = useRef(false);
  const isPlayingAudioRef = useRef(false);

  // Sync refs for async closures
  useEffect(() => {
    isCallActiveRef.current = callActive;
  }, [callActive]);

  useEffect(() => {
    isAiRespondingRef.current = isAiResponding;
  }, [isAiResponding]);

  useEffect(() => {
    isPlayingAudioRef.current = isPlayingAudio;
  }, [isPlayingAudio]);

  // Global interaction listener: seamlessly resume AudioContext on ANY click/tap/keypress in browser
  useEffect(() => {
    const handleGlobalInteraction = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
      setAudioBlocked(false);
    };

    window.addEventListener('click', handleGlobalInteraction);
    window.addEventListener('keydown', handleGlobalInteraction);
    window.addEventListener('touchstart', handleGlobalInteraction);

    return () => {
      window.removeEventListener('click', handleGlobalInteraction);
      window.removeEventListener('keydown', handleGlobalInteraction);
      window.removeEventListener('touchstart', handleGlobalInteraction);
    };
  }, []);

  // Call duration counter
  useEffect(() => {
    if (callActive) {
      timerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callActive]);

  // Auto-scroll conversation
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, isAiResponding, liveTranscriptPreview]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Convert base64 to Blob URL for instant native hardware decoding
  const getBlobUrlFromBase64 = (base64Audio: string): string => {
    try {
      const cleaned = base64Audio.replace(/^data:audio\/[^;]+;base64,/, '');
      const binaryString = window.atob(cleaned);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes.buffer], { type: 'audio/mpeg' });
      return URL.createObjectURL(blob);
    } catch {
      return base64Audio;
    }
  };

  // Stop microphone listening
  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListeningMic(false);
    setLiveTranscriptPreview('');
  }, []);

  // Forward ref for handleSendMessage
  const handleSendMessageRef = useRef<(textToSend?: string) => Promise<void>>(async () => {});

  // Hands-free voice recognition starter
  const startHandsFreeListening = useCallback(() => {
    if (!isCallActiveRef.current || isAiRespondingRef.current || isPlayingAudioRef.current) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    stopListening();

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListeningMic(true);
        setMicPermissionDenied(false);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let final = '';
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript + ' ';
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        const currentSpeech = (final + interim).trim();
        if (currentSpeech) {
          recognizedTextRef.current = currentSpeech;
          setLiveTranscriptPreview(currentSpeech);
          setRepInput(currentSpeech);

          // Intelligent silence detection:
          // Wait 1.3s of silence after speech, then auto-send!
          const words = currentSpeech.toLowerCase().split(/\s+/);
          const lastWord = words[words.length - 1];
          const midFillers = ['and', 'so', 'but', 'because', 'uh', 'um', 'or', 'if', 'like', 'with', 'to', 'that', 'we', 'our'];
          const silenceDelay = midFillers.includes(lastWord) ? 2200 : 1300;

          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            const textToSend = recognizedTextRef.current.trim();
            if (textToSend && isCallActiveRef.current && !isAiRespondingRef.current) {
              recognizedTextRef.current = '';
              setLiveTranscriptPreview('');
              stopListening();
              handleSendMessageRef.current(textToSend);
            }
          }, silenceDelay);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          setMicPermissionDenied(true);
          stopListening();
        } else if (event.error === 'no-speech' || event.error === 'network') {
          if (isCallActiveRef.current && !isAiRespondingRef.current && !isPlayingAudioRef.current) {
            setTimeout(() => {
              try { recognition.start(); } catch {}
            }, 200);
          }
        }
      };

      recognition.onend = () => {
        if (isCallActiveRef.current && !isAiRespondingRef.current && !isPlayingAudioRef.current) {
          setTimeout(() => {
            try { recognition.start(); } catch {}
          }, 150);
        } else {
          setIsListeningMic(false);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.warn('SpeechRecognition start notice:', e);
      setIsListeningMic(false);
    }
  }, [stopListening]);

  // Guaranteed AudioContext getter / initializer
  const getOrCreateAudioContext = useCallback(async (): Promise<AudioContext | null> => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      return audioContextRef.current;
    } catch (err) {
      console.warn('AudioContext init note:', err);
      return null;
    }
  }, []);

  // Voices a line with ElevenLabs (/api/tts) when the server didn't already. ElevenLabs is the only
  // voice: on failure the line stays as text and the call shows "Voice unavailable, retry".
  const synthesizeVoiceIfNeeded = useCallback(async (text: string, personaVoiceId: string): Promise<string | null> => {
    let code: string | null = 'network';
    let message = voiceErrorMessage('network');
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceId: personaVoiceId,
          voiceSettings: persona.voiceSettings,
          modelId: ELEVENLABS_MODELS.realtime
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.audio) {
        setVoiceIssue(null);
        return data.audio;
      }
      code = typeof data.code === 'string' ? data.code : null;
      message = typeof data.error === 'string' && data.error ? data.error : voiceErrorMessage(code);
    } catch (e) {
      console.warn('ElevenLabs TTS request failed:', e);
    }
    setVoiceIssue({ text, voiceId: personaVoiceId, code, message });
    return null;
  }, [persona.voiceSettings]);

  /** Audio for a buyer line: the server's ElevenLabs audio, else one /api/tts attempt (unless retrying can't help). */
  const resolveVoice = async (text: string, personaVoiceId: string, serverAudio?: string | null, serverError?: ServerVoiceError): Promise<string | null> => {
    if (serverAudio) {
      setVoiceIssue(null);
      return serverAudio;
    }
    if (serverError && !isRetryableVoiceError(serverError.code)) {
      setVoiceIssue({ text, voiceId: personaVoiceId, code: serverError.code ?? null, message: serverError.message || voiceErrorMessage(serverError.code) });
      return null;
    }
    return synthesizeVoiceIfNeeded(text, personaVoiceId);
  };

  // Rock-solid audio playback engine using native audio Blobs (NO robotic fallback)
  const playVoiceAudio = useCallback(async (audioUrl: string, textFallback: string, turnIndex?: number): Promise<void> => {
    if (isMuted) return;

    // Immediately stop mic while AI speaks to prevent audio loopback echo
    stopListening();

    lastAudioUrlRef.current = audioUrl;
    lastTextRef.current = textFallback;
    setIsPlayingAudio(true);
    if (turnIndex !== undefined) setActiveAudioTurn(turnIndex);

    try {
      let playableUrl = audioUrl;
      if (audioUrl.startsWith('data:audio/')) {
        const cleaned = audioUrl.replace(/^data:audio\/[^;]+;base64,/, '');
        const binaryString = window.atob(cleaned);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const audioBlob = new Blob([bytes.buffer], { type: 'audio/mpeg' });
        playableUrl = URL.createObjectURL(audioBlob);
      }

      // Release any previous audio element before playing
      if (audioElementRef.current) {
        try {
          audioElementRef.current.pause();
          audioElementRef.current.currentTime = 0;
          audioElementRef.current.src = '';
        } catch {}
      }

      const audio = new Audio(playableUrl);
      audioElementRef.current = audio;
      audio.volume = 1.0;

      return new Promise<void>((resolve) => {
        audio.onended = () => {
          setIsPlayingAudio(false);
          setActiveAudioTurn(null);
          setAudioBlocked(false);
          resolve();
          if (isCallActiveRef.current && !isAiRespondingRef.current) {
            startHandsFreeListening();
          }
        };

        audio.onerror = (err) => {
          console.warn('Audio playback element error:', err);
          setIsPlayingAudio(false);
          setActiveAudioTurn(null);
          resolve();
          if (isCallActiveRef.current && !isAiRespondingRef.current) {
            startHandsFreeListening();
          }
        };

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setAudioBlocked(false);
            })
            .catch((playErr) => {
              console.warn('Audio autoplay notice:', playErr);
              setAudioBlocked(true);
              setIsPlayingAudio(false);
              resolve();
            });
        }
      });
    } catch (err) {
      console.warn('playVoiceAudio caught error:', err);
      setIsPlayingAudio(false);
      setActiveAudioTurn(null);
    }
  }, [isMuted, stopListening, startHandsFreeListening]);

  // Unblock / prime audio context synchronously
  const primeAudioContext = async () => {
    try {
      if (!audioElementRef.current) {
        audioElementRef.current = new Audio(SILENT_WAV);
      } else {
        audioElementRef.current.src = SILENT_WAV;
      }
      await audioElementRef.current.play().catch(() => {});
      setAudioBlocked(false);
      if (lastAudioUrlRef.current && isPlayingAudioRef.current) {
        playVoiceAudio(lastAudioUrlRef.current, lastTextRef.current);
      }
    } catch {}
  };

  // "Retry voice": ask ElevenLabs again for the line that failed, attach it to that turn and play it.
  const retryVoice = async () => {
    const issue = voiceIssue;
    if (!issue || retryingVoice) return;
    setRetryingVoice(true);
    const audio = await synthesizeVoiceIfNeeded(issue.text, issue.voiceId);
    setRetryingVoice(false);
    if (!audio) return;
    const idx = transcript.map(t => t.role === 'prospect' && t.content === issue.text).lastIndexOf(true);
    if (idx >= 0) {
      setTranscript(prev => prev.map((t, i) => (i === idx && t.content === issue.text ? { ...t, audioUrl: audio } : t)));
    }
    await playVoiceAudio(audio, issue.text, idx >= 0 ? idx : undefined);
  };

  // Start Call & Dial in
  const startCall = async () => {
    // 1. Prime DOM audio synchronously on direct user click gesture!
    if (!audioElementRef.current) {
      audioElementRef.current = new Audio(SILENT_WAV);
    } else {
      audioElementRef.current.src = SILENT_WAV;
    }
    audioElementRef.current.play().catch(() => {});

    // 2. Pre-arm microphone stream non-blocking in background so dial isn't delayed!
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      }).then(stream => {
        speechStreamRef.current = stream;
        setMicPermissionDenied(false);
      }).catch(micErr => {
        console.warn('Microphone pre-arm notice:', micErr);
      });
    }

    const voiceConfig = getPersonaVoiceByCountry(persona, selectedCountry);
    setVoiceIssue(null);
    setCallConnecting(true);
    setCallActive(true);
    setCallDuration(0);
    setIsAiResponding(true);

    try {
      const res = await fetch('/api/sparring/dial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId: persona.id, country: selectedCountry })
      });

      if (res.ok) {
        const data = await res.json();
        setCallConnecting(false);

        if (data.scriptAssist) {
          setScriptAssist(data.scriptAssist);
        }

        if (data.greetingText) {
          setTranscript([
            {
              role: 'prospect',
              content: data.greetingText,
              timestamp: '00:01',
              audioUrl: data.audioUrl
            }
          ]);

          const audioToPlay = await resolveVoice(data.greetingText, voiceConfig.voiceId, data.audioUrl, data.voiceError);

          if (audioToPlay) {
            await playVoiceAudio(audioToPlay, data.greetingText, 0);
          } else {
            startHandsFreeListening();
          }
        }
      } else {
        setCallConnecting(false);
        const fallbackGreeting = `${persona.name} here. ${persona.coreObjection}`;
        setTranscript([
          {
            role: 'prospect',
            content: fallbackGreeting,
            timestamp: '00:01'
          }
        ]);
        const fallbackAudio = await synthesizeVoiceIfNeeded(fallbackGreeting, voiceConfig.voiceId);
        if (fallbackAudio) {
          await playVoiceAudio(fallbackAudio, fallbackGreeting, 0);
        } else {
          startHandsFreeListening();
        }
      }
    } catch (err) {
      console.warn('Dial request note:', err);
      setCallConnecting(false);
      const fallbackGreeting = `${persona.name} here. ${persona.coreObjection}`;
      setTranscript([
        {
          role: 'prospect',
          content: fallbackGreeting,
          timestamp: '00:01'
        }
      ]);
      const fallbackAudio = await synthesizeVoiceIfNeeded(fallbackGreeting, voiceConfig.voiceId);
      if (fallbackAudio) {
        await playVoiceAudio(fallbackAudio, fallbackGreeting, 0);
      } else {
        startHandsFreeListening();
      }
    } finally {
      setIsAiResponding(false);
    }
  };

  // Copy script to clipboard helper
  const handleCopyScript = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    }
  };

  // Dispatch turn message (hands-free or typed)
  const handleSendMessage = async (textOverride?: string) => {
    const message = (textOverride || repInput).trim();
    if (!message || isAiResponding) return;

    const voiceConfig = getPersonaVoiceByCountry(persona, selectedCountry);

    // Immediately stop mic listening while AI processes
    stopListening();
    setRepInput('');
    setLiveTranscriptPreview('');
    setIsAiResponding(true);

    const currentTimestamp = formatTime(callDuration);
    const updatedTurns = [
      ...transcript,
      { role: 'rep' as const, content: message, timestamp: currentTimestamp }
    ];

    setTranscript(updatedTurns);

    try {
      const res = await fetch('/api/sparring/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId: persona.id,
          transcript: updatedTurns,
          repMessage: message,
          objectives,
          country: selectedCountry
        })
      });

      if (res.ok) {
        const data = await res.json();
        const aiReply = data.reply || "I hear your point, but explain to me how this delivers measurable value.";
        const audioUrl = data.audioUrl;
        const newTimestamp = formatTime(callDuration + 2);

        if (data.scriptAssist) {
          setScriptAssist(data.scriptAssist);
        }

        // Update objectives checklist
        if (Array.isArray(data.completedObjectiveIds) && data.completedObjectiveIds.length > 0) {
          setObjectives((prev: any) => prev.map((obj: any) => ({
            ...obj,
            completed: obj.completed || data.completedObjectiveIds.includes(obj.id)
          })));
        }

        const newTurnIndex = updatedTurns.length;
        setTranscript(prev => [
          ...prev,
          {
            role: 'prospect',
            content: aiReply,
            timestamp: newTimestamp,
            audioUrl
          }
        ]);

        const audioToPlay = await resolveVoice(aiReply, voiceConfig.voiceId, audioUrl, data.voiceError);

        if (audioToPlay) {
          await playVoiceAudio(audioToPlay, aiReply, newTurnIndex);
        } else {
          startHandsFreeListening();
        }
      } else {
        const fallbackReply = "That's an interesting approach, but what kind of turnaround time and hold rate can you commit to?";
        setTranscript(prev => [
          ...prev,
          {
            role: 'prospect',
            content: fallbackReply,
            timestamp: formatTime(callDuration + 2)
          }
        ]);
        const fallbackAudio = await synthesizeVoiceIfNeeded(fallbackReply, voiceConfig.voiceId);
        if (fallbackAudio) {
          await playVoiceAudio(fallbackAudio, fallbackReply);
        } else {
          startHandsFreeListening();
        }
      }
    } catch (err) {
      console.error('Turn dispatch error:', err);
      startHandsFreeListening();
    } finally {
      setIsAiResponding(false);
    }
  };

  // Keep ref up to date
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  });

  // End Call and Trigger Automated Scoring
  const endCallAndGrade = async () => {
    setIsFinishingCall(true);
    setCallActive(false);
    setVoiceIssue(null);
    stopListening();
    if (audioSourceNodeRef.current) {
      try {
        audioSourceNodeRef.current.stop();
        audioSourceNodeRef.current.disconnect();
      } catch {}
      audioSourceNodeRef.current = null;
    }
    if (audioElementRef.current) {
      try {
        audioElementRef.current.pause();
        audioElementRef.current.src = '';
      } catch {}
    }
    if (speechStreamRef.current) {
      try {
        speechStreamRef.current.getTracks().forEach(t => t.stop());
      } catch {}
      speechStreamRef.current = null;
    }

    try {
      const sessionId = `session-${Date.now()}`;
      const payload = {
        sessionId,
        scenario: `${persona.name} (${persona.title}) - ${persona.companyType}`,
        transcript: transcript.map(t => ({
          role: t.role,
          content: t.content,
          timestamp: t.timestamp
        }))
      };

      const res = await fetch('/api/webhooks/elevenlabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      const targetId = data.sessionId || sessionId;

      if (data.evaluation) {
        sessionStorage.setItem(`eval-${targetId}`, JSON.stringify(data.evaluation));
      }

      router.push(`/practice/scorecard/${targetId}`);
    } catch (err) {
      console.error('Error ending call:', err);
      router.push(`/practice/scorecard/fallback-session`);
    }
  };

  const completedObjectivesCount = objectives.filter((o: any) => o.completed).length;

  return (
    <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-app font-sans antialiased text-fg">

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Subheader breadcrumb and voice settings */}
        <div className="border-b border-line bg-surface px-4 md:px-8 py-3 flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/practice"
              aria-label="Back to Sparring Arena"
              title="Back to Sparring Arena"
              className={buttonClasses('ghost', 'md', 'size-9 px-0')}
            >
              <ArrowLeft aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="text-h3 text-fg truncate">{persona.name}</h1>
              <p className="text-small text-fg-secondary truncate">{persona.title}, {persona.companyType}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Rep voice accent toggle (Arabic vs Filipino) */}
            <div role="group" aria-label="Your voice accent" className="inline-flex items-center rounded-md border border-line bg-subtle p-0.5">
              <span className="px-2 text-small text-fg-secondary">Your voice</span>
              <button
                type="button"
                onClick={() => handleRepAccentChange('arabic')}
                aria-pressed={selectedRepAccent === 'arabic'}
                className={`focus-ring inline-flex h-7 items-center rounded-[6px] px-2.5 text-small font-medium transition-colors duration-150 ${
                  selectedRepAccent === 'arabic'
                    ? 'bg-selected text-selected-fg shadow-xs'
                    : 'text-fg-secondary hover:bg-surface hover:text-fg'
                }`}
                title="Rep Voice: Arabic Accent (Dubai / Middle East Hub)"
              >
                Arabic
              </button>
              <button
                type="button"
                onClick={() => handleRepAccentChange('filipino')}
                aria-pressed={selectedRepAccent === 'filipino'}
                className={`focus-ring inline-flex h-7 items-center rounded-[6px] px-2.5 text-small font-medium transition-colors duration-150 ${
                  selectedRepAccent === 'filipino'
                    ? 'bg-selected text-selected-fg shadow-xs'
                    : 'text-fg-secondary hover:bg-surface hover:text-fg'
                }`}
                title="Rep Voice: Filipino Accent (Manila BPO Floor)"
              >
                Filipino
              </button>
            </div>

            {/* Rep gender toggle (male vs female) */}
            <div role="group" aria-label="Your voice" className="inline-flex items-center rounded-md border border-line bg-subtle p-0.5">
              <button
                type="button"
                onClick={() => setSelectedRepGender('male')}
                aria-pressed={selectedRepGender === 'male'}
                className={`focus-ring inline-flex h-7 items-center rounded-[6px] px-2.5 text-small font-medium transition-colors duration-150 ${
                  selectedRepGender === 'male'
                    ? 'bg-selected text-selected-fg shadow-xs'
                    : 'text-fg-secondary hover:bg-surface hover:text-fg'
                }`}
                title={selectedRepAccent === 'arabic' ? 'Tariq (Male)' : 'Paolo (Male)'}
              >
                {selectedRepAccent === 'arabic' ? 'Tariq (M)' : 'Paolo (M)'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedRepGender('female')}
                aria-pressed={selectedRepGender === 'female'}
                className={`focus-ring inline-flex h-7 items-center rounded-[6px] px-2.5 text-small font-medium transition-colors duration-150 ${
                  selectedRepGender === 'female'
                    ? 'bg-selected text-selected-fg shadow-xs'
                    : 'text-fg-secondary hover:bg-surface hover:text-fg'
                }`}
                title={selectedRepAccent === 'arabic' ? 'Noor (Female)' : 'Lovely (Female)'}
              >
                {selectedRepAccent === 'arabic' ? 'Noor (F)' : 'Lovely (F)'}
              </button>
            </div>

            {/* Buyer voice accent switcher */}
            <div className="w-40">
              <Select
                value={selectedCountry}
                onChange={(e) => handleCountryChange(e.target.value as SparringCountry)}
                className="h-8 text-small"
                title="Customer / Buyer Voice Accent Switcher"
                aria-label="Buyer accent"
              >
                <option value="USA">USA buyer</option>
                <option value="Australia">Australia buyer</option>
                <option value="UK">UK buyer</option>
              </Select>
            </div>

            <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-small tabular-nums text-fg">
              <Clock className="size-4 text-fg-tertiary" aria-hidden />
              <span>{formatTime(callDuration)}</span>
            </span>
            <span className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-small text-fg">
              <span
                aria-hidden
                className={`size-2 shrink-0 rounded-full ${
                  callActive
                    ? isPlayingAudio
                      ? 'bg-brand-500 animate-pulse-soft'
                      : isListeningMic
                      ? 'bg-success-500 animate-pulse-soft'
                      : 'bg-warning-400'
                    : 'bg-fg-disabled'
                }`}
              />
              {callConnecting
                ? 'Dialing...'
                : callActive
                ? isPlayingAudio
                  ? `${persona.name} speaking`
                  : isListeningMic
                  ? 'Your turn, mic live'
                  : 'Thinking...'
                : 'Ready to dial'}
            </span>
          </div>
        </div>

        {/* Main room body */}
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 grid grid-cols-1 lg:grid-cols-12 gap-6 content-start">

          {/* Left column: dark focus surface with the call and the conversation */}
          <div className="lg:col-span-8 lg:self-start flex flex-col rounded-xl bg-ink-950 text-ink-50 overflow-hidden">

            {/* Call centerpiece */}
            <div className="p-6 flex flex-col items-center justify-center text-center relative">
              {/* Permanent Blessed Audio Player */}
              <audio ref={audioElementRef} id="sparring-audio-player" preload="auto" playsInline className="hidden" />

              <div className="flex items-center gap-3 absolute top-4 right-4">
                <span className="hidden sm:inline-flex items-center gap-1.5 text-caption text-ink-400">
                  <Headphones className="size-3.5" aria-hidden />
                  <span>Hands-free voice</span>
                </span>
                <ElevenLabsAttribution label="Voice by" onDark />
              </div>

              {/* Autoplay block prompt if browser blocked audio */}
              {audioBlocked && (
                <div
                  onClick={primeAudioContext}
                  className="mb-4 px-3 py-2 rounded-md bg-warning-bg text-warning-fg text-small flex items-center gap-2 cursor-pointer"
                >
                  <Volume2 className="size-4" aria-hidden />
                  <span className="font-medium">Tap here to turn on audio in your browser</span>
                </div>
              )}

              {/* Mic permission prompt */}
              {micPermissionDenied && (
                <div className="mb-4 px-3 py-2 rounded-md bg-danger-bg text-danger-fg text-small flex items-center gap-2">
                  <AlertCircle className="size-4" aria-hidden />
                  <span>Microphone blocked in browser. Click the lock icon in your URL bar to allow mic.</span>
                </div>
              )}

              {/* ElevenLabs couldn't voice the last buyer line: say so, keep the text, offer a retry */}
              {voiceIssue && callActive && (
                <div role="status" className="mb-4 px-3 py-2 rounded-md bg-warning-bg text-warning-fg text-small flex flex-wrap items-center justify-center gap-2 max-w-lg">
                  <AlertCircle className="size-4 shrink-0" aria-hidden />
                  <span>
                    <span className="font-medium">Voice unavailable.</span> {voiceIssue.message} The reply is shown as text below.
                  </span>
                  {isRetryableVoiceError(voiceIssue.code) && (
                    <Button size="sm" variant="secondary" onClick={() => void retryVoice()} loading={retryingVoice} disabled={retryingVoice} icon={<RotateCcw aria-hidden />}>
                      Retry voice
                    </Button>
                  )}
                </div>
              )}

              <div className="size-16 rounded-full bg-ink-800 text-ink-50 font-semibold text-h2 flex items-center justify-center mb-3">
                {persona.name.split(' ').map((n: string) => n[0]).join('')}
              </div>

              <h2 className="text-h2 text-ink-50">{persona.name}</h2>
              <p className="text-small text-ink-400 mt-1 max-w-md">{persona.scenario}</p>

              {/* Reactive voice waveform */}
              <div className="flex items-center gap-1.5 h-14 my-4" aria-hidden>
                {[16, 32, 44, 24, 38, 50, 28, 46, 20, 36, 48, 22, 40, 52, 18, 34, 42].map((h, i) => {
                  const isActive = callActive && (isPlayingAudio || isListeningMic || isAiResponding);
                  const dynamicHeight = isActive
                    ? isPlayingAudio
                      ? (i % 2 === 0 ? h : h * 0.75)
                      : isListeningMic
                      ? (i % 3 === 0 ? h * 0.85 : h * 0.45)
                      : (i % 2 === 0 ? 18 : 8)
                    : 6;

                  return (
                    <div
                      key={i}
                      className={`w-1 rounded-full transition-all duration-150 ${
                        isActive
                          ? isPlayingAudio
                            ? 'bg-brand-500 animate-pulse-soft'
                            : isListeningMic
                            ? 'bg-success-500 animate-pulse-soft'
                            : 'bg-ink-50'
                          : 'bg-ink-700'
                      }`}
                      style={{
                        height: `${dynamicHeight}px`
                      }}
                    />
                  );
                })}
              </div>

              {/* Live status line */}
              <div className="h-7 mb-3 flex items-center justify-center text-small">
                {isPlayingAudio && (
                  <span className="text-ink-50 flex items-center gap-2">
                    <span className="size-2 rounded-full bg-brand-500 animate-pulse-soft" aria-hidden />
                    <span>{persona.name} is speaking. Listen.</span>
                  </span>
                )}
                {isListeningMic && !isPlayingAudio && (
                  <span className="text-ink-50 flex items-center gap-2">
                    <span className="size-2 rounded-full bg-success-500 animate-pulse-soft" aria-hidden />
                    <span>Mic is live. Speak naturally, hands-free.</span>
                  </span>
                )}
                {isAiResponding && !isPlayingAudio && (
                  <span className="text-ink-400 flex items-center gap-2">
                    <Sparkles className="size-4 animate-pulse-soft" aria-hidden />
                    <span>{persona.name} is thinking...</span>
                  </span>
                )}
                {!isPlayingAudio && !isListeningMic && !isAiResponding && callActive && (
                  <span className="text-ink-400">
                    Speak into your microphone or type below
                  </span>
                )}
                {!callActive && (
                  <span className="text-ink-400">
                    Dial in to start a hands-free voice call
                  </span>
                )}
              </div>

              {/* Call control actions */}
              {!callActive ? (
                <Button
                  id="dial-in-btn"
                  variant="brand"
                  size="lg"
                  onClick={startCall}
                  icon={<PhoneCall aria-hidden />}
                >
                  Dial in and start the call
                </Button>
              ) : (
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  {/* Hands-free microphone toggle */}
                  <button
                    onClick={() => {
                      if (isListeningMic) {
                        stopListening();
                      } else {
                        startHandsFreeListening();
                      }
                    }}
                    title={isListeningMic ? "Mute microphone" : "Unmute microphone"}
                    className={`focus-ring h-11 px-4 rounded-md border text-body font-medium flex items-center gap-2 transition-colors duration-150 cursor-pointer [&_svg]:size-4 ${
                      isListeningMic
                        ? 'border-success-500/50 bg-success-500/10 text-ink-50'
                        : 'border-ink-700 text-ink-400 hover:bg-ink-800 hover:text-ink-50'
                    }`}
                  >
                    {isListeningMic ? <Mic className="text-success-500" aria-hidden /> : <MicOff aria-hidden />}
                    <span>{isListeningMic ? 'Mic on' : 'Mic paused'}</span>
                  </button>

                  {/* Speaker mute toggle */}
                  <button
                    onClick={() => {
                      if (!isMuted) {
                        if (audioSourceNodeRef.current) {
                          try { audioSourceNodeRef.current.stop(); } catch {}
                          audioSourceNodeRef.current = null;
                        }
                        if (audioElementRef.current) {
                          try { audioElementRef.current.pause(); } catch {}
                        }
                        setIsPlayingAudio(false);
                      }
                      setIsMuted(!isMuted);
                    }}
                    title={isMuted ? "Unmute audio" : "Mute audio"}
                    aria-label={isMuted ? "Unmute audio" : "Mute audio"}
                    className={`focus-ring size-11 rounded-md border flex items-center justify-center transition-colors duration-150 cursor-pointer [&_svg]:size-4 ${
                      isMuted
                        ? 'border-ink-50 bg-ink-50 text-ink-900'
                        : 'border-ink-700 text-ink-50 hover:bg-ink-800'
                    }`}
                  >
                    {isMuted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
                  </button>

                  {/* End call and grade */}
                  <Button
                    variant="brand"
                    size="lg"
                    onClick={endCallAndGrade}
                    disabled={isFinishingCall}
                    loading={isFinishingCall}
                    icon={<PhoneOff aria-hidden />}
                  >
                    {isFinishingCall ? 'Building your scorecard...' : 'End call and get scorecard'}
                  </Button>
                </div>
              )}
            </div>

            {/* Dialogue feed */}
            <div className="flex flex-col border-t border-ink-800 min-h-[340px]">
              <div className="px-5 py-3 border-b border-ink-800 flex items-center justify-between">
                <span className="text-body-strong text-ink-50">
                  Conversation <span className="text-ink-400 font-normal tabular-nums">{transcript.length} turns</span>
                </span>
                <span className="text-caption text-ink-400 flex items-center gap-2">
                  <span className={`size-2 rounded-full ${callActive ? 'bg-success-500 animate-pulse-soft' : 'bg-ink-700'} inline-block`} aria-hidden />
                  <span>{callActive ? 'Live voice on' : 'Live voice off'}</span>
                </span>
              </div>

              <div ref={scrollRef} className="flex-1 p-5 overflow-y-auto space-y-4 max-h-[350px]">
                {transcript.length === 0 && (
                  <div className="py-12 text-center text-small text-ink-400">
                    Click <strong className="text-ink-50 font-medium">Dial in and start the call</strong> above to connect and hear {persona.name} speak.
                  </div>
                )}

                {transcript.map((t, i) => (
                  <div
                    key={i}
                    className={`flex flex-col gap-1 max-w-[85%] ${
                      t.role === 'rep' ? 'ml-auto items-end' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-caption text-ink-400">
                        {t.role === 'rep'
                          ? `You (${selectedRepAccent === 'arabic' ? 'Arabic accent' : 'Filipino accent'})`
                          : persona.name}
                      </span>
                      <span className="text-caption text-ink-400 tabular-nums">{t.timestamp}</span>

                      {/* Replay audio button for turns */}
                      {t.audioUrl && (
                        <button
                          onClick={() => playVoiceAudio(t.audioUrl!, t.content, i)}
                          title="Replay Voice Audio"
                          aria-label="Replay voice audio"
                          className={`focus-ring p-1 rounded-sm hover:bg-ink-800 transition-colors cursor-pointer ${
                            activeAudioTurn === i ? 'text-brand-500' : 'text-ink-400 hover:text-ink-50'
                          }`}
                        >
                          <Play className="size-3" aria-hidden />
                        </button>
                      )}
                    </div>
                    <div className={`px-3.5 py-2.5 rounded-lg text-body ${
                      t.role === 'rep'
                        ? 'bg-ink-50 text-ink-900 rounded-tr-sm'
                        : 'bg-ink-800 text-ink-50 rounded-tl-sm'
                    }`}>
                      {t.content}
                    </div>
                  </div>
                ))}

                {/* Real-time speech transcription preview while speaking */}
                {liveTranscriptPreview && (
                  <div className="flex flex-col gap-1 max-w-[85%] ml-auto items-end opacity-90">
                    <div className="flex items-center gap-2">
                      <span className="text-caption text-success-500">You, speaking...</span>
                    </div>
                    <div className="px-3.5 py-2.5 rounded-lg text-body border border-success-500/40 text-ink-50 rounded-tr-sm">
                      {liveTranscriptPreview}
                    </div>
                  </div>
                )}

                {isAiResponding && (
                  <div className="flex items-center gap-2 text-small text-ink-400 p-2">
                    <Sparkles className="size-4 animate-pulse-soft" aria-hidden />
                    <span>{persona.name} is replying...</span>
                  </div>
                )}
              </div>

              {/* Rep spoken / text input bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="p-3 border-t border-ink-800 flex items-center gap-2"
              >
                <button
                  type="button"
                  disabled={!callActive || isAiResponding}
                  onClick={() => {
                    if (isListeningMic) {
                      stopListening();
                    } else {
                      startHandsFreeListening();
                    }
                  }}
                  title="Toggle Microphone"
                  aria-label="Toggle microphone"
                  className={`focus-ring size-9 rounded-md border flex items-center justify-center transition-colors duration-150 cursor-pointer shrink-0 disabled:opacity-50 ${
                    isListeningMic
                      ? 'border-success-500/50 bg-success-500/10 text-success-500'
                      : 'border-ink-700 text-ink-400 hover:bg-ink-800 hover:text-ink-50'
                  }`}
                >
                  <Mic className="size-4" aria-hidden />
                </button>

                <input
                  type="text"
                  disabled={!callActive || isAiResponding}
                  value={repInput}
                  onChange={(e) => setRepInput(e.target.value)}
                  placeholder={
                    !callActive
                      ? "Dial in above to start the call..."
                      : isListeningMic
                      ? "Listening hands-free... pause talking to auto-send, or edit here"
                      : "Type what you would say, or turn on the mic..."
                  }
                  aria-label="Your response"
                  className="focus-ring flex-1 h-9 bg-ink-800 border border-ink-700 rounded-sm px-3 text-body text-ink-50 placeholder:text-ink-400 focus:border-brand-500 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!callActive || !repInput.trim() || isAiResponding}
                  className="focus-ring h-9 px-3.5 rounded-md bg-ink-50 hover:bg-ink-200 disabled:opacity-50 disabled:pointer-events-none text-ink-900 font-medium text-body flex items-center gap-2 transition-colors duration-150 shrink-0 cursor-pointer"
                >
                  <span>Speak</span>
                  <Send className="size-4" aria-hidden />
                </button>
              </form>
            </div>
          </div>

          {/* Right rail: suggested line, live objectives and buyer context */}
          <div className="lg:col-span-4 flex flex-col gap-4">

            {/* Real-time script assist */}
            <div className="bg-surface border border-line rounded-lg p-5 shadow-xs space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-h3 text-fg flex items-center gap-2">
                  <Sparkles className="size-4 text-fg-secondary" aria-hidden />
                  <span>What to say next</span>
                </h2>
                <StatusDot tone="success" live label={<span className="text-small text-fg-secondary">Live</span>} />
              </div>

              {/* Current objection */}
              <div className="flex items-center gap-2 flex-wrap text-small">
                <span className="text-fg-tertiary">Objection</span>
                <Badge tone="warning" className="h-auto min-h-5 whitespace-normal py-0.5">
                  {scriptAssist?.objectionType || "Initial Gatekeeping / Friction"}
                </Badge>
              </div>

              {/* Suggested line */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center rounded-sm bg-ai px-1.5 text-caption leading-5 text-ink-900">Suggested line</span>
                  <button
                    type="button"
                    onClick={() => scriptAssist?.recommendedScript && handleCopyScript(scriptAssist.recommendedScript)}
                    className={buttonClasses('ghost', 'sm', 'h-7 px-2')}
                    title="Copy script to clipboard"
                  >
                    {copiedScript ? (
                      <>
                        <CheckCircle2 className="text-success-fg" aria-hidden />
                        <span className="text-success-fg">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy aria-hidden />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="border-l-2 border-ai pl-3 text-body-strong text-fg">
                  &ldquo;{scriptAssist?.recommendedScript || persona.initialScriptAssist?.recommendedScript}&rdquo;
                </p>

                {/* 1-click action to drop into rep input */}
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  disabled={!callActive || isAiResponding}
                  onClick={() => {
                    if (scriptAssist?.recommendedScript) {
                      setRepInput(scriptAssist.recommendedScript);
                    }
                  }}
                  icon={<CornerDownLeft aria-hidden />}
                >
                  Use this line
                </Button>
              </div>

              {/* A.R.M. framework step breakdown */}
              {scriptAssist?.arm && (
                <div className="space-y-2 border-t border-line pt-4">
                  <div className="flex items-center gap-1.5 text-small text-fg-tertiary">
                    <span>How to answer, step by step</span>
                    <Tooltip content="The A.R.M. method: Acknowledge the objection, Respond to it, then Move to a next step.">
                      <Info className="size-3.5" aria-label="About the A.R.M. method" />
                    </Tooltip>
                  </div>
                  <ol className="space-y-2 text-small text-fg-secondary">
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-subtle text-[10px] font-medium tabular-nums text-fg-secondary">1</span>
                      <span><strong className="font-medium text-fg">Acknowledge:</strong> {scriptAssist.arm.acknowledge}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-subtle text-[10px] font-medium tabular-nums text-fg-secondary">2</span>
                      <span><strong className="font-medium text-fg">Respond:</strong> {scriptAssist.arm.respond}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-subtle text-[10px] font-medium tabular-nums text-fg-secondary">3</span>
                      <span><strong className="font-medium text-fg">Move:</strong> {scriptAssist.arm.move}</span>
                    </li>
                  </ol>
                </div>
              )}

              {/* Tactical rationale */}
              {scriptAssist?.tacticalRationale && (
                <div className="text-small text-fg-secondary flex items-start gap-2">
                  <Lightbulb className="size-4 shrink-0 text-fg-tertiary mt-0.5" aria-hidden />
                  <span><strong className="font-medium text-fg">Why this works:</strong> {scriptAssist.tacticalRationale}</span>
                </div>
              )}
            </div>

            {/* Live objectives checklist */}
            <div className="bg-surface border border-line rounded-lg p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-h3 text-fg">Objectives</h2>
                <span className="text-small tabular-nums text-fg-secondary">
                  {completedObjectivesCount} / {objectives.length}
                </span>
              </div>

              <ul className="space-y-2.5">
                {objectives.map((obj: any) => (
                  <li
                    key={obj.id}
                    className="flex items-start gap-2.5 text-body"
                  >
                    <span
                      aria-hidden
                      className={`mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-150 ${
                        obj.completed
                          ? 'border-selected bg-selected text-selected-fg'
                          : 'border-line-strong bg-surface'
                      }`}
                    >
                      {obj.completed && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className={obj.completed ? 'text-fg-tertiary line-through' : 'text-fg'}>
                      <span className="sr-only">{obj.completed ? 'Done: ' : 'To do: '}</span>
                      {obj.description}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Buyer behaviour / persona context */}
            <div className="bg-surface border border-line rounded-lg p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-h3 text-fg">
                  About this buyer
                </h2>
                <Badge tone={persona.difficulty === 'Beginner' ? 'success' : persona.difficulty === 'Advanced' ? 'warning' : persona.difficulty === 'Nightmare' ? 'danger' : 'neutral'}>
                  {persona.difficulty}
                </Badge>
              </div>

              <blockquote className="border-l-2 border-line-strong pl-3 text-body text-fg-secondary">
                &ldquo;{persona.coreObjection}&rdquo;
              </blockquote>

              <div className="space-y-2 text-small text-fg-secondary">
                <p>
                  <strong className="font-medium text-fg">Scenario:</strong> {persona.scenario}
                </p>
                <p>
                  <strong className="font-medium text-fg">Tip:</strong> Show you understand their concern before you reframe it. Finish by asking for a 10-minute diagnostic call.
                </p>
              </div>
            </div>

            {/* Voice profile */}
            <div className="bg-surface border border-line rounded-lg p-4 shadow-xs flex items-start justify-between gap-4">
              <div className="min-w-0">
                <span className="text-caption text-fg-tertiary block">Buyer voice</span>
                <span className="text-body-strong text-fg">
                  {getPersonaVoiceByCountry(persona, selectedCountry).accentLabel}
                </span>
              </div>
              <div className="text-right min-w-0">
                <span className="text-caption text-fg-tertiary block">Voice model</span>
                <span className="text-small text-fg-secondary">
                  ElevenLabs {elevenLabsModelLabel(ELEVENLABS_MODELS.realtime)}
                </span>
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}

export default function SparringRoomPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-small text-fg-secondary">Loading Sparring Arena...</div>}>
      <SparringRoomContent />
    </Suspense>
  );
}
