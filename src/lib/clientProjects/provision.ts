/**
 * "Provision workspace from a Client Project" (Phase 1): shared types and the starter-template rules. Plain module (no
 * 'use client', no server APIs): the owner's Provision tab shows the same rule check live that the server enforces on
 * Seed. The server logic is in src/lib/server/clientProjects/provision.ts.
 *
 * Every step is owner-clicked, previewed first and idempotent; the record lives in project.settings.provision.
 */
import { TEMPLATE_WORD_LIMIT, countTemplateWords, unknownMergeFields, validateTemplate, type TemplatePurpose } from '@/lib/emailTemplates';

export const PROVISION_STEPS = ['workspace', 'branding', 'logo', 'members', 'invites', 'templates'] as const;
export type ProvisionStep = (typeof PROVISION_STEPS)[number];
export const PROVISION_STEP_LABEL: Record<ProvisionStep, string> = {
  workspace: 'Create the workspace',
  branding: 'Apply branding',
  logo: 'Logo',
  members: 'Create members',
  invites: 'Send invites',
  templates: 'Starter email templates',
};
/** Steps 1 to 4 (the workspace, its brand and logo, its people and their invites): together they complete the SOP card. */
export const CORE_STEPS: ProvisionStep[] = ['workspace', 'branding', 'logo', 'members', 'invites'];
/** The SOP card that "steps 1 to 4 done" completes (a task, never a gate). */
export const WORKSPACE_SOP_KEY = 'workspace';

/** done = everything asked for is in place (a re-run that changed nothing is still done); partial = some rows did not. */
export type StepStatus = 'done' | 'partial' | 'failed';

export interface StepRecord {
  status: StepStatus;
  at: string;
  /** 'owner:<email>'. */
  by: string;
  /** One plain sentence, counts only (no client-typed text). */
  summary: string;
  runs: number;
}

export const STARTER_KEYS = ['cold-1', 'cold-2', 'followup', 'breakup', 'reply'] as const;
export type StarterKey = (typeof STARTER_KEYS)[number];
export const STARTER_PURPOSE: Record<StarterKey, TemplatePurpose> = { 'cold-1': 'cold', 'cold-2': 'cold', followup: 'followup', breakup: 'breakup', reply: 'reply' };
export const STARTER_LABEL: Record<StarterKey, string> = { 'cold-1': 'Cold email 1', 'cold-2': 'Cold email 2', followup: 'Follow-up', breakup: 'Break-up', reply: 'Reply' };
export const STARTER_STEP: Record<StarterKey, number | null> = { 'cold-1': 1, 'cold-2': null, followup: 2, breakup: 3, reply: null };
export const STARTER_CAMPAIGN = 'Starter templates';

export interface TemplateDraft {
  key: StarterKey;
  purpose: TemplatePurpose;
  name: string;
  subject: string;
  body: string;
}

export interface ProvisionRecord {
  steps: Partial<Record<ProvisionStep, StepRecord>>;
  /** The workspace this project's provisioning created (so a half-finished create resumes instead of colliding). */
  createdCode?: string | null;
  /** Step 1 is about to create this code (saved BEFORE createTenant, so a crash in between can still resume it, while a
   *  workspace that existed before is never taken over). */
  pending?: { code: string; at: string } | null;
  /** The first admin picked in step 1 (they get their invite email with everyone else in "Send invites"). */
  adminEmail?: string | null;
  /** Invite emails sent by "Send invites", by address (a re-run never emails the same person twice). */
  sent?: Record<string, string>;
  templates?: {
    drafts: TemplateDraft[];
    draftedAt: string;
    mode: 'live' | 'stub';
    /** The figures in the client's own answers and scripts when the drafts were made (the "no invented stats" check). */
    sourceNumbers: string[];
    seeded: { key: StarterKey; id: string; at: string }[];
  };
  /** When steps 1 to 4 completed the SOP "workspace" card (null/absent = not yet). */
  sopCompletedAt?: string | null;
}

// ------------------------------------------------------------------ the starter-template rules

const LINK_RE = /(?:\b[a-z][a-z0-9+.-]{1,15}:\/\/|\bwww\.)[^\s<>"')\]]+|\b[a-z0-9.-]+\.(?:com|net|org|io|co|app|dev|ph|nz|au|uk|ru|cn|info|biz|xyz|link|site|top|ai|ly|gl|gd|gg|sh|cc|tv|ca|eu|de|sg|vn|page|online|store|tech|cloud|click|email|live|pro|ws|li|fr|nl|ch|jp|kr|hk|tw)\b(?:\/[^\s<>"')\]]*)?|\b[a-z0-9-]+\.[a-z]{2,24}\/[^\s<>"')\]]*/i;
const EMAIL_IN_TEXT_RE = /[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}/i;

/**
 * The numbers in a text, normalised ("25,000" -> "25000"). A digit run glued to a letter in front ("B2B", "Q4") is not
 * a figure and is skipped.
 */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const before = text[(m.index ?? 0) - 1] ?? '';
    if (/[A-Za-z]/.test(before)) continue;
    out.push(m[0].replace(/,/g, ''));
  }
  return out;
}

/**
 * Why a starter template may not be seeded, as plain sentences (empty = it may). `sourceNumbers` are the figures that
 * appear in the client's own answers and scripts: any other number in the template is treated as an invented stat.
 */
export function templateIssues(t: { name: string; subject: string; body: string; purpose?: string }, sourceNumbers: string[]): string[] {
  const issues: string[] = [];
  const v = validateTemplate({ name: t.name, subject: t.subject, body: t.body, purpose: t.purpose ?? 'cold', visibility: 'team' });
  if (!v.ok) issues.push(v.error);
  const all = `${t.subject}\n${t.body}`;
  const words = countTemplateWords(t.body);
  if (words > TEMPLATE_WORD_LIMIT) issues.push(`${words} words: keep the body at ${TEMPLATE_WORD_LIMIT} words or fewer.`);
  if (LINK_RE.test(all) || /\[link removed\]/i.test(all)) issues.push('No links: remove the link (or the “[link removed]” marker).');
  if (EMAIL_IN_TEXT_RE.test(all)) issues.push('No email addresses in the template.');
  if (/fully[\s-]*automat/i.test(all)) issues.push('Never say “fully automated”.');
  if (/\bexclusiv/i.test(all)) issues.push('No exclusivity claims (lists, leads or data).');
  if (/\brented\b/i.test(all) || /\brent(?:al|ing|s)?\s+(?:a\s+)?(?:lists?|leads?|data(?:bases?)?|contacts?)\b/i.test(all)) issues.push('Say “shared lists”, never “rented”.');
  const allowed = new Set(sourceNumbers);
  const invented = [...new Set(numbersIn(all))].filter((n) => !allowed.has(n));
  if (invented.length) issues.push(`Numbers not in the client’s own answers: ${invented.slice(0, 5).join(', ')}. Remove them or use the client’s figures.`);
  const unknown = unknownMergeFields(all);
  if (unknown.length) issues.push(`Unknown merge fields: ${unknown.map((k) => `{{${k}}}`).join(', ')}.`);
  return issues;
}
