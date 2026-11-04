'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { 
  Radio, 
  Headphones, 
  Users, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  Clock, 
  Send, 
  Search, 
  CheckCircle2, 
  ShieldCheck, 
  X, 
  PhoneCall,
  Activity,
  MessageSquare,
  Flame,
  Globe,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Loader2
} from 'lucide-react';
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
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [volume, setVolume] = useState(85);
  
  // Whisper coach state
  const [whisperMessage, setWhisperMessage] = useState('');
  const [whisperFeedbackSent, setWhisperFeedbackSent] = useState(false);

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
        currentObjection: '“We already buy shared leads from Outsource Accelerator. Why pay for private data?”',
        score: 88,
        sentiment: 'Engaged',
        wpm: 142,
        armStatus: { acknowledge: true, respond: true, move: false },
        recentTranscript: [
          {
            id: 'turn-1-1',
            speaker: 'Julian Vance',
            role: 'prospect',
            text: `We already buy shared lead packs from Outsource Accelerator, ${isArabic ? 'Tariq' : 'Paolo'}. Why on earth would I pay for additional software?`,
            time: '03:15',
            voiceId: getCustomerVoiceId('bpo-directory-buyer', customerAccent)
          },
          {
            id: 'turn-1-2',
            speaker: `${isArabic ? arabicMale.name : filipinoMale.name} (${isArabic ? arabicMale.flag : filipinoMale.flag} ${isArabic ? 'Arabic SDR' : 'Filipino SDR'})`,
            role: 'rep',
            text: 'Totally fair, Julian. But OA sells those identical leads to 3 to 5 other BPOs simultaneously, so you end up in eight dollar per hour price wars.',
            time: '03:26',
            voiceId: isArabic ? arabicMale.voiceId : filipinoMale.voiceId
          },
          {
            id: 'turn-1-3',
            speaker: 'Julian Vance',
            role: 'prospect',
            text: 'That is actually true. Our margins have taken a beating on those directory accounts. What are you doing differently?',
            time: '03:38',
            voiceId: getCustomerVoiceId('bpo-directory-buyer', customerAccent)
          },
          {
            id: 'turn-1-4',
            speaker: `${isArabic ? arabicMale.name : filipinoMale.name} (${isArabic ? arabicMale.flag : filipinoMale.flag} ${isArabic ? 'Arabic SDR' : 'Filipino SDR'})`,
            role: 'rep',
            text: 'We give you exclusive, verified tech-founder triggers before OA even lists them. Can I show you three live accounts right now?',
            time: '03:49',
            voiceId: isArabic ? arabicMale.voiceId : filipinoMale.voiceId
          },
          {
            id: 'turn-1-5',
            speaker: 'Julian Vance',
            role: 'prospect',
            text: `Alright ${isArabic ? 'Tariq' : 'Paolo'}, pull them up on screen. If they are genuinely exclusive, you have got my attention.`,
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
        repEmail: isArabic ? 'noor.hassan@gulfcontact.ae' : 'nicole.b@oa-partner.ph',
        repGender: 'female',
        repAccent: isArabic ? `${arabicFemale.flag} ${arabicFemale.accentBadge}` : `${filipinoFemale.flag} ${filipinoFemale.accentBadge}`,
        avatar: isArabic ? 'NA' : 'NB',
        tenant: isArabic ? 'Gulf Contact Partner Hub (Dubai)' : 'Outsource Accelerator Partner Hub',
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

  // Pre-fetch a turn's ElevenLabs audio into memory cache
  const fetchAudioBlob = useCallback(async (turn: DialogueTurn): Promise<string | null> => {
    const cacheKey = `${turn.id}_${turn.voiceId}`;
    if (audioCacheRef.current.has(cacheKey)) {
      return audioCacheRef.current.get(cacheKey)!;
    }

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: turn.text,
          voiceId: turn.voiceId,
          modelId: 'eleven_v4_turbo', // ElevenLabs V4 Turbo: ultra-low latency & native phone accent nuances
          voiceSettings: {
            stability: turn.role === 'rep' ? 0.52 : 0.45,
            similarity_boost: 0.75,
            style: turn.role === 'rep' ? 0.05 : 0.12
          }
        })
      });

      if (!res.ok) {
        console.warn(`[LiveMonitoring] TTS fetch failed with status ${res.status}`);
        return null;
      }

      const data = await res.json();
      if (!data.audio) {
        console.warn('[LiveMonitoring] No audio data in response');
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

    if (!audioUrl || !activeSessionRef.current || activeSessionRef.current.id !== session.id) {
      return;
    }

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

  // Filter sessions
  const filteredSessions = sessions.filter(s => {
    const matchQuery = s.repName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                       s.personaName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                       s.tenant.toLowerCase().includes(searchQuery.toLowerCase());
    const matchSentiment = sentimentFilter === 'all' || s.sentiment === sentimentFilter;
    const matchTenant = tenantFilter === 'all' || s.tenant === tenantFilter;
    return matchQuery && matchSentiment && matchTenant;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full pb-16">
      
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#222021]/10 pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-mono font-bold">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              <span>DIALER AUDIO MONITORING BUS • 4 LIVE ELEVENLABS CHANNELS</span>
            </div>

            {/* Rep Voice Identity Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-900 text-[11px] font-mono font-bold">
              <span>{selectedRepAccent === 'arabic' ? '🇦🇪' : '🇵🇭'}</span>
              <span>
                REP VOICE: {selectedRepAccent === 'arabic' ? 'ARABIC ACCENT (NOOR & TARIQ • V4 TURBO)' : 'FILIPINO BPO ACCENT (LOVELY & PAOLO • V4 TURBO)'}
              </span>
            </div>
          </div>

          <h1 className="text-3xl font-black text-[#222021] tracking-tight">
            Live Sparring Floor Monitor
          </h1>
          <p className="text-xs text-[#6b6968] mt-1 max-w-2xl leading-relaxed">
            Real-time supervisor console. Demonstrate how our <strong>{selectedRepAccent === 'arabic' ? 'Arabic Accent SDR reps' : 'Filipino BPO SDR reps'}</strong> sound over the phone handling live objections against <strong>global customer accents</strong> (US, Australian, and British buyers).
          </p>
        </div>

        {/* Rep Accent & Customer Accent Switchers */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Rep Voice Switcher Pill Bar (Arabic vs Filipino) */}
          <div className="flex items-center gap-1 p-1 bg-white border border-[#222021]/15 rounded-xl shadow-2xs">
            <div className="flex items-center gap-1 pl-2.5 pr-1.5 text-[11px] font-mono font-bold text-[#6b6968]">
              <Users className="h-3.5 w-3.5 text-[#ED1C24]" />
              <span className="hidden sm:inline">REP ACCENT:</span>
            </div>

            <button
              onClick={() => handleRepAccentChange('arabic')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedRepAccent === 'arabic'
                  ? 'bg-[#ED1C24] text-white shadow-2xs'
                  : 'text-[#6b6968] hover:text-[#222021] hover:bg-[#F2F0EF]'
              }`}
              title="Switch Rep Voice to Arabic Accent (Dubai / Middle East Hub)"
            >
              <span>🇦🇪</span>
              <span>Arabic</span>
            </button>

            <button
              onClick={() => handleRepAccentChange('filipino')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedRepAccent === 'filipino'
                  ? 'bg-[#ED1C24] text-white shadow-2xs'
                  : 'text-[#6b6968] hover:text-[#222021] hover:bg-[#F2F0EF]'
              }`}
              title="Switch Rep Voice to Filipino Accent (Manila / Ortigas Hub)"
            >
              <span>🇵🇭</span>
              <span>Filipino</span>
            </button>
          </div>
          {/* Customer Accent Selector Pill Bar */}
          <div className="flex items-center gap-1 p-1 bg-white border border-[#222021]/15 rounded-xl shadow-2xs">
            <div className="flex items-center gap-1 pl-2.5 pr-1.5 text-[11px] font-mono font-bold text-[#6b6968]">
              <Globe className="h-3.5 w-3.5 text-[#ED1C24]" />
              <span className="hidden sm:inline">CUSTOMER ACCENT:</span>
            </div>
            
            <button
              onClick={() => handleCustomerAccentChange('USA')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedCustomerAccent === 'USA'
                  ? 'bg-[#222021] text-white shadow-2xs'
                  : 'text-[#6b6968] hover:text-[#222021] hover:bg-[#F2F0EF]'
              }`}
              title="Switch Customer Voice to American Accent"
            >
              <span>🇺🇸</span>
              <span>USA</span>
            </button>

            <button
              onClick={() => handleCustomerAccentChange('Australia')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedCustomerAccent === 'Australia'
                  ? 'bg-[#222021] text-white shadow-2xs'
                  : 'text-[#6b6968] hover:text-[#222021] hover:bg-[#F2F0EF]'
              }`}
              title="Switch Customer Voice to Australian Accent"
            >
              <span>🇦🇺</span>
              <span>Australia</span>
            </button>

            <button
              onClick={() => handleCustomerAccentChange('UK')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedCustomerAccent === 'UK'
                  ? 'bg-[#222021] text-white shadow-2xs'
                  : 'text-[#6b6968] hover:text-[#222021] hover:bg-[#F2F0EF]'
              }`}
              title="Switch Customer Voice to British Accent"
            >
              <span>🇬🇧</span>
              <span>UK</span>
            </button>
          </div>

          <Link
            href="/sparring"
            className="px-4 py-2 rounded-xl bg-white border border-[#222021]/15 text-[#222021] hover:bg-[#F2F0EF] font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Headphones className="h-4 w-4 text-[#ED1C24]" />
            <span>Sparring Arena</span>
          </Link>
          <Link
            href="/admin"
            className="px-4 py-2 rounded-xl bg-[#222021] hover:bg-stone-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Admin Control</span>
          </Link>
        </div>
      </div>

      {/* Dialer Floor Telemetry Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#222021]/10 rounded-2xl p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-[#6b6968]">Active Floor Lines</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <span className="text-2xl font-black text-emerald-600 font-mono">
            {sessions.length} Live Calls
          </span>
          <p className="text-[11px] text-[#6b6968]">
            {selectedRepAccent === 'arabic' ? '🇦🇪 Arabic Accent SDR Pod' : '🇵🇭 Filipino SDRs Sparring'}
          </p>
        </div>

        <div className="bg-white border border-[#222021]/10 rounded-2xl p-4 shadow-2xs space-y-1">
          <span className="text-[10px] font-mono uppercase text-[#6b6968] block">Customer Accent Target</span>
          <span className="text-2xl font-black text-[#ED1C24] font-mono flex items-center gap-2">
            <span>{selectedCustomerAccent === 'USA' ? '🇺🇸 USA' : selectedCustomerAccent === 'Australia' ? '🇦🇺 Australia' : '🇬🇧 UK'}</span>
          </span>
          <p className="text-[11px] text-[#6b6968]">Dynamic Persona Voice Bus</p>
        </div>

        <div className="bg-white border border-[#222021]/10 rounded-2xl p-4 shadow-2xs space-y-1">
          <span className="text-[10px] font-mono uppercase text-[#6b6968] block">Audio Stream Engine</span>
          <span className="text-2xl font-black text-blue-600 font-mono">ElevenLabs V4</span>
          <p className="text-[11px] text-[#6b6968]">V4 Turbo Sub-100ms Latency</p>
        </div>

        <div className="bg-white border border-[#222021]/10 rounded-2xl p-4 shadow-2xs space-y-1">
          <span className="text-[10px] font-mono uppercase text-[#6b6968] block">Floor Sentiment</span>
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold mt-1">
            <span className="text-red-700">1 Hostile</span>
            <span className="text-[#6b6968]">&bull;</span>
            <span className="text-amber-700">2 Skeptical</span>
            <span className="text-[#6b6968]">&bull;</span>
            <span className="text-emerald-700">1 Engaged</span>
          </div>
          <p className="text-[11px] text-[#6b6968]">Live AI Sentiment Engine</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full sm:max-w-xl">
          <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6b6968]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search active rep, buyer persona, or tenant BPO..."
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-[#222021]/15 text-xs font-medium placeholder-[#6b6968] text-[#222021] shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#ED1C24] transition-all"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={sentimentFilter}
            onChange={(e) => setSentimentFilter(e.target.value as any)}
            className="h-11 px-3.5 rounded-xl bg-white border border-[#222021]/15 text-xs font-semibold text-[#222021] focus:outline-none shadow-2xs cursor-pointer"
          >
            <option value="all">All Buyer Sentiments</option>
            <option value="Hostile">Hostile Friction</option>
            <option value="Skeptical">Skeptical Pushback</option>
            <option value="Engaged">Engaged / Warming Up</option>
          </select>

          <select
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
            className="h-11 px-3.5 rounded-xl bg-white border border-[#222021]/15 text-xs font-semibold text-[#222021] focus:outline-none shadow-2xs cursor-pointer"
          >
            <option value="all">All Client BPOs</option>
            <option value="Apex Global BPO (Manila)">Apex Global (Manila)</option>
            <option value="Fintech Scaleups (Cebu)">Fintech Scaleups (Cebu)</option>
            <option value="Horizon Solar Outbound Floor">Horizon Solar</option>
            <option value="Outsource Accelerator Partner Hub">OA Partner Hub</option>
          </select>
        </div>
      </div>

      {/* ACTIVE SPARRING REPS DIALER GRID */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs font-mono text-[#6b6968]">
          <span className="font-bold text-[#222021]">
            SHOWING {filteredSessions.length} {selectedRepAccent === 'arabic' ? 'ARABIC ACCENT' : 'FILIPINO'} REPS IN ACTIVE SPARRING CALLS
          </span>
          <span className="hidden sm:inline">
            CLICK "🎧 LISTEN LIVE" TO HEAR {selectedRepAccent === 'arabic' ? 'ARABIC' : 'FILIPINO'} SDR VS {selectedCustomerAccent.toUpperCase()} BUYER
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSessions.map((session) => {
            const isListening = activeListeningSession?.id === session.id;
            const isCurrentlyPlaying = isListening && isAudioPlaying;

            return (
              <div
                key={session.id}
                className={`bg-white border rounded-2xl p-5 shadow-2xs space-y-4 transition-all ${
                  isListening
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-md'
                    : 'border-[#222021]/10 hover:border-[#222021]/30'
                }`}
              >
                {/* Rep & AI Persona Header with Channel Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="h-11 w-11 rounded-xl bg-[#222021] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                        {session.avatar}
                      </div>
                      <span className="absolute -top-1 -left-1 px-1 py-0.2 rounded bg-stone-900 text-white font-mono text-[9px] font-bold border border-white/20">
                        {session.line}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-extrabold text-[#222021]">{session.repName}</h3>
                        <span className="text-[10px] font-mono text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 font-bold flex items-center gap-1">
                          <span>{selectedRepAccent === 'arabic' ? '🇦🇪' : '🇵🇭'}</span>
                          <span>{selectedRepAccent === 'arabic' ? 'Arabic SDR' : 'Filipino SDR'}</span>
                        </span>
                      </div>
                      <p className="text-[11px] text-[#6b6968] mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-stone-500">{session.tenant}</span>
                        <span>&bull;</span>
                        <span>Facing:</span>
                        <strong className="text-[#222021]">{session.personaName}</strong>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-stone-100 text-stone-700 border border-stone-200">
                          {session.countryAccent === 'USA' ? '🇺🇸 USA' : session.countryAccent === 'Australia' ? '🇦🇺 Australia' : '🇬🇧 UK'} Accent
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Status & Live Audio Indicator */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 shadow-2xs ${
                      isCurrentlyPlaying 
                        ? 'bg-red-50 text-red-700 border-red-300' 
                        : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full inline-block ${
                        isCurrentlyPlaying ? 'bg-red-500 animate-ping' : 'bg-emerald-500 animate-pulse'
                      }`} />
                      <span>{isCurrentlyPlaying ? 'ON AIR • STREAMING' : `LIVE • ${formatDuration(session.initialSeconds)}`}</span>
                    </span>

                    <span className="text-[10px] font-mono text-[#6b6968]">
                      Difficulty: <strong className="text-[#ED1C24]">{session.personaDifficulty}</strong>
                    </span>
                  </div>
                </div>

                {/* Current Pushback / Telemetry Box */}
                <div className="p-3 rounded-xl bg-[#F2F0EF] border border-[#222021]/10 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-[#6b6968] uppercase font-bold flex items-center gap-1">
                      <Flame className="h-3 w-3 text-[#ED1C24]" />
                      <span>Live Buyer Objection:</span>
                    </span>
                    <span className={`font-bold ${
                      session.sentiment === 'Hostile' ? 'text-red-700' :
                      session.sentiment === 'Skeptical' ? 'text-amber-700' :
                      'text-emerald-700'
                    }`}>
                      {session.sentiment.toUpperCase()} &bull; {session.wpm} WPM
                    </span>
                  </div>
                  <p className="text-xs italic font-medium text-[#222021] leading-relaxed">
                    {session.currentObjection}
                  </p>
                </div>

                {/* ARM Framework Live Progress Indicators */}
                <div className="flex items-center justify-between text-[10px] font-mono pt-1">
                  <span className="text-[#6b6968] font-bold">ARM STATUS:</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2 py-0.5 rounded ${session.armStatus.acknowledge ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-stone-200 text-stone-500'}`}>
                      {session.armStatus.acknowledge ? '✓ Acknowledge' : 'Acknowledge'}
                    </span>
                    <span className={`px-2 py-0.5 rounded ${session.armStatus.respond ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-stone-200 text-stone-500'}`}>
                      {session.armStatus.respond ? '✓ Respond' : 'Respond'}
                    </span>
                    <span className={`px-2 py-0.5 rounded ${session.armStatus.move ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-stone-200 text-stone-500'}`}>
                      {session.armStatus.move ? '✓ Move' : 'Move'}
                    </span>
                  </div>
                </div>

                {/* Live Audio Equalizer Waveform & Listen Button */}
                <div className="pt-2 border-t border-[#222021]/10 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 h-7 px-2.5 py-1 rounded-lg bg-[#0F1412] border border-stone-800">
                    <span className="text-[9px] font-mono text-emerald-400 font-bold mr-1">VU METER</span>
                    <span className={`w-1 bg-emerald-400 rounded-full transition-all duration-75 ${isCurrentlyPlaying ? 'h-5 animate-pulse' : 'h-2'}`} />
                    <span className={`w-1 bg-emerald-400 rounded-full transition-all duration-75 ${isCurrentlyPlaying ? 'h-6 animate-pulse' : 'h-3'}`} />
                    <span className={`w-1 bg-emerald-400 rounded-full transition-all duration-75 ${isCurrentlyPlaying ? 'h-4 animate-pulse' : 'h-2'}`} />
                    <span className={`w-1 bg-emerald-400 rounded-full transition-all duration-75 ${isCurrentlyPlaying ? 'h-6 animate-pulse' : 'h-3'}`} />
                    <span className={`w-1 bg-emerald-400 rounded-full transition-all duration-75 ${isCurrentlyPlaying ? 'h-3 animate-pulse' : 'h-1.5'}`} />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleListen(session)}
                      className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer ${
                        isListening
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                    >
                      {isLoadingAudio && isListening ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Headphones className="h-3.5 w-3.5" />
                      )}
                      <span>{isListening ? 'Disconnect Audio' : '🎧 Listen Live'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* DOCKED SUPERVISOR AUDIO STREAM & TWO-WAY DIALOGUE PLAYER */}
      {activeListeningSession && (
        <div className="rounded-3xl bg-[#0C1017] border border-stone-800 p-6 text-white shadow-2xl space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Active Player Header */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-800 pb-4">
            <div className="flex items-center gap-3">
              <div className={`h-11 w-11 rounded-xl flex items-center justify-center font-bold transition-colors ${
                isAudioPlaying ? 'bg-red-600 text-white' : 'bg-emerald-500 text-stone-950'
              }`}>
                <Radio className={`h-5 w-5 ${isAudioPlaying ? 'animate-pulse' : ''}`} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                    SUPERVISOR BUS &bull; {activeListeningSession.line}
                  </span>
                  
                  {/* Real-time accent badges */}
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800 flex items-center gap-1">
                    <span>{selectedRepAccent === 'arabic' ? '🇦🇪' : '🇵🇭'}</span>
                    <span>{selectedRepAccent === 'arabic' ? 'Arabic SDR Voice' : 'Filipino SDR Voice'}</span>
                  </span>

                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-stone-800 text-stone-300 border border-stone-700 flex items-center gap-1">
                    <span>{activeListeningSession.countryAccent === 'USA' ? '🇺🇸' : activeListeningSession.countryAccent === 'Australia' ? '🇦🇺' : '🇬🇧'}</span>
                    <span>Customer Accent: {activeListeningSession.countryAccent}</span>
                  </span>

                  {isLoadingAudio && (
                    <span className="text-xs font-mono text-amber-400 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Synthesizing...</span>
                    </span>
                  )}
                </div>
                <h3 className="text-base font-extrabold text-white mt-1">
                  {activeListeningSession.repName} ({selectedRepAccent === 'arabic' ? '🇦🇪 Arabic SDR' : '🇵🇭 Filipino SDR'}) &harr; {activeListeningSession.personaName} ({activeListeningSession.personaRole})
                </h3>
              </div>
            </div>

            {/* Audio Playback Controls, Accent Quick-Toggle & Volume */}
            <div className="flex flex-wrap items-center gap-2.5">
              
              {/* Quick Switch Rep Voice inside Docked Bus */}
              <div className="flex items-center bg-stone-900 border border-stone-800 rounded-xl p-1">
                <span className="text-[10px] font-mono text-stone-400 px-2 font-bold hidden sm:inline">REP VOICE:</span>
                <button
                  onClick={() => handleRepAccentChange('arabic')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    selectedRepAccent === 'arabic'
                      ? 'bg-[#ED1C24] text-white shadow-xs'
                      : 'text-stone-400 hover:text-white hover:bg-stone-800'
                  }`}
                  title="Arabic Accent SDR Rep (Dubai / Riyadh Hub)"
                >
                  <span>🇦🇪</span>
                  <span>Arabic</span>
                </button>
                <button
                  onClick={() => handleRepAccentChange('filipino')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    selectedRepAccent === 'filipino'
                      ? 'bg-[#ED1C24] text-white shadow-xs'
                      : 'text-stone-400 hover:text-white hover:bg-stone-800'
                  }`}
                  title="Filipino Accent SDR Rep (Manila / Ortigas Hub)"
                >
                  <span>🇵🇭</span>
                  <span>Filipino</span>
                </button>
              </div>

              {/* Quick Switch Customer Accent inside Docked Bus */}
              <div className="flex items-center bg-stone-900 border border-stone-800 rounded-xl p-1">
                <span className="text-[10px] font-mono text-stone-400 px-2 font-bold hidden sm:inline">BUYER:</span>
                {(['USA', 'Australia', 'UK'] as SparringCountry[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => handleCustomerAccentChange(c)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                      activeListeningSession.countryAccent === c
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-stone-400 hover:text-white hover:bg-stone-800'
                    }`}
                  >
                    {c === 'USA' ? '🇺🇸 US' : c === 'Australia' ? '🇦🇺 AU' : '🇬🇧 UK'}
                  </button>
                ))}
              </div>

              {/* Play / Pause Toggle */}
              <button
                onClick={handleTogglePlayPause}
                className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                title={isAudioPlaying ? 'Pause Stream' : 'Play Stream'}
              >
                {isAudioPlaying ? <Pause className="h-3.5 w-3.5 text-amber-400" /> : <Play className="h-3.5 w-3.5 text-emerald-400" />}
                <span>{isAudioPlaying ? 'Pause' : 'Play'}</span>
              </button>

              {/* Replay Dialogue */}
              <button
                onClick={handleReplay}
                className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white transition-colors cursor-pointer"
                title="Replay from Beginning"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>

              {/* Next Turn */}
              <button
                onClick={handleNextTurn}
                className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white transition-colors cursor-pointer"
                title="Skip to Next Speaker"
              >
                <SkipForward className="h-3.5 w-3.5" />
              </button>

              {/* Volume Slider */}
              <div className="flex items-center gap-2 text-xs font-mono text-stone-400 pl-2 border-l border-stone-800">
                <button
                  onClick={() => setIsAudioMuted(!isAudioMuted)}
                  className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-300 cursor-pointer"
                >
                  {isAudioMuted ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4" />}
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
                  className="w-16 sm:w-20 accent-emerald-500 cursor-pointer"
                />
                <span className="w-8 text-right font-mono">{isAudioMuted ? '0%' : `${volume}%`}</span>
              </div>

              {/* Close Button */}
              <button
                onClick={handleDisconnect}
                className="p-2 rounded-xl bg-stone-800 hover:bg-red-950 hover:text-red-400 text-stone-300 transition-colors cursor-pointer ml-1"
                title="Disconnect Audio Bus"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Real-Time Transcript & Waveform Feed */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Transcript Dialogues (8 cols) */}
            <div className="lg:col-span-8 bg-stone-900/90 rounded-2xl p-4 border border-stone-800 space-y-3 max-h-84 overflow-y-auto">
              <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase text-stone-400 tracking-wider">
                <span className="flex items-center gap-1.5">
                  <span className="text-blue-400">{selectedRepAccent === 'arabic' ? '🇦🇪 ARABIC SDR' : '🇵🇭 FILIPINO SDR'}</span>
                  <span>&harr;</span>
                  <span className="text-red-400">
                    {activeListeningSession.countryAccent === 'USA' ? '🇺🇸 US BUYER' : activeListeningSession.countryAccent === 'Australia' ? '🇦🇺 AUSTRALIAN BUYER' : '🇬🇧 UK BUYER'}
                  </span>
                </span>
                <span className="text-emerald-400">Click dialogue to jump & listen</span>
              </div>

              <div className="space-y-2.5">
                {activeListeningSession.recentTranscript.map((turn, idx) => {
                  const isRep = turn.role === 'rep';
                  const isCurrentTurn = currentTurnIndex === idx;

                  return (
                    <div
                      key={turn.id || idx}
                      onClick={() => handleSelectTurn(idx)}
                      className={`p-3.5 rounded-xl border text-xs leading-relaxed transition-all cursor-pointer ${
                        isCurrentTurn
                          ? isRep
                            ? 'bg-blue-900/60 border-blue-400 ring-2 ring-blue-500/30 text-white shadow-lg'
                            : 'bg-red-950/60 border-red-500 ring-2 ring-red-500/30 text-white shadow-lg'
                          : isRep
                            ? 'bg-blue-950/30 border-blue-900/40 text-blue-100 hover:bg-blue-950/60'
                            : 'bg-stone-950/80 border-stone-800 text-stone-200 hover:bg-stone-900'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold px-1.5 py-0.2 rounded text-[9px] uppercase flex items-center gap-1 ${
                            isRep ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'
                          }`}>
                            {isRep ? (
                              <>
                                <span>{selectedRepAccent === 'arabic' ? '🇦🇪' : '🇵🇭'}</span>
                                <span>{selectedRepAccent === 'arabic' ? 'ARABIC SDR' : 'FILIPINO SDR'}</span>
                              </>
                            ) : (
                              <>
                                <span>{activeListeningSession.countryAccent === 'USA' ? '🇺🇸' : activeListeningSession.countryAccent === 'Australia' ? '🇦🇺' : '🇬🇧'}</span>
                                <span>{activeListeningSession.countryAccent} BUYER</span>
                              </>
                            )}
                          </span>
                          <span className={isRep ? 'text-blue-300 font-bold' : 'text-[#ED1C24] font-bold'}>
                            {turn.speaker}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {isCurrentTurn && isAudioPlaying && (
                            <span className="flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-stone-950 animate-pulse">
                              <span className="h-1.5 w-1.5 rounded-full bg-stone-950 inline-block" />
                              <span>SPEAKING NOW</span>
                            </span>
                          )}
                          <span className="text-stone-500">{turn.time}</span>
                        </div>
                      </div>

                      <p className="font-sans text-[13px] leading-relaxed">
                        {turn.text}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Supervisor Whisper & Coach Console (4 cols) */}
            <div className="lg:col-span-4 bg-stone-900/90 rounded-2xl p-4 border border-stone-800 space-y-3">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase text-emerald-400 tracking-wider block">
                  Supervisor Whisper (Live HUD Injection):
                </span>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  Inject coaching cues into {activeListeningSession.repName}’s cockpit. The {selectedRepAccent === 'arabic' ? 'Arabic SDR' : 'Filipino SDR'} will immediately voice the coached rebuttal!
                </p>
              </div>

              <form onSubmit={handleSendWhisper} className="space-y-2">
                <textarea
                  rows={3}
                  value={whisperMessage}
                  onChange={(e) => setWhisperMessage(e.target.value)}
                  placeholder="e.g. Pivot to zero-prep guarantee! Remind them we pull tech-stack profiles beforehand."
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 placeholder-stone-600 focus:outline-none focus:border-emerald-500 font-sans resize-none"
                />

                <div className="flex items-center justify-between">
                  {whisperFeedbackSent ? (
                    <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 font-bold">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Voiced in {selectedRepAccent === 'arabic' ? 'Arabic' : 'Filipino'} Accent!</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-stone-500">Live Teleprompter Bus</span>
                  )}

                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Send Whisper</span>
                  </button>
                </div>
              </form>

              {/* ElevenLabs Channel Indicator */}
              <div className="p-3 rounded-xl bg-stone-950 border border-stone-800/80 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between text-[10px] font-mono text-stone-400">
                  <span>VOICE CHANNELS:</span>
                  <span className="text-emerald-400 font-bold">ACTIVE</span>
                </div>
                {(() => {
                  const repVoice = getRepVoice(selectedRepAccent, activeListeningSession.repGender);
                  return (
                    <div className="text-stone-300 flex items-center gap-1.5">
                      <span>{repVoice.flag}</span>
                      <span>
                        Rep: <strong className="text-white">{activeListeningSession.repName} ({repVoice.accentLabel})</strong>
                      </span>
                    </div>
                  );
                })()}
                <div className="text-stone-300 flex items-center gap-1.5">
                  <span>{activeListeningSession.countryAccent === 'USA' ? '🇺🇸' : activeListeningSession.countryAccent === 'Australia' ? '🇦🇺' : '🇬🇧'}</span>
                  <span>Customer: <strong className="text-white">{activeListeningSession.personaName} ({activeListeningSession.countryAccent} Accent)</strong></span>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
