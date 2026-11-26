'use client';

import * as React from 'react';
import { Bot, CheckCircle2, Clock, GitCommit, Link2, RefreshCw, Send, Sparkles, Wrench, X } from 'lucide-react';
import { Badge, Button, InlineError, Input, Switch, Textarea } from '@/components/ui';
import type { TroubleTicket } from '@/lib/ticketTypes';
import { areaLabel } from '@/lib/supportReport';
import { helpArticleTitle } from '@/lib/helpContent';
import { SEVERITY_LABEL, SLA_WORDS, TRIAGE_TYPE_LABEL, dueInWords, slaPassed, type Severity } from '@/lib/supportAutomation';

/**
 * Support step 2 in the desks (src/components/tickets/TicketDeskHub.tsx):
 *   - AutomationBar, TriagePanel, FixPanel: Platform › Support (staff only; the server sends these fields to staff only).
 *   - SupportSummaryLine: the client-safe line (type, severity, target time) for Admin › Support.
 */

const when = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const SEV_TONE: Record<Severity, 'danger' | 'warning' | 'neutral'> = { critical: 'danger', high: 'warning', normal: 'neutral' };

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok && data.success !== false, data };
  } catch {
    return { ok: false, data: { error: 'Check your connection and try again.' } };
  }
}
const errOf = (d: Record<string, unknown>, fallback: string) => (typeof d.error === 'string' && d.error) || fallback;

/** "SLA passed" / "Due in 3h" chip for a ticket row or header (staff). */
export function SlaBadge({ ticket }: { ticket: TroubleTicket }) {
  const a = ticket.automation;
  if (!a?.slaDueAt) return null;
  if (slaPassed(a, ticket.status)) return <Badge tone="danger"><Clock className="size-3" aria-hidden />SLA passed</Badge>;
  return null;
}

export function TypeBadge({ ticket }: { ticket: TroubleTicket }) {
  const ai = ticket.automation?.triage?.ai;
  if (!ai) return null;
  return <Badge tone={ai.type === 'bug' ? 'warning' : 'neutral'}>{TRIAGE_TYPE_LABEL[ai.type]}</Badge>;
}

