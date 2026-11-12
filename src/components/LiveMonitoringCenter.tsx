'use client';

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { 
  Radio, 
  Headphones, 
  Volume2, 
  VolumeX, 
  Send, 
  Search, 
  CheckCircle2, 
  ShieldCheck, 
  X, 
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Loader2,
  MessageSquareText,
  AlertCircle
} from 'lucide-react';
import { Button, EmptyState, Input, PageHeader, Select, StatusDot, Tooltip, buttonClasses } from '@/components/ui';
import { useDemoWorkspace } from '@/lib/useDemoWorkspace';
import { ElevenLabsAttribution } from '@/components/voice/ElevenLabsAttribution';
import { ELEVENLABS_MODELS, elevenLabsModelLabel, isRetryableVoiceError, voiceErrorMessage } from '@/lib/elevenlabs/voiceEngine';
import { useSession } from '@/lib/session';
import { PERSONA_VOICE_MAP, SparringCountry } from '@/lib/personas';
import {
  REP_VOICE_REGISTRY,
  RepAccentKey,
  getRepVoice,
  RepVoiceProfile,
} from '@/lib/repVoices';

const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

// Rep Voice Profiles (Arabic Accent & Filipino Accent)
export const REP_VOICES = REP_VOICE_REGISTRY;
export const FILIPINO_REP_VOICES = REP_VOICE_REGISTRY.filipino;
export const ARABIC_REP_VOICES = REP_VOICE_REGISTRY.arabic;

export interface DialogueTurn {
  id: string;
  speaker: string;
  role: 'rep' | 'prospect';
  text: string;
  time: string;
  voiceId: string;
}

export interface ActiveSparringSession {
  id: string;
  line: string;
  repName: string;
  repEmail: string;
  repGender: 'male' | 'female';
  repAccent: string;
  avatar: string;
  tenant: string;
  personaId: string;
  personaName: string;
  personaRole: string;
  personaDifficulty: 'High' | 'Medium' | 'Extreme';
  countryAccent: SparringCountry;
  initialSeconds: number;
  currentObjection: string;
  score: number;
  sentiment: 'Hostile' | 'Skeptical' | 'Neutral' | 'Engaged';
  wpm: number;
  armStatus: {
    acknowledge: boolean;
    respond: boolean;
    move: boolean;
  };
  recentTranscript: DialogueTurn[];
}

