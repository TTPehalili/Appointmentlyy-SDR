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
  CheckCircle, 
  Clock, 
  Sparkles, 
  Send, 
  ArrowLeft, 
  Radio, 
  CheckCircle2, 
  Circle, 
  Play, 
  Pause, 
  AlertCircle, 
  Headphones, 
  RotateCcw, 
  PhoneCall, 
  Copy,
  Globe
} from 'lucide-react';
import { SPARRING_PERSONAS, ScriptAssist, SparringCountry, getPersonaVoiceByCountry } from '@/lib/personas';
import { RepAccentKey, getRepVoice, RepVoiceProfile } from '@/lib/repVoices';
import { DialogueTurn } from '@/lib/qaEvaluator';

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

  // Client-side synthesis fallback: directly calls ElevenLabs TTS API if server didn't pre-synthesize audio
  const synthesizeVoiceIfNeeded = useCallback(async (text: string, personaVoiceId: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceId: personaVoiceId,
          voiceSettings: persona.voiceSettings
        })
      });
      if (res.ok) {
        const data = await res.json();
        return data.audio || null;
      }
    } catch (e) {
      console.warn('Client TTS fetch note:', e);
    }
    return null;
  }, [persona.voiceSettings]);

  // Rock-solid audio playback engine using native audio Blobs (NO robotic fallback)
  const playVoiceAudio = useCallback(async (audioUrl: string, textFallback: string, turnIndex?: number): Promise<void> => {
    if (isMuted) return;

    // Immediately stop mic while AI speaks to prevent audio loopback echo
    stopListening();

    lastAudioUrlRef.current = audioUrl;
    lastTextRef.current = textFallback;
    setIsPlayingAudio(true);
    if (turnIndex !== undefined) setActiveAudioTurn(turnIndex);

    // Cancel any existing SpeechSynthesis so robotic voices NEVER fire
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch {}
    }

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

          let audioToPlay = data.audioUrl;
          if (!audioToPlay) {
            audioToPlay = await synthesizeVoiceIfNeeded(data.greetingText, voiceConfig.voiceId);
          }

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

        let audioToPlay = audioUrl;
        if (!audioToPlay) {
          audioToPlay = await synthesizeVoiceIfNeeded(aiReply, voiceConfig.voiceId);
        }

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
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch {}
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
    <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-[#F2F0EF] font-sans antialiased text-[#222021]">

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Subheader Breadcrumb */}
        <div className="border-b border-[#222021]/10 bg-white px-8 py-2.5 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-3">
            <Link
              href="/practice"
              className="p-1.5 rounded-lg bg-[#F2F0EF] hover:bg-[#e7e4e2] text-[#222021] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-[#222021]">{persona.name}</span>
              <span className="text-[#6b6968]">•</span>
              <span className="text-[#6b6968] font-medium">{persona.title} ({persona.companyType})</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Rep Voice Accent Toggle (Arabic vs Filipino) */}
            <div className="flex items-center bg-[#F2F0EF] border border-[#222021]/15 p-0.5 rounded-lg text-xs font-semibold">
              <span className="px-2 text-[10px] font-mono text-[#6b6968] font-bold">REP VOICE:</span>
              <button
                type="button"
                onClick={() => handleRepAccentChange('arabic')}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                  selectedRepAccent === 'arabic'
                    ? 'bg-[#ED1C24] text-white shadow-2xs font-bold'
                    : 'text-[#6b6968] hover:text-[#222021]'
                }`}
                title="Rep Voice: Arabic Accent (Dubai / Middle East Hub)"
              >
                <span>🇦🇪</span>
                <span>Arabic</span>
              </button>
              <button
                type="button"
                onClick={() => handleRepAccentChange('filipino')}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                  selectedRepAccent === 'filipino'
                    ? 'bg-[#ED1C24] text-white shadow-2xs font-bold'
                    : 'text-[#6b6968] hover:text-[#222021]'
                }`}
                title="Rep Voice: Filipino Accent (Manila BPO Floor)"
              >
                <span>🇵🇭</span>
                <span>Filipino</span>
              </button>
            </div>

            {/* Rep Gender Toggle (Male vs Female) */}
            <div className="flex items-center bg-[#F2F0EF] border border-[#222021]/15 p-0.5 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setSelectedRepGender('male')}
                className={`px-2 py-1 rounded-md transition cursor-pointer text-[11px] ${
                  selectedRepGender === 'male'
                    ? 'bg-[#222021] text-white shadow-2xs font-bold'
                    : 'text-[#6b6968] hover:text-[#222021]'
                }`}
                title={selectedRepAccent === 'arabic' ? 'Tariq (Male)' : 'Paolo (Male)'}
              >
                {selectedRepAccent === 'arabic' ? 'Tariq (M)' : 'Paolo (M)'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedRepGender('female')}
                className={`px-2 py-1 rounded-md transition cursor-pointer text-[11px] ${
                  selectedRepGender === 'female'
                    ? 'bg-[#222021] text-white shadow-2xs font-bold'
                    : 'text-[#6b6968] hover:text-[#222021]'
                }`}
                title={selectedRepAccent === 'arabic' ? 'Noor (Female)' : 'Lovely (Female)'}
              >
                {selectedRepAccent === 'arabic' ? 'Noor (F)' : 'Lovely (F)'}
              </button>
            </div>

            {/* Country Voice Accent Switcher Dropdown */}
            <div className="flex items-center gap-1.5 bg-[#F2F0EF] border border-[#222021]/15 px-2.5 py-1 rounded-lg">
              <Globe className="h-3.5 w-3.5 text-[#ED1C24]" />
              <select
                value={selectedCountry}
                onChange={(e) => handleCountryChange(e.target.value as SparringCountry)}
                className="bg-transparent text-xs font-bold text-[#222021] focus:outline-none cursor-pointer"
                title="Customer / Buyer Voice Accent Switcher"
              >
                <option value="USA">🇺🇸 USA Buyer</option>
                <option value="Australia">🇦🇺 Australia Buyer</option>
                <option value="UK">🇬🇧 UK Buyer</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F2F0EF] border border-[#222021]/10 font-mono text-[11px] text-[#222021] font-semibold">
              <Clock className="h-3.5 w-3.5 text-[#ED1C24]" />
              <span>{formatTime(callDuration)}</span>
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
              callActive 
                ? isPlayingAudio
                  ? 'bg-red-50 text-[#ED1C24] border-red-200 animate-pulse'
                  : isListeningMic
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-[#F2F0EF] text-[#6b6968] border-[#222021]/10'
            }`}>
              {callConnecting 
                ? 'Dialing...' 
                : callActive 
                ? isPlayingAudio 
                  ? `${persona.name} Speaking` 
                  : isListeningMic 
                  ? 'Your Turn (Mic Live)' 
                  : 'Thinking...' 
                : 'Ready to Dial'}
            </span>
          </div>
        </div>

        {/* Main Room Body */}
        <main className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Live Call Wave & Conversation (8 Cols) */}
          <div className="lg:col-span-8 flex flex-col gap-5">
            
            {/* Waveform / Call Centerpiece Card */}
            <div className="bg-white border border-[#222021]/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-2xs relative overflow-hidden">
              {/* Permanent Blessed Audio Player */}
              <audio ref={audioElementRef} id="sparring-audio-player" preload="auto" playsInline className="hidden" />

              <div className="flex items-center gap-2 absolute top-4 right-4">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-100 text-[10px] font-mono text-[#222021] border border-zinc-200 font-semibold">
                  <Headphones className="h-3 w-3 text-[#ED1C24]" />
                  <span>Two-Way Hands-Free Voice</span>
                </span>
              </div>

              {/* Autoplay block prompt if browser blocked audio */}
              {audioBlocked && (
                <div 
                  onClick={primeAudioContext}
                  className="mb-3 px-4 py-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center gap-2 cursor-pointer animate-bounce"
                >
                  <Volume2 className="h-4 w-4 text-amber-700" />
                  <span className="font-semibold">Tap here to enable audio playback in your browser</span>
                </div>
              )}

              {/* Mic permission prompt */}
              {micPermissionDenied && (
                <div className="mb-3 px-4 py-2 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-700" />
                  <span>Microphone blocked in browser. Click the lock icon in your URL bar to allow mic.</span>
                </div>
              )}

              <div className="h-16 w-16 rounded-2xl bg-[#222021] text-white font-black text-xl flex items-center justify-center shadow-sm mb-3">
                {persona.name.split(' ').map((n: string) => n[0]).join('')}
              </div>

              <h2 className="text-base font-bold text-[#222021]">{persona.name}</h2>
              <p className="text-xs text-[#6b6968] mt-0.5 max-w-md">{persona.scenario}</p>

              {/* Dynamic Reactive Voice Waveform Indicator */}
              <div className="flex items-center gap-1.5 h-14 my-3">
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
                            ? 'bg-[#ED1C24] animate-pulse'
                            : isListeningMic
                            ? 'bg-emerald-500 animate-pulse'
                            : 'bg-[#222021]'
                          : 'bg-[#d8d5d3]'
                      }`}
                      style={{
                        height: `${dynamicHeight}px`
                      }}
                    />
                  );
                })}
              </div>

              {/* Live Interactive Status Pill */}
              <div className="h-6 mb-2 flex items-center justify-center">
                {isPlayingAudio && (
                  <span className="text-xs font-mono font-semibold text-[#ED1C24] flex items-center gap-1.5 animate-pulse">
                    <Sparkles className="h-3.5 w-3.5 animate-spin" />
                    <span>{persona.name} is speaking audibly... (Listen)</span>
                  </span>
                )}
                {isListeningMic && !isPlayingAudio && (
                  <span className="text-xs font-mono font-bold text-emerald-700 flex items-center gap-2 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                    <span className="h-2 w-2 rounded-full bg-emerald-600 animate-ping" />
                    <span>Mic is live — speak naturally into your mic (Hands-free)</span>
                  </span>
                )}
                {isAiResponding && !isPlayingAudio && (
                  <span className="text-xs font-mono text-[#6b6968] flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-[#ED1C24] animate-spin" />
                    <span>{persona.name} is formulating response...</span>
                  </span>
                )}
                {!isPlayingAudio && !isListeningMic && !isAiResponding && callActive && (
                  <span className="text-xs font-mono text-[#6b6968]">
                    Speak into your microphone or type below
                  </span>
                )}
                {!callActive && (
                  <span className="text-xs font-mono text-[#6b6968]">
                    Click Dial In below to start hands-free voice conversation
                  </span>
                )}
              </div>

              {/* Call Control Actions */}
              {!callActive ? (
                <button
                  id="dial-in-btn"
                  onClick={startCall}
                  className="px-8 py-3.5 rounded-xl bg-[#ED1C24] hover:bg-[#d0181f] text-white font-extrabold text-xs uppercase tracking-wider transition-all shadow-md flex items-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                >
                  <PhoneCall className="h-4 w-4" />
                  <span>DIAL IN & START TWO-WAY CONVERSATION</span>
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  {/* Hands-free Microphone Indicator / Toggle */}
                  <button
                    onClick={() => {
                      if (isListeningMic) {
                        stopListening();
                      } else {
                        startHandsFreeListening();
                      }
                    }}
                    title={isListeningMic ? "Mute microphone" : "Unmute microphone"}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isListeningMic
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 animate-pulse'
                        : 'bg-[#F2F0EF] border-[#222021]/10 text-[#6b6968] hover:bg-[#e7e4e2]'
                    }`}
                  >
                    {isListeningMic ? <Mic className="h-4 w-4 text-emerald-600" /> : <MicOff className="h-4 w-4 text-[#6b6968]" />}
                    <span>{isListeningMic ? 'Hands-free Mic: Active' : 'Hands-free Mic: Paused'}</span>
                  </button>

                  {/* Speaker Mute Toggle */}
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
                        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                          try { window.speechSynthesis.cancel(); } catch {}
                        }
                        setIsPlayingAudio(false);
                      }
                      setIsMuted(!isMuted);
                    }}
                    title={isMuted ? "Unmute audio" : "Mute audio"}
                    className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                      isMuted
                        ? 'bg-rose-50 border-rose-200 text-rose-700'
                        : 'bg-[#F2F0EF] border-[#222021]/10 text-[#222021] hover:bg-[#e7e4e2]'
                    }`}
                  >
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>

                  {/* End Call & Grade */}
                  <button
                    onClick={endCallAndGrade}
                    disabled={isFinishingCall}
                    className="px-5 py-2.5 rounded-xl bg-[#222021] hover:bg-black text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-2xs flex items-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    <PhoneOff className="h-4 w-4 text-[#ED1C24]" />
                    <span>{isFinishingCall ? 'GENERATING SCORECARD...' : 'END CALL & GRADE'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Dialogue Feed */}
            <div className="bg-white border border-[#222021]/10 rounded-2xl flex flex-col overflow-hidden shadow-2xs min-h-[340px]">
              <div className="px-4 py-2.5 border-b border-[#222021]/10 flex items-center justify-between bg-[#F2F0EF]/40">
                <span className="text-xs font-bold uppercase tracking-wider text-[#222021]">
                  Live Two-Way Audio Feed ({transcript.length} turns)
                </span>
                <span className="text-[11px] font-mono text-[#6b6968] flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${callActive ? 'bg-emerald-500 animate-ping' : 'bg-zinc-400'} inline-block`} />
                  <span>ElevenLabs Realtime Voice Active</span>
                </span>
              </div>

              <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 max-h-[350px]">
                {transcript.length === 0 && (
                  <div className="py-12 text-center text-xs text-[#6b6968]">
                    Click <strong className="text-[#222021]">"DIAL IN & START TWO-WAY CONVERSATION"</strong> above to connect and hear {persona.name} speak.
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
                      <span className={`text-[10px] font-bold uppercase tracking-wide ${
                        t.role === 'rep' ? 'text-[#ED1C24]' : 'text-[#6b6968]'
                      }`}>
                        {t.role === 'rep'
                          ? `Sales Rep (${selectedRepAccent === 'arabic' ? '🇦🇪 Arabic Accent' : '🇵🇭 Filipino Accent'})`
                          : persona.name}
                      </span>
                      <span className="text-[10px] text-[#6b6968] font-mono">{t.timestamp}</span>

                      {/* Replay audio button for turns */}
                      {t.audioUrl && (
                        <button
                          onClick={() => playVoiceAudio(t.audioUrl!, t.content, i)}
                          title="Replay Voice Audio"
                          className={`p-1 rounded hover:bg-[#e7e4e2] text-[#6b6968] transition-colors cursor-pointer ${
                            activeAudioTurn === i ? 'text-[#ED1C24]' : ''
                          }`}
                        >
                          <Play className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <div className={`p-3 rounded-2xl text-xs leading-relaxed ${
                      t.role === 'rep'
                        ? 'bg-[#ED1C24]/10 border border-[#ED1C24]/20 text-[#222021] rounded-tr-none'
                        : 'bg-[#F2F0EF] border border-[#222021]/10 text-[#222021] rounded-tl-none'
                    }`}>
                      {t.content}
                    </div>
                  </div>
                ))}

                {/* Real-time Speech Transcription Preview while speaking */}
                {liveTranscriptPreview && (
                  <div className="flex flex-col gap-1 max-w-[85%] ml-auto items-end opacity-90 animate-pulse">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase text-emerald-600">You (Speaking...)</span>
                    </div>
                    <div className="p-3 rounded-2xl text-xs leading-relaxed bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-tr-none shadow-sm">
                      {liveTranscriptPreview}
                    </div>
                  </div>
                )}

                {isAiResponding && (
                  <div className="flex items-center gap-2 text-xs text-[#6b6968] italic p-2">
                    <Sparkles className="h-3.5 w-3.5 text-[#ED1C24] animate-spin" />
                    <span>{persona.name} is replying with voice...</span>
                  </div>
                )}
              </div>

              {/* Rep Spoken / Text Input Bar */}
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }} 
                className="p-3 border-t border-[#222021]/10 bg-white flex items-center gap-2"
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
                  className={`p-2 rounded-xl border transition-colors cursor-pointer shrink-0 ${
                    isListeningMic
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700 animate-pulse'
                      : 'bg-[#F2F0EF] border-[#222021]/10 text-[#6b6968] hover:bg-[#e7e4e2]'
                  }`}
                >
                  <Mic className="h-4 w-4" />
                </button>

                <input
                  type="text"
                  disabled={!callActive || isAiResponding}
                  value={repInput}
                  onChange={(e) => setRepInput(e.target.value)}
                  placeholder={
                    !callActive 
                      ? "Dial in above to start two-way phone call..."
                      : isListeningMic
                      ? "Listening to you hands-free... pause talking to auto-send, or edit here"
                      : "Type your spoken response or toggle microphone..."
                  }
                  className="flex-1 bg-[#F2F0EF] border border-[#222021]/10 rounded-xl px-4 py-2 text-xs text-[#222021] placeholder-[#6b6968] focus:outline-none focus:bg-white focus:border-[#ED1C24] disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!callActive || !repInput.trim() || isAiResponding}
                  className="px-4 py-2 rounded-xl bg-[#ED1C24] hover:bg-[#d0181f] disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-2xs shrink-0 cursor-pointer"
                >
                  <span>Speak</span>
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Live Objectives & Scoring Criteria (4 Cols) */}
          <div className="lg:col-span-4 flex flex-col gap-5">
            
            {/* Real-Time Teleprompter & Objection Script Assist */}
            <div className="bg-white border-2 border-[#ED1C24]/30 rounded-2xl p-5 shadow-2xs space-y-3.5 relative overflow-hidden transition-all duration-300">
              {/* Subtle top indicator bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#ED1C24] via-rose-500 to-amber-500" />

              {/* Header */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#222021] flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-[#ED1C24] animate-pulse" />
                  <span>REAL-TIME SCRIPT ASSIST</span>
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                  <span>LIVE PROMPTER</span>
                </span>
              </div>

              {/* Current Friction / Objection Badge */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#6b6968] font-bold">Friction:</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200">
                  🎯 {scriptAssist?.objectionType || "Initial Gatekeeping / Friction"}
                </span>
              </div>

              {/* Verbatim Script Teleprompter Box */}
              <div className="bg-[#18181b] text-white rounded-xl p-3.5 border border-zinc-800 shadow-inner space-y-2.5">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400 font-bold flex items-center gap-1">
                    <Radio className="h-3 w-3 text-rose-400 animate-pulse" />
                    <span>WHAT TO SAY NEXT (VERBATIM):</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => scriptAssist?.recommendedScript && handleCopyScript(scriptAssist.recommendedScript)}
                      className="text-[10px] text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 flex items-center gap-1 transition-colors cursor-pointer"
                      title="Copy script to clipboard"
                    >
                      {copiedScript ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                          <span className="text-emerald-400 font-medium">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-zinc-100 font-medium leading-relaxed italic selection:bg-rose-500 selection:text-white">
                  "{scriptAssist?.recommendedScript || persona.initialScriptAssist?.recommendedScript}"
                </p>

                {/* 1-Click Action to drop into Rep Input */}
                <div className="pt-1 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={!callActive || isAiResponding}
                    onClick={() => {
                      if (scriptAssist?.recommendedScript) {
                        setRepInput(scriptAssist.recommendedScript);
                      }
                    }}
                    className="w-full text-center py-1.5 px-2.5 rounded-lg bg-[#ED1C24] hover:bg-[#d0181f] disabled:opacity-50 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <span>🪄 Drop Into Input Bar</span>
                  </button>
                </div>
              </div>

              {/* A.R.M. Framework Step Breakdown */}
              {scriptAssist?.arm && (
                <div className="space-y-1.5 bg-[#F2F0EF]/80 rounded-xl p-2.5 border border-[#222021]/10 text-[11px]">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[#6b6968] font-bold">
                    A.R.M. Execution Breakdown:
                  </div>
                  <div className="space-y-1 text-[#222021]">
                    <div className="flex items-start gap-1.5">
                      <span className="font-mono font-bold text-amber-700 bg-amber-100/80 px-1 py-0.5 rounded text-[10px] shrink-0">A</span>
                      <span className="text-[11px] leading-tight text-[#444]"><strong className="text-[#222021]">Acknowledge:</strong> {scriptAssist.arm.acknowledge}</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="font-mono font-bold text-blue-700 bg-blue-100/80 px-1 py-0.5 rounded text-[10px] shrink-0">R</span>
                      <span className="text-[11px] leading-tight text-[#444]"><strong className="text-[#222021]">Respond:</strong> {scriptAssist.arm.respond}</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="font-mono font-bold text-emerald-700 bg-emerald-100/80 px-1 py-0.5 rounded text-[10px] shrink-0">M</span>
                      <span className="text-[11px] leading-tight text-[#444]"><strong className="text-[#222021]">Move:</strong> {scriptAssist.arm.move}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Tactical Rationale */}
              {scriptAssist?.tacticalRationale && (
                <div className="text-[11px] text-[#6b6968] leading-tight flex items-start gap-1.5 pt-0.5">
                  <span className="shrink-0 text-amber-600">💡</span>
                  <span><strong className="text-[#222021]">Why this works:</strong> {scriptAssist.tacticalRationale}</span>
                </div>
              )}
            </div>

            {/* Live Objectives Checklist */}
            <div className="bg-white border border-[#222021]/10 rounded-2xl p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#222021] flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-[#ED1C24]" />
                  <span>LIVE OBJECTIVES</span>
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#ED1C24]/10 text-[#ED1C24] border border-[#ED1C24]/20">
                  {completedObjectivesCount} / {objectives.length}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                {objectives.map((obj: any) => (
                  <div
                    key={obj.id}
                    className={`p-3 rounded-xl border transition-all duration-300 flex items-center gap-2.5 ${
                      obj.completed
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900 font-semibold shadow-2xs'
                        : 'bg-[#F2F0EF] border-[#222021]/10 text-[#6b6968]'
                    }`}
                  >
                    {obj.completed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-[#6b6968] shrink-0" />
                    )}
                    <span className="leading-snug">{obj.description}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Behavioral Rules / Persona Context */}
            <div className="bg-white border border-[#222021]/10 rounded-2xl p-5 shadow-2xs space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#222021] block">
                  BUYER BEHAVIORAL RULES:
                </span>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-zinc-100 text-[#222021] border border-zinc-200">
                  {persona.difficulty}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#F2F0EF] border border-[#222021]/10 text-[11px] text-[#222021] font-mono leading-relaxed">
                "{persona.coreObjection}"
              </div>

              <div className="space-y-1.5 text-[11px] text-[#6b6968] leading-relaxed">
                <p>
                  <strong className="text-[#222021]">Scenario:</strong> {persona.scenario}
                </p>
                <p>
                  <strong className="text-[#222021]">Tactical Hint:</strong> Validate their friction with tactical empathy before introducing the reframe. Conclude with a 10-minute diagnostic benchmark question.
                </p>
              </div>
            </div>

            {/* Voice Profile Card */}
            <div className="bg-white border border-[#222021]/10 rounded-2xl p-4 shadow-2xs flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] uppercase font-mono font-bold text-[#6b6968] block">Voice Accent</span>
                <span className="font-semibold text-[#222021]">
                  {getPersonaVoiceByCountry(persona, selectedCountry).accentLabel}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-mono font-bold text-[#6b6968] block">Territory Voice Model</span>
                <span className="font-mono text-[11px] text-[#ED1C24] font-bold">
                  {selectedCountry} ElevenLabs Turbo v2.5
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
    <Suspense fallback={<div className="p-8 text-center text-xs text-[#6b6968]">Loading Sparring Arena...</div>}>
      <SparringRoomContent />
    </Suspense>
  );
}
