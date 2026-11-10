/**
 * Email template library: shared types, merge fields, limits and validation. Plain module (no
 * 'use client', no server APIs): used by the Templates tab, the assistant and
 * /api/email-templates.
 *
 * Templates live on the server (lib/server/emailTemplateStore) so a template an admin assigns
 * reaches reps on other computers. Ids are UUIDs and stable, so a workflow step (e.g. "send
 * template 1, wait 2 days") can reference a template by id; archiving keeps the id valid.
 */

export type TemplatePurpose = 'cold' | 'followup' | 'sequence' | 'breakup' | 'reply';
export type TemplateVisibility = 'team' | 'private';

export const TEMPLATE_PURPOSES: { value: TemplatePurpose; label: string }[] = [
  { value: 'cold', label: 'Cold email' },
  { value: 'followup', label: 'Follow-up' },
  { value: 'sequence', label: 'Sequence step' },
  { value: 'breakup', label: 'Breakup' },
  { value: 'reply', label: 'Reply' },
];

export const purposeLabel = (p: TemplatePurpose) => TEMPLATE_PURPOSES.find((x) => x.value === p)?.label ?? p;

/** Suggested outcome tags (any short tag is allowed: call outcomes are configurable per workspace). */
export const OUTCOME_TAG_SUGGESTIONS = ['Booked', 'Callback', 'Not interested', 'No answer', 'Voicemail', 'Gatekeeper'];