export default function LiveMonitoringCenter() {
  // The sample practice calls are for the platform owner's demo workspace only.
  const isDemo = useDemoWorkspace();
  const { tenantName } = useSession();
  const [searchQuery, setSearchQuery] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState<'all' | 'Hostile' | 'Skeptical' | 'Neutral' | 'Engaged'>('all');
  const [tenantFilter, setTenantFilter] = useState('all');
  
  // Dynamic Customer Voice Accent State (USA, Australia, UK)
  const [selectedCustomerAccent, setSelectedCustomerAccent] = useState<SparringCountry>('Australia');

  // Rep Voice Accent Toggle (Arabic vs Filipino)
  const [selectedRepAccent, setSelectedRepAccent] = useState<RepAccentKey>('arabic');

  // Audio playback state
  const [activeListeningSession, setActiveListeningSession] = useState<ActiveSparringSession | null>(null);
  const [currentTurnIndex, setCurrentTurnIndex] = useState<number | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  // ElevenLabs couldn't voice a turn: playback stops there with "Voice unavailable, retry".
  const [voiceIssue, setVoiceIssue] = useState<{ turnIndex: number; code: string | null; message: string } | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [volume, setVolume] = useState(85);
  
  // Whisper coach state
  const [whisperMessage, setWhisperMessage] = useState('');
  const [whisperFeedbackSent, setWhisperFeedbackSent] = useState(false);
  const whisperInputRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingWhisperFocusRef = useRef(false);
  const [whisperFocusRequest, setWhisperFocusRequest] = useState(0);

  // Audio elements & memory cache
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<string, string>>(new Map());
  const isPlayingRef = useRef(false);
  const activeSessionRef = useRef<ActiveSparringSession | null>(null);
  const currentTurnIndexRef = useRef<number | null>(null);
  const pendingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Keep refs in sync for event listeners
  useEffect(() => {
    isPlayingRef.current = isAudioPlaying;
  }, [isAudioPlaying]);

  useEffect(() => {
    activeSessionRef.current = activeListeningSession;
  }, [activeListeningSession]);

  useEffect(() => {
    currentTurnIndexRef.current = currentTurnIndex;
  }, [currentTurnIndex]);

  // Stop listening when the rep leaves the Live Floor. With cacheComponents, Next.js keeps the page
  // mounted but hidden (React <Activity>) instead of unmounting it, and the audio element and turn
  // timers live outside React, so without this the conversation keeps playing on other pages.
  // A layout-effect cleanup runs synchronously when the page is hidden (and on real unmount).
  useLayoutEffect(() => {
    const audioRef = audioElementRef;
    const timerRef = pendingTimerRef;
    return () => {
      // Clearing these makes in-flight playTurn calls (awaiting audio fetches) bail out.
      activeSessionRef.current = null;
      isPlayingRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const audio = audioRef.current;
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        try {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        } catch {}
        audioRef.current = null;
      }
      // Come back to a disconnected panel rather than one that shows "playing" with no sound.
      setActiveListeningSession(null);
      setCurrentTurnIndex(null);
      setIsAudioPlaying(false);
      setIsLoadingAudio(false);
    };
  }, []);

  // Volume & mute reactivity
  useEffect(() => {
    if (audioElementRef.current) {
      audioElementRef.current.volume = isAudioMuted ? 0 : volume / 100;
      audioElementRef.current.muted = isAudioMuted;
    }
  }, [volume, isAudioMuted]);

  // Helper to map customer voiceId given personaId and country (strictly conversational and gender-matched)
  const getCustomerVoiceId = (personaId: string, country: SparringCountry): string => {
    const personaEntry = PERSONA_VOICE_MAP[personaId];
    if (personaEntry && personaEntry[country]) {
      return personaEntry[country].voiceId;
    }
    const isFemale = personaEntry?.isFemale ?? ['iron-gatekeeper', 'burned-director', 'polite-ghoster', 'indecisive-manager'].includes(personaId);
    if (isFemale) {
      if (country === 'Australia') return '5oOUpLU3e4Q55YyHGbk0'; // Julie (Australian Conversational Female)
      if (country === 'UK') return 'EtBr43MW0sMHh44Pdij6'; // Trinity X (British Conversational Female)
      return 'cgSgspJ2msm6clMCkdW9'; // Jessica (American Conversational Female)
    }
    // Male Conversational fallbacks
    if (country === 'Australia') return '0zgVQzF8uy6TauIra2W1'; // Joel (Australian Conversational Male)
    if (country === 'UK') return '3f6pec3wODJsjTqtcNI2'; // Ricky O'Donnell (British Conversational Male)
    return 'cjVigY5qzO86Huf0OWal'; // Eric (American Conversational Male)
  };

  // Builder for mock sessions supporting Arabic and Filipino Rep Accents
  const buildSessions = (repAccent: RepAccentKey, customerAccent: SparringCountry): ActiveSparringSession[] => {
    const arabicMale = REP_VOICE_REGISTRY.arabic.male;
    const arabicFemale = REP_VOICE_REGISTRY.arabic.female;
    const filipinoMale = REP_VOICE_REGISTRY.filipino.male;
    const filipinoFemale = REP_VOICE_REGISTRY.filipino.female;
    const isArabic = repAccent === 'arabic';

    return [
      {
        id: 'sess-1',
        line: 'LINE 01',
        repName: isArabic ? arabicMale.name : filipinoMale.name,
        repEmail: isArabic ? 'tariq.mansoor@apexglobal.ae' : 'paolo.reyes@apexglobal.ph',
        repGender: 'male',
        repAccent: isArabic ? `${arabicMale.flag} ${arabicMale.accentBadge}` : `${filipinoMale.flag} ${filipinoMale.accentBadge}`,
        avatar: isArabic ? 'TA' : 'PR',
        tenant: isArabic ? 'Apex Global Outbound (Dubai)' : 'Apex Global BPO (Manila)',
        personaId: 'bpo-directory-buyer',
        personaName: 'Julian Vance',
        personaRole: 'Managing Director & Outbound Head (Apex BPO)',
        personaDifficulty: 'High',
        countryAccent: customerAccent,
        initialSeconds: 228,
        currentObjection: '“We already buy our leads every month. Why pay for more data?”',
        score: 88,
        sentiment: 'Engaged',
        wpm: 142,
        armStatus: { acknowledge: true, respond: true, move: false },
        recentTranscript: [
          {
            id: 'turn-1-1',
            speaker: 'Julian Vance',
            role: 'prospect',
            text: `We already buy lead lists every month, ${isArabic ? 'Tariq' : 'Paolo'}. Why on earth would I pay for additional software?`,
            time: '03:15',
            voiceId: getCustomerVoiceId('bpo-directory-buyer', customerAccent)
          },
          {
            id: 'turn-1-2',
            speaker: `${isArabic ? arabicMale.name : filipinoMale.name} (${isArabic ? arabicMale.flag : filipinoMale.flag} ${isArabic ? 'Arabic SDR' : 'Filipino SDR'})`,
            role: 'rep',
            text: 'Totally fair, Julian. Quick question though: how many of those contacts bounce or ring a wrong number before your reps reach a real decision maker?',
            time: '03:26',
            voiceId: isArabic ? arabicMale.voiceId : filipinoMale.voiceId
          },
          {
            id: 'turn-1-3',
            speaker: 'Julian Vance',
            role: 'prospect',
            text: 'Honestly? Too many. Half the shift goes on dead numbers and the pipeline is all over the place month to month. What are you doing differently?',
            time: '03:38',
            voiceId: getCustomerVoiceId('bpo-directory-buyer', customerAccent)
          },
          {
            id: 'turn-1-4',
            speaker: `${isArabic ? arabicMale.name : filipinoMale.name} (${isArabic ? arabicMale.flag : filipinoMale.flag} ${isArabic ? 'Arabic SDR' : 'Filipino SDR'})`,
            role: 'rep',
            text: 'We give you verified contacts matched to the clients you actually want, and every deal tracked by pipeline stage. Can I show you three live accounts right now?',
            time: '03:49',
            voiceId: isArabic ? arabicMale.voiceId : filipinoMale.voiceId
          },
          {
            id: 'turn-1-5',
            speaker: 'Julian Vance',
            role: 'prospect',
            text: `Alright ${isArabic ? 'Tariq' : 'Paolo'}, pull them up on screen. If the numbers actually connect, you have got my attention.`,
            time: '04:01',
            voiceId: getCustomerVoiceId('bpo-directory-buyer', customerAccent)
          }
        ]
      },
      {
        id: 'sess-2',
        line: 'LINE 02',
        repName: isArabic ? arabicFemale.name : 'Maria Santos',
        repEmail: isArabic ? 'noor.hassan@fintechscaleups.ae' : 'maria.santos@fintechscaleups.ph',
        repGender: 'female',
        repAccent: isArabic ? `${arabicFemale.flag} ${arabicFemale.accentBadge}` : `${filipinoFemale.flag} ${filipinoFemale.accentBadge}`,
        avatar: isArabic ? 'NA' : 'MS',
        tenant: isArabic ? 'Fintech Scaleups (Dubai DIFC)' : 'Fintech Scaleups (Cebu)',
        personaId: 'rushed-vp',
        personaName: 'David M.',
        personaRole: 'VP of Sales (Acme Cloud Tech)',
        personaDifficulty: 'High',
        countryAccent: customerAccent,
        initialSeconds: 142,
        currentObjection: '“Our reps ramp in 4 weeks, we already have internal enablement training.”',
        score: 84,
        sentiment: 'Skeptical',
        wpm: 136,
        armStatus: { acknowledge: true, respond: false, move: false },
        recentTranscript: [
          {
            id: 'turn-2-1',
            speaker: 'David M.',
            role: 'prospect',
            text: `We already have an internal enablement manager, ${isArabic ? 'Noor' : 'Maria'}. Our reps ramp fine without extra tools.`,
            time: '01:55',
            voiceId: getCustomerVoiceId('rushed-vp', customerAccent)
          },
          {
            id: 'turn-2-2',
            speaker: `${isArabic ? arabicFemale.name : 'Maria Santos'} (${isArabic ? arabicFemale.flag : filipinoFemale.flag} ${isArabic ? 'Arabic SDR' : 'Filipino SDR'})`,
            role: 'rep',
            text: 'Understood, David. But does your enablement team drill 40 unscripted voice objection scenarios before their first live dial?',
            time: '02:08',
            voiceId: isArabic ? arabicFemale.voiceId : filipinoFemale.voiceId
          },
          {
            id: 'turn-2-3',
            speaker: 'David M.',
            role: 'prospect',
            text: 'No, they mostly read slide decks and shadow top performers on Gong.',
            time: '02:18',
            voiceId: getCustomerVoiceId('rushed-vp', customerAccent)
          },
          {
            id: 'turn-2-4',
            speaker: `${isArabic ? arabicFemale.name : 'Maria Santos'} (${isArabic ? arabicFemale.flag : filipinoFemale.flag} ${isArabic ? 'Arabic SDR' : 'Filipino SDR'})`,
            role: 'rep',
            text: 'Shadowing is passive. When reps spar daily against our AI buyer personas, they hit quota in 12 days instead of 4 weeks.',
            time: '02:29',
            voiceId: isArabic ? arabicFemale.voiceId : filipinoFemale.voiceId
          },
          {
            id: 'turn-2-5',
            speaker: 'David M.',
            role: 'prospect',
            text: 'Twelve days? That would save us thirty thousand a month in ramp burn. Show me how it works.',
            time: '02:40',
            voiceId: getCustomerVoiceId('rushed-vp', customerAccent)
          }
        ]
      },
      {
        id: 'sess-3',
        line: 'LINE 03',
        repName: isArabic ? arabicMale.name : 'Angelo Cruz',
        repEmail: isArabic ? 'tariq.mansoor@horizonenergy.ae' : 'angelo.cruz@horizonsolar.ph',
        repGender: 'male',
        repAccent: isArabic ? `${arabicMale.flag} ${arabicMale.accentBadge}` : `${filipinoMale.flag} ${filipinoMale.accentBadge}`,
        avatar: isArabic ? 'TA' : 'AC',
        tenant: isArabic ? 'Horizon Energy Outbound Hub (Riyadh)' : 'Horizon Solar Outbound Floor',
        personaId: 'frugal-cfo',
        personaName: 'Rick Henderson',
        personaRole: 'Skeptical Homeowner ($450+ Power Bill)',
        personaDifficulty: 'Extreme',
        countryAccent: customerAccent,
        initialSeconds: 254,
        currentObjection: '“Take me off your list! You guys call every Tuesday with fake utility rebates!”',
        score: 79,
        sentiment: 'Hostile',
        wpm: 155,
        armStatus: { acknowledge: true, respond: false, move: false },
        recentTranscript: [
          {
            id: 'turn-3-1',
            speaker: 'Rick Henderson',
            role: 'prospect',
            text: 'Take me off your list! You guys call every Tuesday with fake utility rebates and I am sick of it!',
            time: '03:45',
            voiceId: getCustomerVoiceId('frugal-cfo', customerAccent)
          },
          {
            id: 'turn-3-2',
            speaker: `${isArabic ? arabicMale.name : 'Angelo Cruz'} (${isArabic ? arabicMale.flag : filipinoMale.flag} ${isArabic ? 'Arabic SDR' : 'Filipino SDR'})`,
            role: 'rep',
            text: 'I completely hear your frustration Rick, I hate spam calls too. I am only calling because our team verified your substation rate rose 24% last month.',
            time: '03:56',
            voiceId: isArabic ? arabicMale.voiceId : filipinoMale.voiceId
          },
          {
            id: 'turn-3-3',
            speaker: 'Rick Henderson',
            role: 'prospect',
            text: 'Twenty four percent? Wait, is that why my bill jumped to four hundred and fifty dollars?',
            time: '04:09',
            voiceId: getCustomerVoiceId('frugal-cfo', customerAccent)
          },
          {
            id: 'turn-3-4',
            speaker: `${isArabic ? arabicMale.name : 'Angelo Cruz'} (${isArabic ? arabicMale.flag : filipinoMale.flag} ${isArabic ? 'Arabic SDR' : 'Filipino SDR'})`,
            role: 'rep',
            text: 'Spot on Rick. If you have two minutes, I will show you the exact rate lock that protects your bill from the next rate hike.',
            time: '04:20',
            voiceId: isArabic ? arabicMale.voiceId : filipinoMale.voiceId
          }
        ]
      },
      {
        id: 'sess-4',
        line: 'LINE 04',
        repName: isArabic ? arabicFemale.name : 'Nicole Bautista',
        repEmail: isArabic ? 'noor.hassan@gulfcontact.ae' : 'nicole.b@harborpointbpo.ph',
        repGender: 'female',
        repAccent: isArabic ? `${arabicFemale.flag} ${arabicFemale.accentBadge}` : `${filipinoFemale.flag} ${filipinoFemale.accentBadge}`,
        avatar: isArabic ? 'NA' : 'NB',
        tenant: isArabic ? 'Gulf Contact Partner Hub (Dubai)' : 'Harbor Point Partner Hub',
        personaId: 'burned-director',
        personaName: 'Sarah Jenkins',
        personaRole: 'VP Operations (Global Contact Center)',
        personaDifficulty: 'Medium',
        countryAccent: customerAccent,
        initialSeconds: 118,
        currentObjection: '“Send me an email first, I am in back-to-back executive meetings.”',
        score: 91,
        sentiment: 'Skeptical',
        wpm: 140,
        armStatus: { acknowledge: true, respond: true, move: true },
        recentTranscript: [
          {
            id: 'turn-4-1',
            speaker: 'Sarah Jenkins',
            role: 'prospect',
            text: 'Can you just shoot over an email? I am walking into an executive board session right now.',
            time: '01:32',
            voiceId: getCustomerVoiceId('burned-director', customerAccent)
          },
          {
            id: 'turn-4-2',
            speaker: `${isArabic ? arabicFemale.name : 'Nicole Bautista'} (${isArabic ? arabicFemale.flag : filipinoFemale.flag} ${isArabic ? 'Arabic SDR' : 'Filipino SDR'})`,
            role: 'rep',
            text: 'Happy to send an email Sarah, but without knowing whether your priority this quarter is CS headcount or outbound retention, it will just be spam.',
            time: '01:44',
            voiceId: isArabic ? arabicFemale.voiceId : filipinoFemale.voiceId
          },
          {
            id: 'turn-4-3',
            speaker: 'Sarah Jenkins',
            role: 'prospect',
            text: 'Fair point. We are bleeding tier two reps right now. What specifically can you do for retention?',
            time: '01:55',
            voiceId: getCustomerVoiceId('burned-director', customerAccent)
          },
          {
            id: 'turn-4-4',
            speaker: `${isArabic ? arabicFemale.name : 'Nicole Bautista'} (${isArabic ? arabicFemale.flag : filipinoFemale.flag} ${isArabic ? 'Arabic SDR' : 'Filipino SDR'})`,
            role: 'rep',
            text: 'We drill live escalations so reps do not burn out on hostile calls. Let us carve out 7 minutes on Thursday morning. Does 9:30 AM work?',
            time: '02:08',
            voiceId: isArabic ? arabicFemale.voiceId : filipinoFemale.voiceId
          }
        ]
      }
    ];
  };

  // Active Sparring Lines on Floor
  const [sessions, setSessions] = useState<ActiveSparringSession[]>(() =>
    buildSessions(selectedRepAccent, selectedCustomerAccent)
  );

  // Sync sessions when customer accent changes dynamically
  const handleCustomerAccentChange = (newCountry: SparringCountry) => {
    setSelectedCustomerAccent(newCountry);

    setSessions(prevSessions =>
      prevSessions.map(session => {
        const newCustomerVoiceId = getCustomerVoiceId(session.personaId, newCountry);
        const updatedTranscript = session.recentTranscript.map(turn => {
          if (turn.role === 'prospect') {
            return {
              ...turn,
              voiceId: newCustomerVoiceId
            };
          }
          return turn;
        });

        return {
          ...session,
          countryAccent: newCountry,
          recentTranscript: updatedTranscript
        };
      })
    );

    // If currently listening to a session, update its active transcript and re-play current turn with new accent
    if (activeListeningSession) {
      const activeNewVoiceId = getCustomerVoiceId(activeListeningSession.personaId, newCountry);
      const updatedActiveTranscript = activeListeningSession.recentTranscript.map(turn => {
        if (turn.role === 'prospect') {
          return {
            ...turn,
            voiceId: activeNewVoiceId
          };
        }
        return turn;
      });

      const updatedActiveSession = {
        ...activeListeningSession,
        countryAccent: newCountry,
        recentTranscript: updatedActiveTranscript
      };

      setActiveListeningSession(updatedActiveSession);

      // If playing, immediately re-synthesize this turn with the newly selected accent!
      if (isAudioPlaying && currentTurnIndex !== null) {
        playTurn(updatedActiveSession, currentTurnIndex);
      }
    }
  };

  // Switch Rep Accent Voice Dynamically (Arabic vs Filipino)
  const handleRepAccentChange = (accent: RepAccentKey) => {
    setSelectedRepAccent(accent);

    setSessions(prev =>
      prev.map((s, idx) => {
        const fresh = buildSessions(accent, s.countryAccent)[idx];
        return {
          ...s,
          repName: fresh.repName,
          repEmail: fresh.repEmail,
          repAccent: fresh.repAccent,
          avatar: fresh.avatar,
          tenant: fresh.tenant,
          recentTranscript: fresh.recentTranscript
        };
      })
    );

    if (activeListeningSession) {
      const freshActive = buildSessions(accent, activeListeningSession.countryAccent).find(
        s => s.id === activeListeningSession.id
      );
      if (freshActive) {
        const updatedActive = {
          ...activeListeningSession,
          repName: freshActive.repName,
          repEmail: freshActive.repEmail,
          repAccent: freshActive.repAccent,
          avatar: freshActive.avatar,
          tenant: freshActive.tenant,
          recentTranscript: freshActive.recentTranscript
        };
        setActiveListeningSession(updatedActive);

        if (isAudioPlaying && currentTurnIndex !== null) {
          playTurn(updatedActive, currentTurnIndex);
        }
      }
    }
  };

  // Real-time dialer ticking clock for active lines
  useEffect(() => {
    const timer = setInterval(() => {
      setSessions(prev =>
        prev.map(s => ({
          ...s,
          initialSeconds: s.initialSeconds + 1
        }))
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDuration = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    const secs = (totalSecs % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // Pre-fetch a turn's ElevenLabs audio into memory cache. ElevenLabs is the only voice engine:
  // on failure this returns the reason, and the panel shows "Voice unavailable, retry".
  const voiceErrorsRef = useRef<Map<string, { code: string | null; message: string }>>(new Map());
  const fetchAudioBlob = useCallback(async (turn: DialogueTurn): Promise<string | null> => {
    const cacheKey = `${turn.id}_${turn.voiceId}`;
    if (audioCacheRef.current.has(cacheKey)) {
      return audioCacheRef.current.get(cacheKey)!;
    }
    voiceErrorsRef.current.set(cacheKey, { code: 'network', message: voiceErrorMessage('network') });

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: turn.text,
          voiceId: turn.voiceId,
          modelId: ELEVENLABS_MODELS.expressive, // Eleven v4 Turbo: expressive, natural phone accents; turns are pre-fetched
          voiceSettings: {
            stability: turn.role === 'rep' ? 0.52 : 0.45,
            similarity_boost: 0.75,
            style: turn.role === 'rep' ? 0.05 : 0.12
          }
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.audio) {
        const code = typeof data.code === 'string' ? data.code : null;
        voiceErrorsRef.current.set(cacheKey, { code, message: typeof data.error === 'string' && data.error ? data.error : voiceErrorMessage(code) });
        console.warn(`[LiveMonitoring] ElevenLabs TTS failed (${res.status}, ${code ?? 'no code'})`);
        return null;
      }

      // Convert base64 data to native audio/mpeg blob URL
      const base64Data = data.audio.replace(/^data:audio\/[^;]+;base64,/, '');
      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const audioBlob = new Blob([bytes.buffer], { type: 'audio/mpeg' });
      const blobUrl = URL.createObjectURL(audioBlob);
      audioCacheRef.current.set(cacheKey, blobUrl);
      voiceErrorsRef.current.delete(cacheKey);
      return blobUrl;
    } catch (err) {
      console.error('[LiveMonitoring] Failed to fetch turn audio:', err);
      return null;
    }
  }, []);

  // Pre-fetch adjacent turns in the background
  const prefetchAdjacentTurns = useCallback((session: ActiveSparringSession, currentIndex: number) => {
    const nextTurn = session.recentTranscript[currentIndex + 1];
    if (nextTurn) {
      fetchAudioBlob(nextTurn).catch(() => {});
    }
  }, [fetchAudioBlob]);

  // Play a specific turn index in the active session
  const playTurn = useCallback(async (session: ActiveSparringSession, turnIndex: number) => {
    if (turnIndex < 0 || turnIndex >= session.recentTranscript.length) {
      setIsAudioPlaying(false);
      setCurrentTurnIndex(null);
      return;
    }

    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }

    setCurrentTurnIndex(turnIndex);
    setIsLoadingAudio(true);

    const turn = session.recentTranscript[turnIndex];
    prefetchAdjacentTurns(session, turnIndex);

    const audioUrl = await fetchAudioBlob(turn);
    setIsLoadingAudio(false);

    if (!activeSessionRef.current || activeSessionRef.current.id !== session.id) {
      return;
    }
    if (!audioUrl) {
      const err = voiceErrorsRef.current.get(`${turn.id}_${turn.voiceId}`);
      setVoiceIssue({ turnIndex, code: err?.code ?? null, message: err?.message || voiceErrorMessage(err?.code) });
      setIsAudioPlaying(false);
      return;
    }
    setVoiceIssue(null);

    // Release any previous audio element before playing next turn
    if (audioElementRef.current) {
      try {
        audioElementRef.current.pause();
        audioElementRef.current.currentTime = 0;
        audioElementRef.current.src = '';
      } catch {}
    }

    const audio = new Audio(audioUrl);
    audioElementRef.current = audio;
    audio.volume = isAudioMuted ? 0 : volume / 100;
    audio.muted = isAudioMuted;

    audio.onended = () => {
      // Natural human gap between speakers (420ms)
      pendingTimerRef.current = setTimeout(() => {
        if (activeSessionRef.current?.id === session.id && isPlayingRef.current) {
          const nextIdx = turnIndex + 1;
          if (nextIdx < session.recentTranscript.length) {
            playTurn(session, nextIdx);
          } else {
            // Smooth conversational loop back to start after a brief 1.5s natural pause
            pendingTimerRef.current = setTimeout(() => {
              if (activeSessionRef.current?.id === session.id && isPlayingRef.current) {
                playTurn(session, 0);
              }
            }, 1500);
          }
        }
      }, 420);
    };

    audio.onerror = (e) => {
      console.warn('[LiveMonitoring] Audio playback error:', e);
      setIsAudioPlaying(false);
    };

    try {
      await audio.play();
      setIsAudioPlaying(true);
    } catch (err) {
      console.warn('[LiveMonitoring] audio.play() blocked or failed:', err);
      setIsAudioPlaying(false);
    }
  }, [fetchAudioBlob, prefetchAdjacentTurns, isAudioMuted, volume]);

  // Toggle "Listen Live" on a session
  const handleToggleListen = (session: ActiveSparringSession) => {
    if (activeListeningSession?.id === session.id) {
      handleDisconnect();
      return;
    }

    if (audioElementRef.current) {
      audioElementRef.current.pause();
    }
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }

    // Synchronously prime/unlock browser audio permissions
    if (!audioElementRef.current) {
      audioElementRef.current = new Audio(SILENT_WAV);
    } else {
      audioElementRef.current.src = SILENT_WAV;
    }
    audioElementRef.current.play().catch(() => {});

    setActiveListeningSession(session);
    setIsAudioPlaying(true);
    playTurn(session, 0);
  };

  // Open a session in the docked panel (same as Listen) and focus the whisper input
  const handleOpenWhisper = (session: ActiveSparringSession) => {
    if (activeListeningSession?.id !== session.id) {
      handleToggleListen(session);
    }
    pendingWhisperFocusRef.current = true;
    setWhisperFocusRequest((n) => n + 1);
  };

  useEffect(() => {
    const el = whisperInputRef.current;
    if (!pendingWhisperFocusRef.current || !el) return;
    pendingWhisperFocusRef.current = false;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [whisperFocusRequest, activeListeningSession]);

  // Disconnect audio monitor
  const handleDisconnect = () => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.src = SILENT_WAV;
    }
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    setActiveListeningSession(null);
    setCurrentTurnIndex(null);
    setIsAudioPlaying(false);
    setIsLoadingAudio(false);
    setVoiceIssue(null);
  };

  // Pause / Resume audio
  const handleTogglePlayPause = () => {
    if (!activeListeningSession) return;

    if (isAudioPlaying) {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      setIsAudioPlaying(false);
    } else {
      setIsAudioPlaying(true);
      const targetIndex = currentTurnIndex !== null ? currentTurnIndex : 0;
      playTurn(activeListeningSession, targetIndex);
    }
  };

  // Replay from beginning
  const handleReplay = () => {
    if (!activeListeningSession) return;
    setIsAudioPlaying(true);
    playTurn(activeListeningSession, 0);
  };

  // Play next turn
  const handleNextTurn = () => {
    if (!activeListeningSession) return;
    const nextIdx = (currentTurnIndex ?? -1) + 1;
    if (nextIdx < activeListeningSession.recentTranscript.length) {
      playTurn(activeListeningSession, nextIdx);
    }
  };

  // Play a specific turn on click in transcript
  const handleSelectTurn = (index: number) => {
    if (!activeListeningSession) return;
    setIsAudioPlaying(true);
    playTurn(activeListeningSession, index);
  };

  // High-Tech Supervisor Whisper HUD Injection (Spoken by Filipino SDR)
  const handleSendWhisper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whisperMessage.trim() || !activeListeningSession) return;

    const coachingText = whisperMessage.trim();
    setWhisperFeedbackSent(true);

    // AudioContext chime
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } catch {}

    // Coached response voiced by selected Rep Accent
    const currentRepProfile = getRepVoice(selectedRepAccent, activeListeningSession.repGender);

    const coachedTurn: DialogueTurn = {
      id: `whisper-${Date.now()}`,
      speaker: `${activeListeningSession.repName} (${currentRepProfile.flag} ${currentRepProfile.accentLabel} - HUD Coached)`,
      role: 'rep',
      text: `“Understood ${activeListeningSession.personaName.split(' ')[0]}. My supervisor just alerted my cockpit—${coachingText}”`,
      time: 'LIVE NOW',
      voiceId: currentRepProfile.voiceId
    };

    const updatedTranscript = [...activeListeningSession.recentTranscript, coachedTurn];
    const updatedSession = { ...activeListeningSession, recentTranscript: updatedTranscript };
    
    setActiveListeningSession(updatedSession);
    setSessions(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));
    setWhisperMessage('');

    setTimeout(() => {
      setWhisperFeedbackSent(false);
    }, 2500);

    playTurn(updatedSession, updatedTranscript.length - 1);
  };

  // Filter sessions (client workspaces have no sample calls: only real live calls would appear)
  const visibleSessions = isDemo ? sessions : [];
  const filteredSessions = visibleSessions.filter(s => {
    const matchQuery = s.repName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                       s.personaName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                       s.tenant.toLowerCase().includes(searchQuery.toLowerCase());
    const matchSentiment = sentimentFilter === 'all' || s.sentiment === sentimentFilter;
    const matchTenant = tenantFilter === 'all' || s.tenant === tenantFilter;
    return matchQuery && matchSentiment && matchTenant;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full pb-16">

      {/* Header */}
      <PageHeader
        className="pb-0"
        title="Live floor"
        count={visibleSessions.length}
        description={isDemo
          ? `Listen in on live practice calls and whisper coaching to ${selectedRepAccent === 'arabic' ? 'Arabic accent' : 'Filipino'} reps.`
          : 'Listen in on your reps\' live practice calls and whisper coaching.'}
        meta={<ElevenLabsAttribution variant="pill" />}
        secondaryActions={
          <>
            <Link href="/practice" className={buttonClasses('secondary', 'md')}>
              <Headphones aria-hidden />
              <span>Sparring Arena</span>
            </Link>
            <Link href="/admin" className={buttonClasses('ghost', 'md')}>
              <ShieldCheck aria-hidden />
              <span>Admin</span>
            </Link>
          </>
        }
      />

      {/* Floor summary: one quiet stat line */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-small text-fg-secondary">
        <StatusDot tone={visibleSessions.length > 0 ? 'success' : 'neutral'} live={visibleSessions.length > 0} label={<span className="text-body-strong tabular-nums text-fg">{visibleSessions.length} live</span>} />
        <span aria-hidden className="text-fg-disabled">&middot;</span>
        {isDemo && (
          <>
            <StatusDot tone="danger" label={<span className="text-small text-fg-secondary tabular-nums">1 hostile</span>} />
            <StatusDot tone="warning" label={<span className="text-small text-fg-secondary tabular-nums">2 skeptical</span>} />
            <StatusDot tone="success" label={<span className="text-small text-fg-secondary tabular-nums">1 engaged</span>} />
            <span aria-hidden className="text-fg-disabled">&middot;</span>
            <span>
              {selectedRepAccent === 'arabic' ? 'Arabic accent reps (Noor and Tariq)' : 'Filipino reps (Lovely and Paolo)'}
            </span>
            <span aria-hidden className="text-fg-disabled">&middot;</span>
          </>
        )}
        <span>
          Buyer accent: <span className="text-fg">{selectedCustomerAccent === 'USA' ? 'USA' : selectedCustomerAccent === 'Australia' ? 'Australia' : 'UK'}</span>
        </span>
        <span aria-hidden className="text-fg-disabled">&middot;</span>
        <ElevenLabsAttribution label="Voice:" detail={elevenLabsModelLabel(ELEVENLABS_MODELS.expressive)} className="text-small" />
      </div>

      {/* Search, filters and voice settings */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line pb-4">
        <div className="flex-1 min-w-60 sm:max-w-sm">
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search rep, buyer or client..."
            leadingIcon={<Search />}
            aria-label="Search live calls"
          />
        </div>

        <div className="w-48">
          <Select
            value={sentimentFilter}
            onChange={(e) => setSentimentFilter(e.target.value as any)}
            aria-label="Buyer sentiment"
          >
            <option value="all">All sentiments</option>
            <option value="Hostile">Hostile</option>
            <option value="Skeptical">Skeptical</option>
            <option value="Engaged">Engaged</option>
          </Select>
        </div>

        <div className="w-52">
          <Select
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
            aria-label="Client"
          >
            <option value="all">All clients</option>
            {isDemo ? (
              <>
                <option value="Apex Global BPO (Manila)">Apex Global (Manila)</option>
                <option value="Fintech Scaleups (Cebu)">Fintech Scaleups (Cebu)</option>
                <option value="Horizon Solar Outbound Floor">Horizon Solar</option>
                <option value="Harbor Point Partner Hub">Harbor Point Partner Hub</option>
              </>
            ) : (
              tenantName && <option value={tenantName}>{tenantName}</option>
            )}
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-3 lg:ml-auto">
          {/* Rep voice switcher (Arabic vs Filipino) */}
          <div role="group" aria-label="Rep accent" className="inline-flex items-center rounded-md border border-line bg-subtle p-0.5">
            <span className="px-2 text-small text-fg-secondary">Rep</span>
            <button
              onClick={() => handleRepAccentChange('arabic')}
              aria-pressed={selectedRepAccent === 'arabic'}
              className={segmentClass(selectedRepAccent === 'arabic')}
              title="Switch Rep Voice to Arabic Accent (Dubai / Middle East Hub)"
            >
              Arabic
            </button>
            <button
              onClick={() => handleRepAccentChange('filipino')}
              aria-pressed={selectedRepAccent === 'filipino'}
              className={segmentClass(selectedRepAccent === 'filipino')}
              title="Switch Rep Voice to Filipino Accent (Manila / Ortigas Hub)"
            >
              Filipino
            </button>
          </div>

          {/* Customer accent switcher */}
          <div role="group" aria-label="Buyer accent" className="inline-flex items-center rounded-md border border-line bg-subtle p-0.5">
            <span className="px-2 text-small text-fg-secondary">Buyer</span>
            <button
              onClick={() => handleCustomerAccentChange('USA')}
              aria-pressed={selectedCustomerAccent === 'USA'}
              className={segmentClass(selectedCustomerAccent === 'USA')}
              title="Switch Customer Voice to American Accent"
            >
              USA
            </button>
            <button
              onClick={() => handleCustomerAccentChange('Australia')}
              aria-pressed={selectedCustomerAccent === 'Australia'}
              className={segmentClass(selectedCustomerAccent === 'Australia')}
              title="Switch Customer Voice to Australian Accent"
            >
              Australia
            </button>
            <button
              onClick={() => handleCustomerAccentChange('UK')}
              aria-pressed={selectedCustomerAccent === 'UK'}
              className={segmentClass(selectedCustomerAccent === 'UK')}
              title="Switch Customer Voice to British Accent"
            >
              UK
            </button>
          </div>
        </div>
      </div>

      {/* Live call grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-small text-fg-secondary">
          <span>
            Showing <span className="tabular-nums text-fg">{filteredSessions.length}</span> {selectedRepAccent === 'arabic' ? 'Arabic accent' : 'Filipino'} reps on live practice calls
          </span>
          <span className="hidden sm:inline text-fg-tertiary">
            Listen to hear {selectedRepAccent === 'arabic' ? 'an Arabic' : 'a Filipino'} rep with a {selectedCustomerAccent} buyer
          </span>
        </div>

        {visibleSessions.length === 0 && (
          <div className="rounded-lg border border-line bg-surface shadow-xs">
            <EmptyState
              icon={<Headphones />}
              title="No live calls right now"
              description="When your reps are on practice calls, they appear here so you can listen in and coach."
              action={
                <Link href="/practice" className={buttonClasses('secondary', 'sm')}>
                  Open the Sparring Arena
                </Link>
              }
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSessions.map((session) => {
            const isListening = activeListeningSession?.id === session.id;
            const isCurrentlyPlaying = isListening && isAudioPlaying;

            return (
              <div
                key={session.id}
                className={`bg-surface border rounded-lg p-5 shadow-xs space-y-4 transition-colors duration-150 ${
                  isListening
                    ? 'border-action ring-1 ring-action'
                    : 'border-line hover:border-line-strong'
                }`}
              >
                {/* Rep and buyer header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-subtle text-body-strong text-fg-secondary">
                      {session.avatar}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-h3 text-fg truncate">{session.repName}</h2>
                        <span className="font-mono text-caption text-fg-tertiary">{session.line}</span>
                      </div>
                      <p className="text-small text-fg-secondary mt-0.5">
                        with <span className="text-fg">{session.personaName}</span>, {session.countryAccent === 'USA' ? 'USA' : session.countryAccent === 'Australia' ? 'Australia' : 'UK'} accent
                      </p>
                      <p className="text-small text-fg-tertiary truncate">
                        {session.tenant} &middot; {selectedRepAccent === 'arabic' ? 'Arabic SDR' : 'Filipino SDR'}
                      </p>
                    </div>
                  </div>

                  {/* Status and timer */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusDot
                      tone={isCurrentlyPlaying ? 'brand' : 'success'}
                      live
                      label={
                        <span className="text-small tabular-nums text-fg">
                          {isCurrentlyPlaying ? 'You are listening' : `Live ${formatDuration(session.initialSeconds)}`}
                        </span>
                      }
                    />
                    <span className="text-small text-fg-tertiary">
                      Difficulty: <span className="text-fg-secondary">{session.personaDifficulty}</span>
                    </span>
                  </div>
                </div>

                {/* Current objection */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-small">
                    <span className="text-fg-tertiary">Buyer objection</span>
                    <span className="flex items-center gap-2">
                      <StatusDot
                        tone={session.sentiment === 'Hostile' ? 'danger' : session.sentiment === 'Skeptical' ? 'warning' : 'success'}
                        label={<span className="text-small text-fg">{session.sentiment}</span>}
                      />
                      <span className="tabular-nums text-fg-tertiary">{session.wpm} wpm</span>
                    </span>
                  </div>
                  <p className="border-l-2 border-line-strong pl-3 text-body text-fg-secondary">
                    {session.currentObjection}
                  </p>
                </div>

                {/* Objection handling steps (A.R.M.) */}
                <div className="flex items-center gap-3 text-small">
                  <Tooltip content="A.R.M.: Acknowledge the objection, Respond to it, then Move to a next step.">
                    <span className="text-fg-tertiary cursor-default">Steps</span>
                  </Tooltip>
                  <ol className="flex items-center gap-3">
                    {([
                      ['Acknowledge', session.armStatus.acknowledge],
                      ['Respond', session.armStatus.respond],
                      ['Move', session.armStatus.move],
                    ] as const).map(([stepLabel, done]) => (
                      <li key={stepLabel} className={`inline-flex items-center gap-1.5 ${done ? 'text-fg' : 'text-fg-tertiary'}`}>
                        {done ? (
                          <CheckCircle2 className="size-4 text-success-fg" aria-hidden />
                        ) : (
                          <span className="size-4 rounded-full border border-line-strong" aria-hidden />
                        )}
                        <span>{stepLabel}</span>
                        <span className="sr-only">{done ? '(done)' : '(not yet)'}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Audio level and listen button */}
                <div className="pt-4 border-t border-line flex items-center justify-between gap-3">
                  <div className="flex items-end gap-1 h-6" aria-hidden>
                    <span className={`w-1 rounded-full transition-all duration-150 ${isCurrentlyPlaying ? 'h-5 bg-success-500 animate-pulse-soft' : 'h-2 bg-ink-300'}`} />
                    <span className={`w-1 rounded-full transition-all duration-150 ${isCurrentlyPlaying ? 'h-6 bg-success-500 animate-pulse-soft' : 'h-3 bg-ink-300'}`} />
                    <span className={`w-1 rounded-full transition-all duration-150 ${isCurrentlyPlaying ? 'h-4 bg-success-500 animate-pulse-soft' : 'h-2 bg-ink-300'}`} />
                    <span className={`w-1 rounded-full transition-all duration-150 ${isCurrentlyPlaying ? 'h-6 bg-success-500 animate-pulse-soft' : 'h-3 bg-ink-300'}`} />
                    <span className={`w-1 rounded-full transition-all duration-150 ${isCurrentlyPlaying ? 'h-3 bg-success-500 animate-pulse-soft' : 'h-1.5 bg-ink-300'}`} />
                  </div>

                  <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenWhisper(session)}
                    icon={<MessageSquareText aria-hidden />}
                    aria-label={`Whisper to ${session.repName}`}
                  >
                    Whisper
                  </Button>
                  <Button
                    variant={isListening ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => handleToggleListen(session)}
                    icon={
                      isLoadingAudio && isListening ? (
                        <Loader2 className="animate-spin" aria-hidden />
                      ) : (
                        <Headphones aria-hidden />
                      )
                    }
                  >
                    {isListening ? 'Stop listening' : 'Listen'}
                  </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Docked supervisor audio player and whisper console (dark focus surface) */}
      {activeListeningSession && (
        <div className="rounded-xl bg-ink-950 p-6 text-ink-50 shadow-lg space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Player header */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-ink-800 pb-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-ink-800 text-ink-50">
                <Radio className={`size-5 ${isAudioPlaying ? 'text-brand-500 animate-pulse-soft' : ''}`} aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-400">
                  <span className="inline-flex items-center gap-2">
                    <span className={`size-2 rounded-full ${isAudioPlaying ? 'bg-brand-500 animate-pulse-soft' : 'bg-success-500'}`} aria-hidden />
                    <span>Listening on <span className="font-mono text-ink-50">{activeListeningSession.line}</span></span>
                  </span>
                  <span>{selectedRepAccent === 'arabic' ? 'Arabic SDR voice' : 'Filipino SDR voice'}</span>
                  <span>Buyer accent: {activeListeningSession.countryAccent}</span>
                  <ElevenLabsAttribution label="Voice:" detail={elevenLabsModelLabel(ELEVENLABS_MODELS.expressive)} onDark className="text-small" />

                  {isLoadingAudio && (
                    <span className="inline-flex items-center gap-1.5 text-ink-50">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      <span>Loading voice...</span>
                    </span>
                  )}
                </div>
                <h2 className="text-h3 text-ink-50 mt-1">
                  {activeListeningSession.repName} ({selectedRepAccent === 'arabic' ? 'Arabic SDR' : 'Filipino SDR'}) with {activeListeningSession.personaName} ({activeListeningSession.personaRole})
                </h2>
              </div>
            </div>

            {/* Playback controls, accent quick toggles and volume */}
            <div className="flex flex-wrap items-center gap-2">

              {/* Rep voice quick switch */}
              <div role="group" aria-label="Rep accent" className="inline-flex items-center rounded-md border border-ink-800 bg-ink-900 p-0.5">
                <span className="text-small text-ink-400 px-2 hidden sm:inline">Rep</span>
                <button
                  onClick={() => handleRepAccentChange('arabic')}
                  aria-pressed={selectedRepAccent === 'arabic'}
                  className={darkSegmentClass(selectedRepAccent === 'arabic')}
                  title="Arabic Accent SDR Rep (Dubai / Riyadh Hub)"
                >
                  Arabic
                </button>
                <button
                  onClick={() => handleRepAccentChange('filipino')}
                  aria-pressed={selectedRepAccent === 'filipino'}
                  className={darkSegmentClass(selectedRepAccent === 'filipino')}
                  title="Filipino Accent SDR Rep (Manila / Ortigas Hub)"
                >
                  Filipino
                </button>
              </div>

              {/* Buyer accent quick switch */}
              <div role="group" aria-label="Buyer accent" className="inline-flex items-center rounded-md border border-ink-800 bg-ink-900 p-0.5">
                <span className="text-small text-ink-400 px-2 hidden sm:inline">Buyer</span>
                {(['USA', 'Australia', 'UK'] as SparringCountry[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => handleCustomerAccentChange(c)}
                    aria-pressed={activeListeningSession.countryAccent === c}
                    className={darkSegmentClass(activeListeningSession.countryAccent === c)}
                  >
                    {c === 'USA' ? 'US' : c === 'Australia' ? 'AU' : 'UK'}
                  </button>
                ))}
              </div>

              {/* Play / pause */}
              <button
                onClick={handleTogglePlayPause}
                className={`${darkButtonClass} px-3 gap-1.5 text-small font-medium`}
                title={isAudioPlaying ? 'Pause Stream' : 'Play Stream'}
              >
                {isAudioPlaying ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                <span>{isAudioPlaying ? 'Pause' : 'Play'}</span>
              </button>

              {/* Replay dialogue */}
              <button
                onClick={handleReplay}
                className={`${darkButtonClass} w-8`}
                title="Replay from Beginning"
                aria-label="Replay from beginning"
              >
                <RotateCcw className="size-4" aria-hidden />
              </button>

              {/* Next turn */}
              <button
                onClick={handleNextTurn}
                className={`${darkButtonClass} w-8`}
                title="Skip to Next Speaker"
                aria-label="Skip to next speaker"
              >
                <SkipForward className="size-4" aria-hidden />
              </button>

              {/* Volume */}
              <div className="flex items-center gap-2 text-small text-ink-400 pl-2 border-l border-ink-800">
                <button
                  onClick={() => setIsAudioMuted(!isAudioMuted)}
                  className={`${darkButtonClass} w-8 border-transparent`}
                  aria-label={isAudioMuted ? 'Unmute' : 'Mute'}
                >
                  {isAudioMuted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={isAudioMuted ? 0 : volume}
                  onChange={(e) => {
                    setVolume(Number(e.target.value));
                    setIsAudioMuted(false);
                  }}
                  aria-label="Volume"
                  className="w-16 sm:w-20 accent-ink-50 cursor-pointer"
                />
                <span className="w-9 text-right tabular-nums">{isAudioMuted ? '0%' : `${volume}%`}</span>
              </div>

              {/* Close */}
              <button
                onClick={handleDisconnect}
                className={`${darkButtonClass} w-8 ml-1`}
                title="Disconnect Audio Bus"
                aria-label="Stop listening"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>

          {voiceIssue && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-warning-bg px-3 py-2 text-small text-warning-fg">
              <span className="inline-flex items-center gap-1.5">
                <AlertCircle className="size-4 shrink-0" aria-hidden />
                <span>
                  <span className="font-medium">Voice unavailable.</span> {voiceIssue.message} The transcript below is still live.
                </span>
              </span>
              {isRetryableVoiceError(voiceIssue.code) && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<RotateCcw aria-hidden />}
                  onClick={() => {
                    setIsAudioPlaying(true);
                    playTurn(activeListeningSession, voiceIssue.turnIndex);
                  }}
                >
                  Retry voice
                </Button>
              )}
            </div>
          )}

          {/* Transcript and whisper console */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* Transcript (8 cols) */}
            <div className="lg:col-span-8 rounded-lg bg-ink-900 p-4 space-y-3 max-h-84 overflow-y-auto">
              <div className="flex items-center justify-between gap-2 text-small text-ink-400">
                <span>
                  {selectedRepAccent === 'arabic' ? 'Arabic SDR' : 'Filipino SDR'} with {activeListeningSession.countryAccent === 'USA' ? 'US buyer' : activeListeningSession.countryAccent === 'Australia' ? 'Australian buyer' : 'UK buyer'}
                </span>
                <span>Click a line to jump to it</span>
              </div>

              <div className="space-y-2">
                {activeListeningSession.recentTranscript.map((turn, idx) => {
                  const isRep = turn.role === 'rep';
                  const isCurrentTurn = currentTurnIndex === idx;

                  return (
                    <div
                      key={turn.id || idx}
                      onClick={() => handleSelectTurn(idx)}
                      className={`p-3 rounded-md border transition-colors duration-150 cursor-pointer ${
                        isCurrentTurn
                          ? 'border-ink-50/40 bg-ink-800 text-ink-50'
                          : isRep
                            ? 'border-transparent text-ink-400 hover:bg-ink-800'
                            : 'border-transparent text-ink-50 hover:bg-ink-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-caption mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-ink-400">
                            {isRep
                              ? (selectedRepAccent === 'arabic' ? 'Arabic SDR' : 'Filipino SDR')
                              : `${activeListeningSession.countryAccent} buyer`}
                          </span>
                          <span className="text-ink-50 truncate">
                            {turn.speaker}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isCurrentTurn && isAudioPlaying && (
                            <span className="inline-flex items-center gap-1.5 text-ink-50">
                              <span className="size-1.5 rounded-full bg-success-500 animate-pulse-soft" aria-hidden />
                              <span>Speaking now</span>
                            </span>
                          )}
                          <span className="text-ink-400 tabular-nums">{turn.time}</span>
                        </div>
                      </div>

                      <p className="text-body">
                        {turn.text}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Whisper console (4 cols) */}
            <div className="lg:col-span-4 rounded-lg bg-ink-900 p-4 space-y-3">
              <div>
                <h3 className="text-h3 text-ink-50">
                  Whisper to {activeListeningSession.repName}
                </h3>
                <p className="text-small text-ink-400 mt-1">
                  Send a coaching cue to the rep&rsquo;s screen. The {selectedRepAccent === 'arabic' ? 'Arabic SDR' : 'Filipino SDR'} voices the coached line straight away.
                </p>
              </div>

              <form onSubmit={handleSendWhisper} className="space-y-3">
                <textarea
                  ref={whisperInputRef}
                  rows={3}
                  value={whisperMessage}
                  onChange={(e) => setWhisperMessage(e.target.value)}
                  placeholder="e.g. Pivot to zero-prep guarantee! Remind them we pull tech-stack profiles beforehand."
                  aria-label="Whisper message"
                  className="focus-ring w-full rounded-sm border border-ink-700 bg-ink-950 px-3 py-2 text-body text-ink-50 placeholder:text-ink-400 focus:border-brand-500 resize-none"
                />

                <div className="flex items-center justify-between gap-2">
                  {whisperFeedbackSent ? (
                    <span className="text-small text-ink-50 flex items-center gap-1.5">
                      <CheckCircle2 className="size-4 text-success-500" aria-hidden />
                      <span>Voiced in {selectedRepAccent === 'arabic' ? 'Arabic' : 'Filipino'} accent</span>
                    </span>
                  ) : (
                    <span className="text-small text-ink-400">Shows on the rep&rsquo;s teleprompter</span>
                  )}

                  <Button
                    type="submit"
                    variant="brand"
                    size="sm"
                    icon={<Send aria-hidden />}
                  >
                    Whisper
                  </Button>
                </div>
              </form>

              {/* Voice channels */}
              <div className="rounded-md border border-ink-800 p-3 space-y-1.5 text-small">
                <div className="flex items-center justify-between text-ink-400">
                  <span>Voices</span>
                  <span className="inline-flex items-center gap-1.5 text-ink-50">
                    <span className="size-1.5 rounded-full bg-success-500" aria-hidden />
                    <span>Active</span>
                  </span>
                </div>
                {(() => {
                  const repVoice = getRepVoice(selectedRepAccent, activeListeningSession.repGender);
                  return (
                    <div className="text-ink-400 flex items-center gap-1.5">
                      <span>{repVoice.flag}</span>
                      <span>
                        Rep: <span className="text-ink-50">{activeListeningSession.repName} ({repVoice.accentLabel})</span>
                      </span>
                    </div>
                  );
                })()}
                <div className="text-ink-400 flex items-center gap-1.5">
                  <span>Buyer: <span className="text-ink-50">{activeListeningSession.personaName} ({activeListeningSession.countryAccent} accent)</span></span>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

/* Styling helpers (visual only) */
function segmentClass(active: boolean) {
  return `focus-ring inline-flex h-7 items-center rounded-[6px] px-2.5 text-small font-medium transition-colors duration-150 cursor-pointer ${
    active ? 'bg-surface text-fg shadow-xs' : 'text-fg-secondary hover:text-fg'
  }`;
}

function darkSegmentClass(active: boolean) {
  return `focus-ring inline-flex h-7 items-center rounded-[6px] px-2.5 text-small font-medium transition-colors duration-150 cursor-pointer ${
    active ? 'bg-ink-50 text-ink-900' : 'text-ink-400 hover:text-ink-50'
  }`;
}

const darkButtonClass =
  'focus-ring inline-flex h-8 items-center justify-center rounded-md border border-ink-700 text-ink-50 hover:bg-ink-800 transition-colors duration-150 cursor-pointer';
