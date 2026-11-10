/**
 * Practice mode: reps train inside the real Dialer against an AI buyer.
 * The landing page (/practice) builds a setup; /practice/session opens the Dialer with it.
 * Nothing here touches contacts, activity, callbacks, CRM or telephony.
 */

import { SPARRING_PERSONAS, type SparringPersona } from '@/lib/personas';
import type { QaEvaluationResult } from '@/lib/qaEvaluator';

export type PracticeDifficulty = 'friendly' | 'realistic' | 'tough';

export interface PracticeSetup {
  personaId: string;
  /** A Dialer objection chip id (e.g. OBJ_PRICING), or null for a call without a chosen objection. */
  objectionId: string | null;
  difficulty: PracticeDifficulty;
}

export const PRACTICE_DIFFICULTIES: { value: PracticeDifficulty; label: string; hint: string }[] = [
  { value: 'friendly', label: 'Friendly', hint: 'The buyer is open and easy to win. Good for learning the script.' },
  { value: 'realistic', label: 'Realistic', hint: 'A typical busy buyer: pushes back, softens when you handle it well.' },
  { value: 'tough', label: 'Tough', hint: 'Impatient and resistant. You need a strong rebuttal to book the meeting.' },
];

export function difficultyLabel(d: PracticeDifficulty): string {
  return PRACTICE_DIFFICULTIES.find((x) => x.value === d)?.label ?? 'Realistic';
}

/** Practice buyers. The Dialer demo prospect is only offered in the demo workspace (it follows the demo pitch). */
export function getPracticePersonas(isDemo: boolean): SparringPersona[] {
  const demoProspect = SPARRING_PERSONAS.find((p) => p.id === 'demo-dialer-julian');
  const others = SPARRING_PERSONAS.filter((p) => p.id !== 'demo-dialer-julian');
  return isDemo && demoProspect ? [demoProspect, ...others] : others;
}

export function getPracticePersona(id: string): SparringPersona | null {
  return SPARRING_PERSONAS.find((p) => p.id === id) ?? null;
}

/** Fictional company names, so scripts read naturally ("{{company}}") without using any real contact. */
const PRACTICE_COMPANY: Record<string, string> = {
  'demo-dialer-julian': 'Apex Global BPO',
  'bpo-directory-buyer': 'Northbay BPO Services',
  'rushed-vp': 'Ledgerline Payments',
  'iron-gatekeeper': 'Meridian Health Systems',
  'incumbent-loyalist': 'Cloudvale Software',
  'frugal-cfo': 'Sterling Freight & Manufacturing',
  'burned-director': 'Bastion Cyber',
  'polite-ghoster': 'Shipwise Commerce',
  'overwhelmed-ops': 'Routeline Logistics',
  'technical-gatekeeper': 'Stackguard Cloud',
  'indecisive-manager': 'Talentbridge Staffing',
  'aggressive-skeptic': 'Donovan Capital Partners',
};

export function practiceCompanyName(persona: SparringPersona): string {
  return PRACTICE_COMPANY[persona.id] ?? persona.companyType.split('(')[0].trim();
}

/** The lead shown in the Dialer during practice: built from the persona, never a real contact. */
export function buildPracticeLead(persona: SparringPersona) {
  return {
    id: `practice-${persona.id}`,
    name: persona.name,
    company: practiceCompanyName(persona),
    title: persona.title,
    phone: '(555) 010-0199',
    email: '',
    headcount: '',
    website: '',
    linkedinUrl: '',
    cadenceDay: 1,
  };
}

export function practiceSessionHref(setup: PracticeSetup): string {
  const q = new URLSearchParams({ persona: setup.personaId, difficulty: setup.difficulty });
  if (setup.objectionId) q.set('objection', setup.objectionId);
  return `/practice/session?${q.toString()}`;
}

export function parsePracticeSetup(params: { get(name: string): string | null }): PracticeSetup | null {
  const personaId = params.get('persona') || '';
  if (!getPracticePersona(personaId)) return null;
  const d = (params.get('difficulty') || '').toLowerCase();
  const difficulty: PracticeDifficulty = d === 'friendly' || d === 'tough' ? d : 'realistic';
  const objectionId = (params.get('objection') || '').replace(/[^A-Z0-9_]/gi, '') || null;
  return { personaId, objectionId, difficulty };
}

/* ---------- Practice history (this browser, this person + workspace; see tenantStorage DATA_KEYS) ---------- */

export const PRACTICE_HISTORY_KEY = 'appointmentlyy_practice_history_v1';
const HISTORY_EVENT = 'appointmentlyy_practice_history_updated';
const MAX_HISTORY = 12;

export interface PracticeHistoryEntry {
  id: string;
  at: string;
  personaId: string;
  personaName: string;
  objectionLabel: string;
  difficulty: PracticeDifficulty;
  outcome: string | null;
  score: number | null;
  grade: string | null;
  /** Id of the saved scorecard (/practice/scorecard/<id>), once the call was scored. */
  scorecardId?: string;
  evaluation?: QaEvaluationResult;
}

export function readPracticeHistoryRaw(): string {
  if (typeof window === 'undefined') return '[]';
  try {
    return localStorage.getItem(PRACTICE_HISTORY_KEY) || '[]';
  } catch {
    return '[]';
  }
}

export function parsePracticeHistory(raw: string): PracticeHistoryEntry[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function subscribeToPracticeHistory(cb: () => void): () => void {
  window.addEventListener('storage', cb);
  window.addEventListener(HISTORY_EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(HISTORY_EVENT, cb);
  };
}

/** Insert or update one practice call (newest first). */
export function savePracticeHistory(entry: PracticeHistoryEntry): void {
  try {
    const list = parsePracticeHistory(readPracticeHistoryRaw()).filter((e) => e.id !== entry.id);
    localStorage.setItem(PRACTICE_HISTORY_KEY, JSON.stringify([entry, ...list].slice(0, MAX_HISTORY)));
    window.dispatchEvent(new Event(HISTORY_EVENT));
  } catch {
    // storage full or unavailable: the summary still shows on screen
  }
}

export function findPracticeEvaluation(id: string): QaEvaluationResult | null {
  const hit = parsePracticeHistory(readPracticeHistoryRaw()).find(
    (e) => e.id === id || e.scorecardId === id || e.evaluation?.sessionId === id,
  );
  return hit?.evaluation ?? null;
}
