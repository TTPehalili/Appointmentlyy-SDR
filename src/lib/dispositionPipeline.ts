/**
 * Call outcome → Pipeline stage mapping.
 *
 * Every call outcome a rep picks in the Dialer moves the lead to a Pipeline stage:
 * - Admin › Call outcomes can set the stage per outcome (CallDisposition.pipelineStageId);
 * - otherwise a default comes from the outcome's automation, category and name
 *   (Booked → Meeting Booked, Callback or another positive outcome → Call Back Later, Voicemail → Left Voicemail,
 *   No answer / Gatekeeper / Referral → In Cadence, Not interested / DNC / Wrong number → Disqualified).
 *
 * Stages are user-editable (renamed, reordered, deleted), so a stage is found by its id first and
 * by its role (label keywords) second.
 */

import type { CallDisposition } from './dispositionStore';
import type { PipelineStageConfig } from './leadStore';

/** pipelineStageId value meaning "leave the lead in its current stage". */
export const KEEP_STAGE = 'keep';

/** What a stage is for. The default pipeline has one stage per role. */
export type StageRole = 'new' | 'attempted' | 'referral' | 'voicemail' | 'callback' | 'booked' | 'disqualified';

/** The default stage id for each role (see DEFAULT_PIPELINE_STAGES). */
export const ROLE_STAGE_ID: Record<StageRole, string> = {
  new: 'col_new',
  attempted: 'col_cadence',
  referral: 'col_cadence',
  voicemail: 'col_voicemail',
  callback: 'col_callback',
  booked: 'col_booked',
  disqualified: 'col_disqualified',
};

type OutcomeLike = Pick<CallDisposition, 'name'> &
  Partial<Pick<CallDisposition, 'code' | 'category' | 'actionTrigger'>>;

const DISQUALIFY_RE =
  /not[\s_-]*interested|\bdnc\b|do[\s_-]*not[\s_-]*call|opt[\s_-]*out|unsubscribe|wrong[\s_-]*number|invalid|disqualif|quarantine|suppress|bad[\s_-]*data|^ni[\s_:-]/;

/** The role of an outcome (or a raw lead status), or null when nothing matches. */
export function getOutcomeRole(outcome: OutcomeLike): StageRole | null {
  const text = `${outcome.name || ''} ${outcome.code || ''}`.toLowerCase().trim();
  const name = (outcome.name || '').toLowerCase().trim();

  // 1. Automation: the strongest signal of what the outcome means.
  switch (outcome.actionTrigger) {
    case 'mark_booked':
      return 'booked';
    case 'schedule_callback':
      return 'callback';
    case 'dnc_quarantine':
      return 'disqualified';
  }

  // 2. Name / code keywords.
  if (DISQUALIFY_RE.test(name) || DISQUALIFY_RE.test((outcome.code || '').toLowerCase())) return 'disqualified';
  if (/\bbook|meeting|appointment|demo[\s_-]*set/.test(text)) return 'booked';
  if (/call[\s_-]*back|callback|follow[\s_-]*up/.test(text)) return 'callback';
  if (/voicemail|\bvm\b|voice[\s_-]*mail/.test(text)) return 'voicemail';
  if (/referr|new[\s_-]*dm|update[\s_-]*contact/.test(text)) return 'referral';
  if (/no[\s_-]*answer|gatekeeper|busy|no[\s_-]*pick|unreached|attempt|cadence|working/.test(text)) return 'attempted';
  if (/^new\b/.test(name)) return 'new';

  // 3. Category / automation fallbacks.
  if (outcome.actionTrigger === 'resend_email_120s') return 'voicemail';
  if (outcome.actionTrigger === 'recycle_cadence') return 'attempted';
  switch (outcome.category) {
    // A positive call is not a booking: only the mark_booked automation or booking words in the name
    // (step 1 / 2 above) mean a meeting exists. A positive outcome without one is a warm prospect the
    // rep has to come back to, so it goes to Call Back Later rather than inflating Meeting Booked.
    case 'Positive':
      return 'callback';
    case 'Follow-up':
      return 'callback';
    case 'Negative':
    case 'Compliance':
      return 'disqualified';
    case 'Unreached':
      return 'attempted';
  }
  return null;
}

