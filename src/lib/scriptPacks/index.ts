/**
 * Demo workspace call script packs: the Dialer's "Script" picker.
 *
 * - appointmentlyy: the platform owner's own pitch (the demo default, unchanged).
 * - bpo_ai_hitl: the AI + Human-in-the-Loop BPO cold call (src/lib/scriptPacks/bpoAiHitl.ts).
 *
 * Client workspaces and practice calls never use a pack: they keep their own script and chips.
 * A playbook saved for the workspace (tenant_phone_scripts) still wins over a pack's steps.
 */

import type { PhoneScriptStep } from '@/lib/parsers/armExtractor';
import type { ARMRebuttal } from '@/lib/dialerRebuttals';
import type { SparringPersona } from '@/lib/personas';
import { BPO_HITL_BEAT_STEPS, BPO_HITL_PERSONA, BPO_HITL_REBUTTALS, BPO_HITL_STEPS } from './bpoAiHitl';

export type ScriptPackId = 'appointmentlyy' | 'bpo_ai_hitl';

/** localStorage: the chosen pack, and who the rep says they call for ({{calling_as}}). */
export const SCRIPT_PACK_STORAGE_KEY = 'appy_demo_script_pack';
export const CALLING_AS_STORAGE_KEY = 'appy_demo_calling_as';

export const DEFAULT_SCRIPT_PACK_ID: ScriptPackId = 'appointmentlyy';

export const SCRIPT_PACK_OPTIONS: { value: ScriptPackId; label: string }[] = [
  { value: 'appointmentlyy', label: 'Appointmentlyy script' },
  { value: 'bpo_ai_hitl', label: 'BPO script' },
];

export function parseScriptPackId(v: unknown): ScriptPackId {
  return v === 'bpo_ai_hitl' ? 'bpo_ai_hitl' : 'appointmentlyy';
}

/** An objection chip; packs may add a second comeback for when the prospect pushes back again. */
export type PackRebuttal = ARMRebuttal & { ifPushedBack?: string };

/** One answer button under a beat: something the prospect may say back to that exact line. */
export interface ScriptBeatAnswer {
  id: string;
  /** Button text, also written to the CRM note ("<beat crmLabel>: <label>"). */
  label: string;
  /** Booking answers: the meeting slot this answer books (same flow as the slot buttons). */
  slot?: string;
}

/**
 * A beat: one short rep line and/or question, with the prospect's possible answers as buttons
 * directly beneath it. Script packs with beats render each beat as its own teleprompter card.
 */
export interface ScriptBeat {
  id: string;
  /** What the rep says (merge fields allowed). */
  text: string;
  deliveryTip: string;
  /** CRM note label, e.g. "Who catches AI mistakes" -> "Who catches AI mistakes: Customers do". */
  crmLabel: string;
  /** Small label shown above the card, e.g. "If they ask for an email". */
  caption?: string;
  /** The prospect's likely answers (single-select). Empty for a statement. */
  answers: ScriptBeatAnswer[];
  /** true: the answer goes under MEETING in the CRM note instead of QUALIFICATION. */
  meeting?: boolean;
}

/** A teleprompter step made of beats (the step's spokenText is its beat lines joined). */
export interface ScriptBeatStep {
  step: number;
  name: string;
  goal: string;
  deliveryTip: string;
  beats: ScriptBeat[];
}

export interface ScriptPack {
  id: ScriptPackId;
  label: string;
  steps: PhoneScriptStep[];
  /**
   * null: the teleprompter shows whole steps with the built-in qualify buttons. Otherwise the same
   * steps split into beats with answer buttons (replaces the qualify buttons).
   */
  beats: ScriptBeatStep[] | null;
  /** null: the workspace's preset objection chips. */
  rebuttals: PackRebuttal[] | null;
  /** null: the default demo prospect (Julian Vance). */
  persona: SparringPersona | null;
  /** true: the CRM summary uses the generic call log with a qualification section (no Appointmentlyy talk track). */
  neutralCrmNotes: boolean;
  /** The demo sample lead the Dialer opens when this pack is picked. */
  sampleLeadId: string;
}

/** The demo workspace's own script (the platform owner's pitch). */
export const APPOINTMENTLYY_DEMO_STEPS: PhoneScriptStep[] = [
  {
    step: 1,
    name: '1. Opener',
    goal: 'Earn 30 seconds and tie the call to yesterday\'s email.',
    spokenText: `"Hi {{first_name}}, it's {{rep_name}} from Appointmentlyy, I emailed you yesterday about reps burning dials on bad lead data. Got 30 seconds for the short version?"`,
    deliveryTip: 'Slow, calm, peer tone. Never apologize for calling.'
  },
  {
    step: 2,
    name: '2. Problem',
    goal: 'Surface the lead-quality and pipeline-health pain in one question.',
    spokenText: `"Quick question: how much of your floor's day goes on wrong numbers, bounced emails and leads that were never a fit, and how predictable is the pipeline that's left?"`,
    deliveryTip: 'Ask, then stop talking. Let them vent.'
  },
  {
    step: 3,
    name: '3. Solution',
    goal: 'One line of value: verified leads, reps ready in 72 hours, live help.',
    spokenText: `"That's what we fix: verified, on-fit contacts to dial, reps who practice on AI buyers first, and live objection help on the call, so more dials turn into held meetings. How are you tracking pipeline by stage today?"`,
    deliveryTip: 'Talk floor economics and rep confidence, not features.'
  },
  {
    step: 4,
    name: '4. Close',
    goal: 'Book 15 minutes with founder Emil.',
    spokenText: `"{{first_name}}, let's get you 15 minutes with Emil, our founder, to run this on your floor numbers. Which works better, Thursday at 2 PM or Friday morning?"`,
    deliveryTip: 'Give two times, then stay quiet.'
  }
];

/** Demo sample leads each pack opens on (see DEMO_INITIAL_DEFAULT_CONTACTS in leadStore). */
export const APPOINTMENTLYY_SAMPLE_LEAD_ID = 'lead_fresh_d2';
export const BPO_HITL_SAMPLE_LEAD_ID = 'lead_saas_priya_d1';

const PACKS: Record<ScriptPackId, ScriptPack> = {
  appointmentlyy: {
    id: 'appointmentlyy',
    label: 'Appointmentlyy script',
    steps: APPOINTMENTLYY_DEMO_STEPS,
    beats: null,
    rebuttals: null,
    persona: null,
    neutralCrmNotes: false,
    sampleLeadId: APPOINTMENTLYY_SAMPLE_LEAD_ID,
  },
  bpo_ai_hitl: {
    id: 'bpo_ai_hitl',
    label: 'BPO script (AI + Human-in-the-Loop)',
    steps: BPO_HITL_STEPS,
    beats: BPO_HITL_BEAT_STEPS,
    rebuttals: BPO_HITL_REBUTTALS,
    persona: BPO_HITL_PERSONA,
    neutralCrmNotes: true,
    sampleLeadId: BPO_HITL_SAMPLE_LEAD_ID,
  },
};

export function getScriptPack(id: ScriptPackId): ScriptPack {
  return PACKS[id] ?? PACKS.appointmentlyy;
}
