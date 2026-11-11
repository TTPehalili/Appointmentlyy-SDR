'use client';

/**
 * Browser calls for Meeting Action Plans (contract: src/lib/meetingPlan.ts). The workspace always
 * comes from the session cookie on the server, never from here.
 */
import type {
  ActionPlan,
  Assignee,
  CompanyProfile,
  CompanyProfileInput,
  CreateMeetingPlanInput,
  MeetingPlan,
  MeetingPlanStatus,
  MeetingPlanSummary,
  OnePagerCopy,
  PolishOnePagerInput,
  UpdateMeetingPlanInput,
} from '@/lib/meetingPlan';
import type { OnePagerBrand } from '@/lib/onePagerRender';
import type { Tone } from '@/components/ui';

export type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: string; status: number; field?: string; code?: string };

const FRIENDLY: Record<number, string> = {
  401: 'Your session has ended. Please sign in again.',
  403: 'You don’t have permission to do that.',
  404: 'We couldn’t find that meeting plan. It may have been removed.',
  429: 'Too many requests right now. Please wait a moment and try again.',
};

async function call<T>(url: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: init?.signal,
    });
    const data = (await res.json().catch(() => null)) as (Record<string, unknown> & { error?: string; message?: string; field?: string; code?: string }) | null;
    if (!res.ok || !data) {
      return {
        ok: false,
        status: res.status,
        error: data?.error || data?.message || FRIENDLY[res.status] || `Something went wrong (${res.status}). Please try again.`,
        field: data?.field,
        code: data?.code,
      };
    }
    return { ok: true, ...(data as T) };
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return { ok: false, status: 0, error: 'Cancelled.' };
    return { ok: false, status: 0, error: 'Could not reach the server. Check your connection and try again.' };
  }
}

const planUrl = (id: string) => `/api/meeting-plans/${encodeURIComponent(id)}`;

export const meetingPlansApi = {
  list: (contactKey?: string) =>
    call<{ plans: MeetingPlanSummary[] }>(`/api/meeting-plans${contactKey ? `?contactKey=${encodeURIComponent(contactKey)}` : ''}`),
  assignees: () => call<{ assignees: Assignee[] }>('/api/meeting-plans/assignees'),
  create: (input: CreateMeetingPlanInput) => call<{ plan: MeetingPlan }>('/api/meeting-plans', { body: input }),
  get: (id: string) => call<{ plan: MeetingPlan; brand: OnePagerBrand }>(planUrl(id)),
  update: (id: string, patch: UpdateMeetingPlanInput) => call<{ plan: MeetingPlan }>(planUrl(id), { method: 'PATCH', body: patch }),
  regenerate: (id: string) => call<{ plan: MeetingPlan }>(`${planUrl(id)}/regenerate`, { method: 'POST', body: {} }),
  polish: (id: string, input: PolishOnePagerInput, signal?: AbortSignal) =>
    call<{ onePager: OnePagerCopy }>(`${planUrl(id)}/polish`, { body: input, signal }),
  pdfUrl: (id: string) => `${planUrl(id)}/pdf`,
  getProfile: () => call<{ profile: CompanyProfile | null }>('/api/tenant/profile'),
  saveProfile: (profile: CompanyProfileInput) => call<{ profile: CompanyProfile }>('/api/tenant/profile', { method: 'PUT', body: { profile } }),
  draftProfile: (website: string) => call<{ profile: CompanyProfileInput }>('/api/tenant/profile/draft', { body: { website } }),
};

export const STATUS_TONE: Record<MeetingPlanStatus, Tone> = {
  preparing: 'brand',
  ready: 'success',
  failed: 'danger',
  sent: 'neutral',
};

/** "just now", "5 min ago", "3 h ago", "Mon 4 Nov". */
export function formatUpdated(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, now - t);
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** The rep's meeting time is free text; show ISO values in a readable local form. */
export function formatMeetingAt(raw: string | undefined | null): string {
  const v = (raw || '').trim();
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    }
  }
  return v;
}