export interface EmailTemplate {
  id: string;
  tenantCode: string;
  name: string;
  subject: string;
  body: string;
  /** Assistant framework id ('' = none / written by hand). */
  frameworkId: string;
  /** Campaign = a named group of templates (e.g. a sequence). '' = no campaign. */
  campaign: string;
  purpose: TemplatePurpose;
  /** Call outcomes this template suits (e.g. "Booked"); used to suggest it after a call. */
  outcomeTags: string[];
  visibility: TemplateVisibility;
  /** Member emails. Empty with visibility 'team' = everyone in the workspace. */
  assignedTo: string[];
  /** Order inside its campaign (1 = first email). null when not part of a sequence. */
  sequenceStep: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export type TemplateInput = Pick<
  EmailTemplate,
  'name' | 'subject' | 'body' | 'frameworkId' | 'campaign' | 'purpose' | 'outcomeTags' | 'visibility' | 'assignedTo' | 'sequenceStep' | 'archived'
>;

// ------------------------------------------------------------------ limits

export const NAME_MAX = 80;
export const SUBJECT_MAX = 150;
export const BODY_MAX = 5000;
export const CAMPAIGN_MAX = 60;
export const FRAMEWORK_ID_MAX = 60;
export const TAG_MAX = 40;
export const TAGS_MAX = 8;
export const ASSIGNEES_MAX = 200;
export const SEQUENCE_STEP_MAX = 20;
/** Same hard rule as the writing assistant: bodies stay under 90 words. */
export const TEMPLATE_WORD_LIMIT = 90;

// ------------------------------------------------------------------ merge fields

export interface MergeField {
  key: string;
  token: string;
  label: string;
  sample: string;
}

export const MERGE_FIELDS: MergeField[] = [
  { key: 'first_name', token: '{{first_name}}', label: 'First name', sample: 'Maria' },
  { key: 'company', token: '{{company}}', label: 'Company', sample: 'Northwind Freight' },
  { key: 'title', token: '{{title}}', label: 'Title', sample: 'Head of Operations' },
  { key: 'sender_name', token: '{{sender_name}}', label: 'Your name', sample: 'Sam' },
  { key: 'sender_company', token: '{{sender_company}}', label: 'Your company', sample: 'Your company' },
  { key: 'meeting_time', token: '{{meeting_time}}', label: 'Meeting time', sample: 'Thursday at 2pm' },
  { key: 'callback_time', token: '{{callback_time}}', label: 'Callback time', sample: 'Friday at 10am' },
];

export const MERGE_KEYS = new Set(MERGE_FIELDS.map((f) => f.key));

export type MergeValues = Partial<Record<string, string>>;

export const SAMPLE_MERGE_VALUES: MergeValues = Object.fromEntries(MERGE_FIELDS.map((f) => [f.key, f.sample]));

const TOKEN_RE = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

/** Merge fields used in a text, in order of first use. */
export function mergeFieldsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const k = m[1].toLowerCase();
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

/** Tokens that aren't one of MERGE_FIELDS (typos, invented fields). */
export function unknownMergeFields(text: string): string[] {
  return mergeFieldsIn(text).filter((k) => !MERGE_KEYS.has(k));
}

/**
 * Replace {{tokens}} with values. Missing values stay as the token (`keep`) or become a readable
 * marker such as "[meeting time]" (`marker`), so a rep never sends an empty gap by accident.
 */
export function fillMergeFields(text: string, values: MergeValues, missing: 'keep' | 'marker' = 'keep'): string {
  return text.replace(TOKEN_RE, (whole, key: string) => {
    const v = values[key.toLowerCase()];
    if (v && v.trim()) return v.trim();
    return missing === 'marker' ? `[${key.toLowerCase().replace(/_/g, ' ')}]` : whole;
  });
}

export function countTemplateWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ------------------------------------------------------------------ visibility

/** Can this person see the template? Managers see every team template; private ones only their creator. */
export function canSeeTemplate(t: EmailTemplate, viewer: { email: string; canManage: boolean }): boolean {
  const me = viewer.email.toLowerCase();
  if (t.visibility === 'private') return t.createdBy.toLowerCase() === me;
  if (viewer.canManage) return true;
  if (t.archived) return false;
  return t.assignedTo.length === 0 || t.assignedTo.some((e) => e.toLowerCase() === me);
}

export function isAssignedTo(t: EmailTemplate, email: string): boolean {
  const me = email.toLowerCase();
  return t.visibility === 'team' && (t.assignedTo.length === 0 || t.assignedTo.some((e) => e.toLowerCase() === me));
}

/**
 * The family a call outcome label or tag belongs to, so "Meeting Booked" matches the tag "Booked"
 * and "Call Back Later" matches "Callback" (same rules as outcomeKind in lib/coldEmailAssistant).
 */
export function outcomeFamily(label: string | undefined): string {
  const o = (label || '').toLowerCase().trim();
  if (!o) return '';
  if (/not interested|dnc|opt-out|no budget/.test(o)) return 'not_interested';
  if (/book|meeting|demo/.test(o)) return 'booked';
  if (/callback|call back|follow-up required|send calendar|interested/.test(o)) return 'callback';
  if (/voicemail|no answer|gatekeeper|wrong number|busy/.test(o)) return 'no_connect';
  return o;
}

/** Does the template's outcome tags match this call outcome? */
export function matchesOutcome(t: EmailTemplate, outcome: string | undefined): boolean {
  const o = (outcome || '').toLowerCase().trim();
  if (!o) return false;
  const fam = outcomeFamily(o);
  return t.outcomeTags.some((tag) => {
    const x = tag.toLowerCase().trim();
    return !!x && (o.includes(x) || x.includes(o) || outcomeFamily(x) === fam);
  });
}

/**
 * Templates for a call outcome, best match first (outcome tag match, then purpose follow-up).
 * Used by the Dialer and Cold email pickers.
 */
export function rankTemplatesForOutcome(list: EmailTemplate[], outcome: string | undefined): EmailTemplate[] {
  const score = (t: EmailTemplate) => (matchesOutcome(t, outcome) ? 10 : 0) + (outcome && t.purpose === 'followup' ? 2 : 0);
  return [...list].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------ validation

const PURPOSES = new Set<TemplatePurpose>(TEMPLATE_PURPOSES.map((p) => p.value));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Single-line text: control characters and runs of spaces removed. */
const line = (v: unknown, max: number) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max);

/** Multi-line text: keeps newlines, drops other control characters. */
const block = (v: unknown, max: number) =>
  String(v ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);

export type TemplateValidation =
  | { ok: true; value: TemplateInput }
  | { ok: false; field: keyof TemplateInput | 'body'; error: string };

/** Validate and cap a whole template (merge the stored one with a patch before calling). */
export function validateTemplate(raw: Record<string, unknown>): TemplateValidation {
  const name = line(raw.name, NAME_MAX + 1);
  if (!name) return { ok: false, field: 'name', error: 'Give the template a name.' };
  if (name.length > NAME_MAX) return { ok: false, field: 'name', error: `Keep the name under ${NAME_MAX} characters.` };

  const subject = line(raw.subject, SUBJECT_MAX + 1);
  if (!subject) return { ok: false, field: 'subject', error: 'Add a subject line.' };
  if (subject.length > SUBJECT_MAX) return { ok: false, field: 'subject', error: `Keep the subject under ${SUBJECT_MAX} characters.` };

  const body = block(raw.body, BODY_MAX + 1);
  if (!body) return { ok: false, field: 'body', error: 'Write the email body.' };
  if (body.length > BODY_MAX) return { ok: false, field: 'body', error: `Keep the body under ${BODY_MAX} characters.` };

  const frameworkId = line(raw.frameworkId, FRAMEWORK_ID_MAX).toLowerCase();
  if (frameworkId && !/^[a-z0-9_-]+$/.test(frameworkId)) return { ok: false, field: 'frameworkId', error: 'Unknown framework.' };

  const campaign = line(raw.campaign, CAMPAIGN_MAX + 1);
  if (campaign.length > CAMPAIGN_MAX) return { ok: false, field: 'campaign', error: `Keep the campaign name under ${CAMPAIGN_MAX} characters.` };

  const purpose = (typeof raw.purpose === 'string' ? raw.purpose : 'cold') as TemplatePurpose;
  if (!PURPOSES.has(purpose)) return { ok: false, field: 'purpose', error: 'Pick what the template is for.' };

  const visibility = raw.visibility === 'private' ? 'private' : raw.visibility === 'team' || raw.visibility === undefined ? 'team' : null;
  if (!visibility) return { ok: false, field: 'visibility', error: 'Visibility must be team or private.' };

  if (raw.outcomeTags !== undefined && !Array.isArray(raw.outcomeTags)) return { ok: false, field: 'outcomeTags', error: 'Outcome tags must be a list.' };
  const tags: string[] = [];
  for (const t of (raw.outcomeTags as unknown[] | undefined) ?? []) {
    const v = line(t, TAG_MAX + 1);
    if (!v) continue;
    if (v.length > TAG_MAX) return { ok: false, field: 'outcomeTags', error: `Keep each outcome tag under ${TAG_MAX} characters.` };
    if (!tags.some((x) => x.toLowerCase() === v.toLowerCase())) tags.push(v);
  }
  if (tags.length > TAGS_MAX) return { ok: false, field: 'outcomeTags', error: `Use at most ${TAGS_MAX} outcome tags.` };

  if (raw.assignedTo !== undefined && !Array.isArray(raw.assignedTo)) return { ok: false, field: 'assignedTo', error: 'Assignees must be a list of emails.' };
  const assignedTo: string[] = [];
  for (const e of (raw.assignedTo as unknown[] | undefined) ?? []) {
    const v = line(e, 254).toLowerCase();
    if (!v) continue;
    if (!EMAIL_RE.test(v)) return { ok: false, field: 'assignedTo', error: `"${v.slice(0, 60)}" is not an email address.` };
    if (!assignedTo.includes(v)) assignedTo.push(v);
  }
  if (assignedTo.length > ASSIGNEES_MAX) return { ok: false, field: 'assignedTo', error: `Assign to at most ${ASSIGNEES_MAX} people.` };

  let sequenceStep: number | null = null;
  if (raw.sequenceStep !== undefined && raw.sequenceStep !== null && raw.sequenceStep !== '') {
    const n = Number(raw.sequenceStep);
    if (!Number.isInteger(n) || n < 1 || n > SEQUENCE_STEP_MAX) {
      return { ok: false, field: 'sequenceStep', error: `Sequence step must be 1 to ${SEQUENCE_STEP_MAX}.` };
    }
    sequenceStep = n;
  }

  return {
    ok: true,
    value: {
      name,
      subject,
      body,
      frameworkId,
      campaign,
      purpose,
      outcomeTags: tags,
      visibility,
      // Private templates belong to their creator: no assignees.
      assignedTo: visibility === 'private' ? [] : assignedTo,
      sequenceStep,
      archived: raw.archived === true,
    },
  };
}
