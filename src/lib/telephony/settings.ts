/**
 * Browser-side telephony preferences: the rep's VICIdial agent username (per device) and the mapping
 * from Dialer outcomes to VICIdial status codes (per workspace, edited in Admin › Phone system).
 *
 * DESIGN-NOTE: pilot storage is localStorage, like the rest of the app's session. Server-side
 * user -> agent mapping comes with real authentication (see APPOINTMENTLYY_GO_LIVE_AUDIT.md).
 */

import { useSyncExternalStore } from 'react';

const AGENT_KEY = 'appy_vicidial_agent_user';
const OUTCOME_KEY = 'appy_vicidial_outcome_codes';
const EVENT = 'appy:telephony-settings';

/** The six outcome buttons in the Dialer, by the value they record. */
export const DIALER_OUTCOMES = [
  { name: 'Meeting Booked', label: 'Booked' },
  { name: 'Call Back Later', label: 'Callback' },
  { name: 'Left Voicemail', label: 'Voicemail' },
  { name: 'No Answer / Gatekeeper', label: 'No answer' },
  { name: 'Referral / Update Contact', label: 'Referral' },
  { name: 'Not Interested / Quarantine', label: 'Not interested' },
] as const;

/** VICIdial's standard system statuses. Change them to match your campaign's codes. */
export const DEFAULT_OUTCOME_CODES: Record<string, string> = {
  'Meeting Booked': 'SALE',
  'Call Back Later': 'CALLBK',
  'Left Voicemail': 'A',
  'No Answer / Gatekeeper': 'N',
  'Referral / Update Contact': 'CALLBK',
  'Not Interested / Quarantine': 'NI',
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(EVENT));
}

export const getAgentUser = (): string => read<string>(AGENT_KEY, '');
export const setAgentUser = (v: string) => write(AGENT_KEY, v.trim());

let cachedCodes: { raw: string | null; value: Record<string, string> } = { raw: null, value: DEFAULT_OUTCOME_CODES };
export function getOutcomeCodes(): Record<string, string> {
  if (typeof window === 'undefined') return DEFAULT_OUTCOME_CODES;
  const raw = localStorage.getItem(OUTCOME_KEY);
  if (raw !== cachedCodes.raw) {
    cachedCodes = { raw, value: { ...DEFAULT_OUTCOME_CODES, ...read<Record<string, string>>(OUTCOME_KEY, {}) } };
  }
  return cachedCodes.value; // stable reference for useSyncExternalStore
}
export const setOutcomeCodes = (codes: Record<string, string>) => write(OUTCOME_KEY, codes);

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => (e.key === AGENT_KEY || e.key === OUTCOME_KEY) && cb();
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', onStorage);
  };
}

export const useAgentUser = () => useSyncExternalStore(subscribe, getAgentUser, () => '');
export const useOutcomeCodes = () => useSyncExternalStore(subscribe, getOutcomeCodes, () => DEFAULT_OUTCOME_CODES);