/** The stage that plays `role` in this pipeline: the default stage by id, else by its label. */
export function findStageByRole(role: StageRole, stages: PipelineStageConfig[]): PipelineStageConfig | null {
  if (!stages || stages.length === 0) return null;
  const byId = stages.find((s) => s.id === ROLE_STAGE_ID[role]);
  if (byId) return byId;
  const has = (s: PipelineStageConfig, ...words: string[]) => {
    const l = `${s.label} ${s.statusValue}`.toLowerCase();
    return words.some((w) => l.includes(w));
  };
  switch (role) {
    case 'booked':
      return stages.find((s) => has(s, 'book', 'meeting')) || stages.find((s) => s.dealProbability >= 0.9) || null;
    case 'callback':
      return stages.find((s) => has(s, 'call back', 'callback', 'follow')) || null;
    case 'voicemail':
      return stages.find((s) => has(s, 'voicemail')) || stages.find((s) => has(s, 'attempt', 'contacted', 'cadence')) || null;
    case 'attempted':
    case 'referral':
      return (
        (role === 'referral' ? stages.find((s) => has(s, 'referr')) : undefined) ||
        stages.find((s) => has(s, 'attempt', 'contacted', 'cadence', 'working')) ||
        null
      );
    case 'disqualified':
      return stages.find((s) => has(s, 'disqual', 'nurture', 'lost', 'not interested')) || null;
    case 'new':
      return stages[0];
  }
}

/** Default stage id for an outcome nobody has mapped yet ('keep' when nothing fits). */
export function getDefaultDispositionStageId(outcome: OutcomeLike): string {
  const role = getOutcomeRole(outcome);
  return role ? ROLE_STAGE_ID[role] : KEEP_STAGE;
}

/** The stage id an outcome is mapped to: the admin's choice, else the default. */
export function getDispositionStageId(d: OutcomeLike & Pick<CallDisposition, 'pipelineStageId'>): string {
  const set = (d.pipelineStageId || '').trim();
  return set || getDefaultDispositionStageId(d);
}

/**
 * The stage a lead moves to when this outcome is picked, or null to keep its current stage.
 * A mapped stage that was deleted falls back to the stage with the same role.
 */
export function resolveOutcomeStage(
  outcome: OutcomeLike & Partial<Pick<CallDisposition, 'pipelineStageId'>>,
  stages: PipelineStageConfig[]
): PipelineStageConfig | null {
  const stageId = getDispositionStageId(outcome);
  if (stageId === KEEP_STAGE) return null;
  const direct = stages.find((s) => s.id === stageId);
  if (direct) return direct;
  const defaultRole = Object.entries(ROLE_STAGE_ID).find(([, id]) => id === stageId)?.[0] as StageRole | undefined;
  const role = defaultRole || getOutcomeRole(outcome);
  return role ? findStageByRole(role, stages) : null;
}

/**
 * Which Pipeline column a lead with this raw status belongs in: an exact stage match first,
 * then the status's role (so legacy statuses like "DNC: Hostile Opt-Out" land in Disqualified),
 * else the first column.
 */
export function resolveStageForStatus(rawStatus: string | undefined, stages: PipelineStageConfig[]): string {
  if (!stages || stages.length === 0) return 'New Lead';
  const s = (rawStatus || '').trim().toLowerCase();
  if (!s) return stages[0].statusValue;
  const exact = stages.find((col) => col.statusValue.toLowerCase() === s || col.label.toLowerCase() === s);
  if (exact) return exact.statusValue;
  const role = getOutcomeRole({ name: rawStatus || '' });
  const found = role ? findStageByRole(role, stages) : null;
  return (found || stages[0]).statusValue;
}

/**
 * The built-in Dialer quick button closest to an outcome. VICIdial status codes are mapped for
 * the quick buttons only (Admin › Phone system), so other outcomes use their nearest quick button.
 */
export function getQuickOutcomeForRole(role: StageRole | null): string | null {
  switch (role) {
    case 'booked':
      return 'Meeting Booked';
    case 'callback':
      return 'Call Back Later';
    case 'voicemail':
      return 'Left Voicemail';
    case 'attempted':
      return 'No Answer / Gatekeeper';
    case 'referral':
      return 'Referral / Update Contact';
    case 'disqualified':
      return 'Not Interested / Quarantine';
    default:
      return null;
  }
}