export function toHref(url: string | undefined | null): string {
  const v = (url || '').trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export function displayHost(url: string | undefined | null): string {
  return (url || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
}

export const sameEmail = (a: string | undefined | null, b: string | undefined | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Join note sources into one block, dropping blanks, duplicates and pieces already contained in another. */
export function mergeNotes(parts: (string | null | undefined)[]): string {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const cleaned = parts.map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean);
  const out: string[] = [];
  for (const p of cleaned) {
    const n = norm(p);
    if (out.some((o) => norm(o).includes(n))) continue;
    // A later, longer block that contains an earlier one replaces it.
    for (let i = out.length - 1; i >= 0; i -= 1) if (n.includes(norm(out[i]))) out.splice(i, 1);
    out.push(p);
  }
  return out.join('\n\n');
}

const bullets = (items: string[] | undefined, prefix = '- ') => (items || []).filter(Boolean).map((i) => `${prefix}${i}`).join('\n');

/** The Action Plan as plain text (for Copy). */
export function planToText(p: MeetingPlan): string {
  const a = p.plan;
  const r = p.research;
  const lines: string[] = [];
  lines.push(`MEETING PLAN: ${p.lead.name}${p.lead.company ? `, ${p.lead.company}` : ''}`);
  const when = formatMeetingAt(p.call.meetingAt);
  if (when) lines.push(`When: ${when}`);
  if (p.assignedAeName || p.assignedAe) lines.push(`Account Executive: ${p.assignedAeName || p.assignedAe}`);
  if (p.lead.website) lines.push(`Website: ${p.lead.website}`);
  if (a) {
    lines.push('', `GOAL\n${a.meetingGoal}`);
    lines.push('', `CALL SUMMARY\n${a.callSummary.recap}`);
    if (a.callSummary.keyPoints.length) lines.push(bullets(a.callSummary.keyPoints));
    if (a.callSummary.prospectQuotes.length) lines.push('Quotes:', bullets(a.callSummary.prospectQuotes.map((q) => `"${q}"`)));
    if (a.callSummary.agreedNextStep) lines.push(`Agreed next step: ${a.callSummary.agreedNextStep}`);
  }
  if (r) {
    lines.push('', `RESEARCH\n${r.overview}`);
    if (r.whatTheyDo) lines.push(`What they do: ${r.whatTheyDo}`);
    if (r.sizeAndSegment) lines.push(`Size & segment: ${r.sizeAndSegment}`);
    if (r.recentSignals.length) lines.push('Recent signals:', bullets(r.recentSignals));
    if (r.likelyPriorities.length) lines.push('Likely priorities:', bullets(r.likelyPriorities));
    if (r.painHypotheses.length) lines.push('Pain hypotheses:', bullets(r.painHypotheses));
    if (r.sources.length) lines.push('Sources:', bullets(r.sources.map((s) => `${s.title}: ${s.url}`)));
  } else if (a?.researchSummary) {
    lines.push('', `RESEARCH\n${a.researchSummary}`);
  }
  if (a) {
    if (a.agenda.length) {
      lines.push('', 'AGENDA');
      a.agenda.forEach((it, i) => {
        lines.push(`${i + 1}. ${it.topic}${it.minutes ? ` (${it.minutes} min)` : ''}`);
        if (it.whyItMatters) lines.push(`   Why: ${it.whyItMatters}`);
        if (it.mapsTo) lines.push(`   Maps to: ${it.mapsTo}`);
        it.questions.filter(Boolean).forEach((q) => lines.push(`   ? ${q}`));
      });
    }
    if (a.discoveryQuestions.length) {
      lines.push('', 'DISCOVERY QUESTIONS');
      a.discoveryQuestions.forEach((q) => lines.push(`- ${q.question}${q.purpose ? ` (${q.purpose})` : ''}`));
    }
    if (a.likelyObjections.length) {
      lines.push('', 'LIKELY OBJECTIONS');
      a.likelyObjections.forEach((o) => lines.push(`- ${o.objection}\n  -> ${o.response}`));
    }
    if (a.risks.length) lines.push('', 'RISKS & UNKNOWNS', bullets(a.risks));
    if (a.proposedNextSteps.length) lines.push('', 'NEXT STEPS', bullets(a.proposedNextSteps));
  }
  return lines.join('\n');
}

/** A blank Action Plan (for editing when the AI left something empty). */
export function emptyActionPlan(): ActionPlan {
  return {
    callSummary: { recap: '', keyPoints: [], prospectQuotes: [], agreedNextStep: '' },
    researchSummary: '',
    meetingGoal: '',
    agenda: [],
    discoveryQuestions: [],
    likelyObjections: [],
    risks: [],
    proposedNextSteps: [],
  };
}

export function emptyOnePager(): OnePagerCopy {
  return { headline: '', subheadline: '', whatWeHeard: [], whyItMatters: [], nextSteps: [], howWeHelp: [], cta: '' };
}

/** Plain-text version of the one-pager (for "Copy email text" when sending is paused). */
export function onePagerToText(c: OnePagerCopy): string {
  const out: string[] = [c.headline, c.subheadline].filter(Boolean);
  if (c.whatWeHeard.length) out.push('', 'What we heard', bullets(c.whatWeHeard));
  if (c.whyItMatters.length) out.push('', 'Why it matters', bullets(c.whyItMatters));
  if (c.nextSteps.length) out.push('', 'Agreed next steps', bullets(c.nextSteps.map((s) => `${s.step}${s.when ? ` (${s.when})` : ''}`)));
  if (c.howWeHelp.length) out.push('', 'How we can help', bullets(c.howWeHelp.map((h) => `${h.title}: ${h.detail}`)));
  if (c.cta) out.push('', c.cta);
  return out.join('\n');
}
