/**
 * Multi-Accent Sales Rep Voice Profiles (ElevenLabs)
 * Used across Live Floor Monitoring and Voice Sparring.
 *
 * Supported Accents:
 * 1. Arabic Accent Reps (Middle East / Gulf BPO Hub)
 *    - Female: 3AH0h1SXwwhE8vUUWuQW
 *    - Male:   JAFpvTRfGNCbJ2St9kyT
 * 2. Filipino Accent Reps (Philippine BPO Floor - Manila / Ortigas)
 *    - Female: 4IYgKf4EiI6yTfzwgjC2 (Lovely)
 *    - Male:   qh4NDtUSop0caPSI9C7m (Paolo)
 */

export type RepAccentKey = 'arabic' | 'filipino';

export interface RepVoiceProfile {
  voiceId: string;
  name: string;
  gender: 'male' | 'female';
  accentLabel: string;
  accentBadge: string;
  hub: string;
  flag: string;
}

export const REP_VOICE_REGISTRY: Record<RepAccentKey, { male: RepVoiceProfile; female: RepVoiceProfile }> = {
  arabic: {
    male: {
      voiceId: 'JAFpvTRfGNCbJ2St9kyT',
      name: 'Tariq Al-Mansoor',
      gender: 'male',
      accentLabel: 'Arabic Male SDR (Tariq)',
      accentBadge: '🇦🇪 Arabic Accent (Dubai / Riyadh Hub)',
      hub: 'Dubai Outbound Floor',
      flag: '🇦🇪',
    },
    female: {
      voiceId: '3AH0h1SXwwhE8vUUWuQW',
      name: 'Noor Al-Hassan',
      gender: 'female',
      accentLabel: 'Arabic Female SDR (Noor)',
      accentBadge: '🇦🇪 Arabic Accent (Dubai / Riyadh Hub)',
      hub: 'Dubai Outbound Floor',
      flag: '🇦🇪',
    },
  },
  filipino: {
    male: {
      voiceId: 'qh4NDtUSop0caPSI9C7m',
      name: 'Paolo Reyes',
      gender: 'male',
      accentLabel: 'Filipino Male SDR (Paolo)',
      accentBadge: '🇵🇭 Filipino BPO Accent (Ortigas Hub)',
      hub: 'Ortigas BPO Floor',
      flag: '🇵🇭',
    },
    female: {
      voiceId: '4IYgKf4EiI6yTfzwgjC2',
      name: 'Lovely Santos',
      gender: 'female',
      accentLabel: 'Filipino Female SDR (Lovely)',
      accentBadge: '🇵🇭 Filipino BPO Accent (Manila Floor)',
      hub: 'Manila Outbound Floor',
      flag: '🇵🇭',
    },
  },
};

export const DEFAULT_REP_ACCENT: RepAccentKey = 'arabic';

export function getRepVoice(accent: RepAccentKey = 'arabic', gender: 'male' | 'female' = 'male'): RepVoiceProfile {
  const group = REP_VOICE_REGISTRY[accent] || REP_VOICE_REGISTRY.arabic;
  return group[gender] || group.male;
}