/** Staff ticket header: type, severity, SLA and fix state at a glance, with a jump to the AI triage panel below. */
export function TriageChips({ ticket }: { ticket: TroubleTicket }) {
  const a = ticket.automation;
  if (!a || a.triageState === 'none') return null;
  const jump = () => document.querySelector('[data-testid="triage-panel"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="triage-chips">
      <TypeBadge ticket={ticket} />
      {a.severity && <Badge tone={SEV_TONE[a.severity]}>Severity: {SEVERITY_LABEL[a.severity]}</Badge>}
      <SlaBadge ticket={ticket} />
      {a.fix.state === 'fix_ready' && <Badge tone="brand">Fix ready</Badge>}
      {a.fix.state === 'sent' && <Badge tone="success">Resolution sent</Badge>}
      <button type="button" onClick={jump} className="focus-ring rounded-sm px-1 text-caption text-fg-secondary underline underline-offset-2 hover:text-fg">
        AI triage and fix
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ the client-safe line (Admin › Support)

export function SupportSummaryLine({ ticket }: { ticket: TroubleTicket }) {
  const s = ticket.support;
  if (!s || (!s.type && !s.severity)) return null;
  const open = ticket.status === 'open' || ticket.status === 'in_progress';
  return (
    <div className="flex flex-wrap items-center gap-2 text-small text-fg-secondary" data-testid="support-summary">
      {s.type && <Badge tone="neutral">{TRIAGE_TYPE_LABEL[s.type]}</Badge>}
      {s.severity && <Badge tone={SEV_TONE[s.severity]}>Severity: {SEVERITY_LABEL[s.severity]}</Badge>}
      {s.severity && s.slaDueAt && open && (
        <span className="flex items-center gap-1 text-fg-tertiary">
          <Clock className="size-3.5" aria-hidden />
          Target: within {SLA_WORDS[s.severity]} (by {when(s.slaDueAt)})
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ AI triage (staff)

export function TriagePanel({ ticket, onUseDraft, onOpenTicket }: { ticket: TroubleTicket; onUseDraft: (text: string) => void; onOpenTicket: (id: string) => void }) {
  const a = ticket.automation;
  if (!a || a.triageState === 'none') return null;
  const tr = a.triage;
  const ai = tr?.ai ?? null;
  const pending = a.triageState === 'pending' || a.triageState === 'running';
  // A how-to answer is offered only when it cites the Help center; otherwise the plain reply draft.
  const draft = ai?.type === 'how_to' && ai.howTo?.answer && ai.howTo.citations.length ? ai.howTo.answer : ai?.replyDraft || '';
  return (
    <section className="rounded-lg border border-line bg-surface p-4 shadow-xs space-y-3" data-testid="triage-panel" aria-label="AI triage">
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="size-4 text-fg-secondary" aria-hidden />
        <h3 className="text-body-strong text-fg">AI triage</h3>
        {pending && <Badge tone="neutral">Working…</Badge>}
        {ai && <Badge tone={ai.type === 'bug' ? 'warning' : 'neutral'} >{TRIAGE_TYPE_LABEL[ai.type]}</Badge>}
        {a.severity && <Badge tone={SEV_TONE[a.severity]}>Severity: {SEVERITY_LABEL[a.severity]}</Badge>}
        {ai && <span className="text-caption text-fg-tertiary tabular-nums">confidence {Math.round(ai.confidence * 100)}%</span>}
        {ai && <span className="text-caption text-fg-tertiary">area {areaLabel(ai.area) || ai.area}</span>}
        <SlaBadge ticket={ticket} />
      </div>
      {a.slaDueAt && (
        <p className="text-small text-fg-secondary" data-testid="triage-sla">
          SLA {a.severity ? `${SEVERITY_LABEL[a.severity]} (${SLA_WORDS[a.severity]})` : ''}: due {dueInWords(a.slaDueAt)}
          {a.slaBreachAt ? ` · "needs more time" sent ${when(a.slaBreachAt)}` : ''}
          {a.workingEmailAt ? ` · "working on it" sent ${when(a.workingEmailAt)}` : ''}
          {a.autoAnswerAt ? ` · answered automatically ${when(a.autoAnswerAt)}` : ''}
        </p>
      )}
      {!ai && tr?.reason && (
        <p className="text-small text-fg-secondary" data-testid="triage-reason">
          {a.triageState === 'skipped' ? 'Not triaged by AI' : 'AI triage failed'}: {tr.reason}. A person handles this ticket.
        </p>
      )}
      {ai?.summary && <p className="text-body text-fg">{ai.summary}</p>}
      {tr?.duplicateOf && (
        <p className="text-small text-fg-secondary flex flex-wrap items-center gap-1" data-testid="triage-duplicate">
          <Link2 className="size-3.5" aria-hidden />
          Looks like the same problem as
          <button type="button" className="focus-ring font-mono text-caption underline underline-offset-2 text-fg" onClick={() => onOpenTicket(tr.duplicateOf!.id)}>
            {tr.duplicateOf.id}
          </button>
          <span className="text-fg-tertiary">({tr.duplicateOf.tenantName}: {tr.duplicateOf.subject})</span>
        </p>
      )}
      {ai?.howTo && ai.type === 'how_to' && (
        <div className="space-y-1">
          <div className="text-caption text-fg-tertiary">
            How-to answer from the Help center ({Math.round(ai.howTo.confidence * 100)}%)
            {ai.howTo.citations.length ? `: ${ai.howTo.citations.map((c) => helpArticleTitle(c) || c).join('; ')}` : ': no article cited'}
          </div>
        </div>
      )}
      {draft && (
        <div className="space-y-2">
          <div className="text-caption text-fg-tertiary">{draft === ai?.howTo?.answer ? 'Answer draft' : 'Suggested reply'} (customer-safe)</div>
          <div className="rounded-md border border-line bg-subtle px-3 py-2 text-body text-fg whitespace-pre-wrap break-words" data-testid="triage-draft">{draft}</div>
          <Button size="sm" variant="secondary" icon={<Sparkles />} onClick={() => onUseDraft(draft)}>
            Use as reply
          </Button>
        </div>
      )}
      {ai?.brief && (
        <details className="rounded-md border border-line" data-testid="triage-brief" open>
          <summary className="focus-ring cursor-pointer px-3 py-2 text-body-strong text-fg">Engineering brief (internal)</summary>
          <div className="space-y-2 border-t border-line px-3 py-2 text-small text-fg">
            {ai.brief.summary && <p className="whitespace-pre-wrap break-words">{ai.brief.summary}</p>}
            {ai.brief.reproSteps.length > 0 && (
              <div>
                <div className="text-caption text-fg-tertiary">Steps to reproduce</div>
                <ol className="list-decimal pl-5">{ai.brief.reproSteps.map((s, i) => <li key={i} className="break-words">{s}</li>)}</ol>
              </div>
            )}
            {ai.brief.suspectedArea && <p><span className="text-fg-tertiary">Suspected area: </span>{ai.brief.suspectedArea}</p>}
            {ai.brief.suspectedFiles.length > 0 && (
              <div>
                <div className="text-caption text-fg-tertiary">Suspected files</div>
                <ul className="font-mono text-caption break-all">{ai.brief.suspectedFiles.map((f) => <li key={f}>{f}</li>)}</ul>
              </div>
            )}
            {ai.brief.checks.length > 0 && (
              <div>
                <div className="text-caption text-fg-tertiary">What to check</div>
                <ul className="list-disc pl-5">{ai.brief.checks.map((s, i) => <li key={i} className="break-words">{s}</li>)}</ul>
              </div>
            )}
          </div>
        </details>
      )}
      {tr?.model && <p className="text-caption text-fg-tertiary">AI: {tr.model} · {when(tr.at)}. AI text is a suggestion: check it before you send it.</p>}
    </section>
  );
}

// ------------------------------------------------------------------ Fix ready (staff)

/** Rendered with key={ticket.id}, so its form starts fresh for each ticket (and not on every poll of the same one). */
export function FixPanel({ ticket, onTicket }: { ticket: TroubleTicket; onTicket: (t: TroubleTicket) => void }) {
  const fix = ticket.automation?.fix;
  const [editing, setEditing] = React.useState(false);
  const [sha, setSha] = React.useState(fix?.sha ?? '');
  const [reply, setReply] = React.useState(fix?.reply ?? '');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [confirmSend, setConfirmSend] = React.useState(false);
  if (!ticket.automation || ticket.source === 'billing') return null;
  const state = fix?.state ?? 'none';
  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action);
    setError(null);
    setInfo(null);
    const r = await call(`/api/tickets/${encodeURIComponent(ticket.id)}/fix`, 'POST', { action, ...extra });
    setBusy(null);
    if (!r.ok) {
      setError(errOf(r.data, 'That did not work. Please try again.'));
      return null;
    }
    if (r.data.ticket) onTicket(r.data.ticket as TroubleTicket);
    return r.data;
  };
  const draft = async () => {
    const d = await act('draft');
    if (d && typeof d.draft === 'string') {
      setReply(d.draft);
      setInfo(d.by === 'ai' ? 'Drafted by AI. Check it, edit it, then save.' : `Template used${d.reason ? ` (${d.reason})` : ''}. Edit it, then save.`);
    }
  };
  const save = async () => {
    const d = await act('save', { sha: sha.trim() || null, reply, resend: state === 'sent' });
    if (d) {
      setEditing(false);
      setInfo('Saved. The reply goes out once that release is live.');
    }
  };
  return (
    <section className="rounded-lg border border-line bg-surface p-4 shadow-xs space-y-3" data-testid="fix-panel" aria-label="Fix and resolution reply">
      <div className="flex flex-wrap items-center gap-2">
        <Wrench className="size-4 text-fg-secondary" aria-hidden />
        <h3 className="text-body-strong text-fg">Fix and resolution reply</h3>
        {state === 'fix_ready' && <Badge tone="brand" >Fix ready{fix?.sha ? ` · ${fix.sha.slice(0, 7)}` : ''}</Badge>}
        {state === 'sending' && <Badge tone="warning">Sending…</Badge>}
        {state === 'sent' && <Badge tone="success"><CheckCircle2 className="size-3" aria-hidden />Reply sent {when(fix?.sentAt)}</Badge>}
      </div>
      {!editing && state === 'none' && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-small text-fg-secondary min-w-0 flex-1">When a fix is ready, link it to its release. The reporter is emailed (and the ticket resolved) once that release is live.</p>
          <Button size="sm" variant="secondary" icon={<Wrench />} onClick={() => setEditing(true)}>
            Mark fix ready
          </Button>
        </div>
      )}
      {!editing && state !== 'none' && fix && (
        <div className="space-y-2">
          <p className="text-small text-fg-secondary">
            {state === 'sent' ? 'Sent' : 'Goes out'} {fix.sha ? <>with release <span className="font-mono text-caption">{fix.sha.slice(0, 12)}</span></> : 'when you send it (no release linked)'}
            {fix.markedBy ? ` · marked by ${fix.markedBy}` : ''}
          </p>
          <div className="rounded-md border border-line bg-subtle px-3 py-2 text-body text-fg whitespace-pre-wrap break-words" data-testid="fix-reply">{fix.reply}</div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setSha(fix.sha ?? ''); setReply(fix.reply); setEditing(true); }}>
              {state === 'sent' ? 'Mark fixed again' : 'Edit'}
            </Button>
            {state === 'fix_ready' && !confirmSend && (
              <Button size="sm" variant="secondary" icon={<Send />} onClick={() => setConfirmSend(true)}>
                Send now
              </Button>
            )}
            {state === 'fix_ready' && confirmSend && (
              <>
                <span className="text-small text-fg">Is the fix live? This emails the reporter now.</span>
                <Button size="sm" variant="primary" loading={busy === 'send'} onClick={async () => { setConfirmSend(false); await act('send'); }}>
                  Yes, send
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmSend(false)}>
                  Not yet
                </Button>
              </>
            )}
            {state === 'fix_ready' && (
              <Button size="sm" variant="ghost" icon={<X />} loading={busy === 'cancel'} onClick={() => void act('cancel')}>
                Remove
              </Button>
            )}
          </div>
        </div>
      )}
      {editing && (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-caption text-fg-tertiary">Release commit (the commit that will be published)</span>
            <Input mono value={sha} onChange={(e) => setSha(e.target.value)} placeholder="e.g. 3978054" maxLength={40} aria-label="Release commit" leadingIcon={<GitCommit />} />
          </label>
          <label className="block space-y-1">
            <span className="text-caption text-fg-tertiary">Resolution reply (plain English; the email adds &quot;please refresh&quot;)</span>
            <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} maxLength={4000} aria-label="Resolution reply" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" icon={<Sparkles />} loading={busy === 'draft'} onClick={() => void draft()}>
              Draft with AI
            </Button>
            <Button size="sm" variant="primary" loading={busy === 'save'} onClick={() => void save()}>
              Save fix ready
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {info && <p className="text-small text-success-fg" role="status">{info}</p>}
      {error && <InlineError message={error} />}
    </section>
  );
}

// ------------------------------------------------------------------ automation bar (staff)

interface Status {
  deployedSha: string | null;
  uptimeMs: number;
  healthyAfterMs: number;
  worker: { enabled: boolean; started: boolean; everyMs: number; last: { at: string; slaUpdates: number; triageRetried: number; release: { sent: number; reason?: string } | null; error?: string } | null };
  ai: { provider: string; on: boolean; cap: number; tenantCap: number; usedToday: number; byTenant: { tenantCode: string; used: number; exempt: boolean }[] };
  emails: { on: boolean };
  env: { aiTriage: boolean; autoEmails: boolean; cap: number; tenantCap: number };
  settings: { aiTriage: boolean; autoEmails: boolean; aiDailyCap: number | null; aiTenantDailyCap: number | null; updatedBy: string; updatedAt: string | null };
  fixReady: { id: string; subject: string; tenantName: string; sha: string | null; live: boolean }[];
}

/** `version` changes whenever the desk reloads its tickets, so the counts follow without a poll of their own. */
export function AutomationBar({ onChanged, version }: { onChanged: () => void; version: number }) {
  const [status, setStatus] = React.useState<Status | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [cap, setCap] = React.useState('');
  const [tenantCap, setTenantCap] = React.useState('');
  const [confirmSend, setConfirmSend] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const apply = React.useCallback((r: { ok: boolean; data: Record<string, unknown> }) => {
    if (r.ok && r.data.status) {
      setStatus(r.data.status as Status);
      setError(null);
    } else setError(errOf(r.data, 'Automation status could not be loaded.'));
  }, []);
  const load = React.useCallback(async () => apply(await call('/api/tickets/automation', 'GET')), [apply]);
  React.useEffect(() => {
    let alive = true;
    call('/api/tickets/automation', 'GET').then((r) => {
      if (alive) apply(r);
    });
    return () => {
      alive = false;
    };
  }, [apply, version]);
  const patch = async (body: Record<string, unknown>) => {
    setBusy('patch');
    const r = await call('/api/tickets/automation', 'PATCH', body);
    setBusy(null);
    if (r.ok && r.data.status) setStatus(r.data.status as Status);
    else setError(errOf(r.data, 'The change was not saved.'));
  };
  const post = async (action: string) => {
    setBusy(action);
    setNote(null);
    const r = await call('/api/tickets/automation', 'POST', { action });
    setBusy(null);
    if (!r.ok) {
      setError(errOf(r.data, 'That did not work.'));
      return;
    }
    if (r.data.status) setStatus(r.data.status as Status);
    const run = (r.data.run ?? (r.data.result as { release?: unknown } | undefined)?.release) as { sent?: number; failed?: number; reason?: string } | undefined;
    if (action === 'send') setNote(`${run?.sent ?? 0} resolved repl${run?.sent === 1 ? 'y' : 'ies'} sent${run?.failed ? `, ${run.failed} failed (see the tickets)` : ''}.`);
    else {
      const res = r.data.result as { slaUpdates?: number; triageRetried?: number; release?: { sent?: number; reason?: string } | null } | undefined;
      setNote(`Checked: ${res?.slaUpdates ?? 0} SLA update(s), ${res?.release?.sent ?? 0} release repl${res?.release?.sent === 1 ? 'y' : 'ies'}${res?.release?.reason ? ` (${res.release.reason})` : ''}.`);
    }
    onChanged();
  };
  if (!status && !error) return null;
  const s = status;
  const waiting = s?.fixReady.length ?? 0;
  return (
    <div className="border-b border-line bg-subtle px-4 py-2 text-small" data-testid="automation-bar">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-1.5 text-fg-secondary">
          <Bot className="size-3.5" aria-hidden />
          Support AI <Badge tone={s?.ai.on && s.ai.provider !== 'off' ? 'success' : 'neutral'}>{!s ? '…' : !s.ai.on ? 'Off' : s.ai.provider === 'off' ? 'No key' : 'On'}</Badge>
          {s && <span className="text-caption text-fg-tertiary tabular-nums">{s.ai.usedToday}/{s.ai.cap} today</span>}
        </span>
        <span className="flex items-center gap-1.5 text-fg-secondary">
          Auto emails <Badge tone={s?.emails.on ? 'success' : 'neutral'}>{s?.emails.on ? 'On' : 'Off'}</Badge>
        </span>
        <span className="flex items-center gap-1.5 text-fg-secondary">
          <GitCommit className="size-3.5" aria-hidden />
          Live commit <span className="font-mono text-caption text-fg">{s?.deployedSha ? s.deployedSha.slice(0, 7) : 'unknown'}</span>
        </span>
        <span className="text-fg-secondary">
          Fix ready <span className="tabular-nums text-fg">{waiting}</span>
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!confirmSend ? (
            <Button size="sm" variant="secondary" icon={<Send />} disabled={!waiting} onClick={() => setConfirmSend(true)}>
              Send resolved replies now
            </Button>
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-fg">Email {waiting} reporter{waiting === 1 ? '' : 's'} that the fix is live?</span>
              <Button size="sm" variant="primary" loading={busy === 'send'} onClick={async () => { setConfirmSend(false); await post('send'); }}>
                Yes, send
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmSend(false)}>
                Cancel
              </Button>
            </span>
          )}
          <Button size="sm" variant="ghost" icon={<RefreshCw />} loading={busy === 'check'} onClick={() => void post('check')}>
            Run checks
          </Button>
          <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => { setOpen((o) => !o); setCap(s?.settings.aiDailyCap === null || s?.settings.aiDailyCap === undefined ? '' : String(s.settings.aiDailyCap)); setTenantCap(s?.settings.aiTenantDailyCap === null || s?.settings.aiTenantDailyCap === undefined ? '' : String(s.settings.aiTenantDailyCap)); }}>
            Settings
          </Button>
        </div>
      </div>
      {note && <p className="mt-1 text-success-fg" role="status">{note}</p>}
      {error && <div className="mt-1"><InlineError message={error} onRetry={() => void load()} /></div>}
      {open && s && (
        <div className="mt-2 grid gap-3 rounded-md border border-line bg-surface p-3 sm:grid-cols-3" data-testid="automation-settings">
          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-body-strong text-fg">Support AI</span>
              <span className="block text-caption text-fg-tertiary">{s.env.aiTriage ? 'Triage, answers and drafts' : 'Off on the server (SUPPORT_AI_TRIAGE)'}</span>
            </span>
            <Switch label="Support AI" checked={s.settings.aiTriage} disabled={busy === 'patch'} onCheckedChange={(v) => void patch({ aiTriage: v })} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-body-strong text-fg">Automatic emails</span>
              <span className="block text-caption text-fg-tertiary">{s.env.autoEmails ? 'Answers, working on it, more time, fixed' : 'Off on the server (SUPPORT_AUTO_EMAILS)'}</span>
            </span>
            <Switch label="Automatic emails" checked={s.settings.autoEmails} disabled={busy === 'patch'} onCheckedChange={(v) => void patch({ autoEmails: v })} />
          </div>
          <div className="space-y-1">
            <span className="block text-body-strong text-fg">AI calls per day</span>
            <div className="flex items-center gap-2">
              <Input value={cap} onChange={(e) => setCap(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} placeholder={`${s.env.cap} (default)`} inputMode="numeric" aria-label="AI calls per day" className="w-28" />
              <Button size="sm" variant="secondary" disabled={busy === 'patch'} onClick={() => void patch({ aiDailyCap: cap === '' ? null : Number(cap) })}>
                Save
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <span className="block text-body-strong text-fg">AI calls per workspace per day</span>
            <div className="flex items-center gap-2">
              <Input value={tenantCap} onChange={(e) => setTenantCap(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} placeholder={`${s.env.tenantCap} (default)`} inputMode="numeric" aria-label="AI calls per workspace per day" className="w-28" />
              <Button size="sm" variant="secondary" disabled={busy === 'patch'} onClick={() => void patch({ aiTenantDailyCap: tenantCap === '' ? null : Number(tenantCap) })}>
                Save
              </Button>
            </div>
            <span className="block text-caption text-fg-tertiary">The Appointmentlyy workspace counts against the daily total only.</span>
          </div>
          {s.ai.byTenant.length > 0 && (
            <div className="sm:col-span-2" data-testid="automation-tenant-usage">
              <div className="text-caption text-fg-tertiary">AI calls today by workspace</div>
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                {s.ai.byTenant.map((u) => (
                  <li key={u.tenantCode} className="flex items-center gap-1.5">
                    <span className="font-mono text-caption">{u.tenantCode}</span>
                    <span className="tabular-nums text-fg">{u.used}{u.exempt ? '' : `/${s.ai.tenantCap}`}</span>
                    {!u.exempt && u.used >= s.ai.tenantCap && <Badge tone="warning">limit reached</Badge>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {s.fixReady.length > 0 && (
            <div className="sm:col-span-3">
              <div className="text-caption text-fg-tertiary">Fix ready</div>
              <ul className="mt-1 space-y-0.5">
                {s.fixReady.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-caption">{f.id}</span>
                    <span className="truncate text-fg">{f.subject}</span>
                    <span className="font-mono text-caption text-fg-tertiary">{f.sha ? f.sha.slice(0, 7) : 'no release'}</span>
                    {f.live && <Badge tone="success">live here</Badge>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="sm:col-span-3 text-caption text-fg-tertiary">
            Replies for a release go out about {Math.round(s.healthyAfterMs / 60000)} min after that commit starts on this server. Checks run every {Math.round(s.worker.everyMs / 1000)} s
            {s.worker.last ? `; last ${when(s.worker.last.at)}` : ''}.
            {s.settings.updatedBy ? ` Switches last changed by ${s.settings.updatedBy}.` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
