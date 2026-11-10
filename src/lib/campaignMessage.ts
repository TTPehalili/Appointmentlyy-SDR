'use client';

/**
 * The shared "campaign message" behind Outreach: one angle, pain, proof and offer that the cold
 * email assistant and the LinkedIn studio both write from, so a prospect who sees the email and
 * the post hears one consistent story.
 *
 * Lives in browser storage per person and workspace (listed in tenantStorage DATA_KEYS).
 * It also carries the last email draft and LinkedIn post, so either tab can mirror the other.
 */
import { useSyncExternalStore } from 'react';

export const CAMPAIGN_MESSAGE_KEY = 'appointmentlyy_outreach_campaign_v1';
const CHANGE_EVENT = 'appointmentlyy_outreach_campaign_changed';

export interface CampaignCore {
  angle: string;
  pain: string;
  proof: string;
  offer: string;
}

export interface MirroredEmail {
  subject: string;
  body: string;
  at: string;
}

export interface MirroredPost {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  /** Where the post came from: written to mirror an email, or picked in the LinkedIn studio. */
  source: 'email' | 'linkedin';
  at: string;
}

export interface CampaignMessage extends CampaignCore {
  frameworkId: string;
  updatedAt: string;
  lastEmail?: MirroredEmail;
  lastPost?: MirroredPost;
}

export const EMPTY_CAMPAIGN: CampaignMessage = { angle: '', pain: '', proof: '', offer: '', frameworkId: 'auto', updatedAt: '' };

const str = (v: unknown, max = 600) => (typeof v === 'string' ? v.slice(0, max) : '');

function parse(raw: string | null): CampaignMessage {
  if (!raw) return EMPTY_CAMPAIGN;
  try {
    const o = JSON.parse(raw) as Partial<CampaignMessage>;
    return {
      angle: str(o.angle),
      pain: str(o.pain),
      proof: str(o.proof),
      offer: str(o.offer),
      frameworkId: str(o.frameworkId, 60) || 'auto',
      updatedAt: str(o.updatedAt, 40),
      lastEmail: o.lastEmail && typeof o.lastEmail.body === 'string' ? o.lastEmail : undefined,
      lastPost: o.lastPost && typeof o.lastPost.body === 'string' ? o.lastPost : undefined,
    };
  } catch {
    return EMPTY_CAMPAIGN;
  }
}

let cachedRaw: string | null | undefined;
let cachedValue: CampaignMessage = EMPTY_CAMPAIGN;

export function getCampaignMessage(): CampaignMessage {
  if (typeof window === 'undefined') return EMPTY_CAMPAIGN;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(CAMPAIGN_MESSAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = parse(raw);
  }
  return cachedValue;
}

export function saveCampaignMessage(patch: Partial<CampaignMessage>): CampaignMessage {
  const next: CampaignMessage = { ...getCampaignMessage(), ...patch, updatedAt: new Date().toISOString() };
  try {
    localStorage.setItem(CAMPAIGN_MESSAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('[campaignMessage] could not save', err);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return next;
}

/** Fill only the fields that are still empty (never overwrite what the rep typed). */
export function fillEmptyCampaignFields(found: Partial<CampaignCore>) {
  const current = getCampaignMessage();
  const patch: Partial<CampaignCore> = {};
  (['angle', 'pain', 'proof', 'offer'] as const).forEach((k) => {
    const value = found[k]?.trim();
    if (value && !current[k].trim()) patch[k] = value;
  });
  if (Object.keys(patch).length > 0) saveCampaignMessage(patch);
}

export function isCampaignEmpty(c: CampaignCore): boolean {
  return !c.angle.trim() && !c.pain.trim() && !c.proof.trim() && !c.offer.trim();
}

/** One line per filled field, for prompts and for seeding an idea box. */
export function describeCampaign(c: CampaignCore): string {
  return [
    c.angle.trim() && `Angle: ${c.angle.trim()}`,
    c.pain.trim() && `Pain: ${c.pain.trim()}`,
    c.proof.trim() && `Proof: ${c.proof.trim()}`,
    c.offer.trim() && `Offer / CTA: ${c.offer.trim()}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function postText(p: Pick<MirroredPost, 'hook' | 'body' | 'cta' | 'hashtags'>): string {
  return [p.hook, p.body, p.cta, (p.hashtags || []).join(' ')].map((s) => s.trim()).filter(Boolean).join('\n\n');
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === CAMPAIGN_MESSAGE_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useCampaignMessage(): CampaignMessage {
  return useSyncExternalStore(subscribe, getCampaignMessage, () => EMPTY_CAMPAIGN);
}
