import { AUTOMATION_INFO, STATUS_LABEL, type AutomationRule, type CpEvent, type TaskStatus } from '@/lib/clientProjects/types';

const s = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
const status = (v: unknown) => STATUS_LABEL[v as TaskStatus] ?? s(v);
const UNIFIED_TEXT: Record<string, string> = { not_started: 'not started', in_progress: 'in progress', waiting_on_us: 'waiting on us', complete: 'complete' };

/** Who did it, for the activity log: the owner's email, the client's name as typed, or the system. */
export function actorLabel(actor: string): string {
  if (actor.startsWith('owner:')) return actor.slice(6);
  if (actor.startsWith('client:')) return `${actor.slice(7)} (client)`;
  return 'System';
}

/** One plain sentence per event. */
export function eventText(e: CpEvent): string {
  const d = e.detail ?? {};
  const key = s(d.key);
  const k = key ? `${key} ` : '';
  switch (e.type) {
    case 'project_created':
      return `Project created${d.cards ? ` with ${s(d.cards)} cards from the SOP` : ''}`;
    case 'project_updated':
      return `Project updated: ${Array.isArray(d.changed) ? d.changed.map(s).join(', ') : ''}`;
    case 'task_created':
      return `${k}created: ${s(d.title)}`;
    case 'task_updated':
      return `${k}edited (${Array.isArray(d.changed) ? d.changed.map(s).join(', ') : ''})`;
    case 'task_deleted':
      return `${k}deleted: ${s(d.title)}`;
    case 'status_changed':
      return `${k}${status(d.from)} → ${status(d.to)}${d.because ? ` (${s(d.because)})` : ''}`;
    case 'severity_changed':
      return `${k}severity ${s(d.from)} → ${s(d.to)}; fix due ${s(d.fixDue)}`;
    case 'client_tick':
      return `${k}ticked by the client: ${s(d.title)}`;
    case 'client_untick':
      return `${k}unticked by the client: ${s(d.title)}`;
    case 'client_claims_done':
      return `${k}the client says this is done (not confirmed): ${s(d.title)}`;
    case 'client_defect':
      return `${k}defect reported by the client (${s(d.severity)} proposed): ${s(d.title)}`;
    case 'retest_confirmed':
      return `${k}retest ${d.confirmed ? 'confirmed' : 'confirmation withdrawn'} by the client`;
    case 'comment':
      return `${k}comment added${d.clientVisible ? '' : ' (internal)'}`;
    case 'client_delay':
      return d.state === 'done_late' ? `${k}Client Delay: completed ${s(d.days)} business day(s) late (due ${s(d.dueDate)})` : `${k}Client Delay: open past its due date (${s(d.dueDate)})`;
    case 'share_enabled':
      return 'Client board shared (new link)';
    case 'share_disabled':
      return 'Client board sharing turned off (the link no longer works)';
    case 'share_reissued':
      return 'Client board link replaced (the old link no longer works)';
    case 'file_added':
      return `Document added: ${s(d.name)} (${s(d.pages)} pages)`;
    case 'file_removed':
      return `Document removed: ${s(d.name)}`;
    case 'ai_run_started':
      return 'AI plan draft started';
    case 'ai_draft_ready':
      return `AI plan draft ready (${s(d.tasks)} cards) for review`;
    case 'ai_failed':
      return `AI plan draft failed: ${s(d.error)}`;
    case 'ai_discarded':
      return 'AI plan draft discarded';
    case 'plan_approved':
      return `Plan approved: ${s(d.created)} cards created, ${s(d.updated)} updated`;
    case 'status_drafted':
      return 'Status update drafted (not sent)';
    case 'client_update_published':
      return d.cleared ? 'Client update removed from the board' : 'Client update approved and shown on the board';
    case 'automation': {
      const rule = AUTOMATION_INFO[d.rule as AutomationRule]?.title ?? s(d.rule);
      const bits = [
        Array.isArray(d.unblocked) && d.unblocked.length ? `unblocked ${d.unblocked.map(s).join(', ')}` : '',
        Array.isArray(d.milestones) && d.milestones.length ? `checkpoints done: ${d.milestones.map(s).join(', ')}` : '',
        d.kind ? `${s(d.kind).replace('_', ' ')} reminder` : '',
        d.trigger === 'comment' && d.count ? `${s(d.count)} new client comment(s)` : d.trigger === 'claim' ? 'client says done' : '',
        d.rule === 'us_overdue_digest' && d.count ? `${s(d.count)} overdue` : '',
        Array.isArray(d.ready) && d.ready.length ? `ready for you: ${d.ready.map(s).join(', ')}` : '',
        d.pending === true ? 'in progress' : '',
        Array.isArray(d.ready) && d.ready.length ? s(d.note).split(';')[0] : s(d.note),
      ].filter(Boolean);
      return `Automation · ${rule}${key ? ` · ${key}` : ''}${bits.length ? `: ${bits.join('; ')}` : ''}`;
    }
    case 'intake': {
      // Never any client-typed text here (file names, domains, answers): this sentence also reaches Copilot's model.
      const v = d.version ? ` v${s(d.version)}` : '';
      const moved = d.from && d.to && d.from !== d.to ? ` (${UNIFIED_TEXT[s(d.to)] ?? s(d.to)})` : '';
      const what: Record<string, string> = {
        draft_saved: 'draft saved by the client',
        submitted: `form${v} submitted for review`,
        accepted: `submission${v} accepted`,
        changes_requested: `changes requested on${v}`,
        applied: `applied: ${Array.isArray(d.targets) ? d.targets.map(s).join(', ') : ''}`,
        file_added: `file uploaded (${s(d.kind).toUpperCase()}, ${Math.max(1, Math.round(Number(d.size || 0) / 1024))} KB)`,
        file_removed: 'file removed by the client',
        domain_set: 'sending domain set',
        dns_checked: `DNS checked: ${s(d.ok)} of ${s(d.total)} records found`,
        keys_checked: `provider keys checked: ${s(d.ok)} of ${s(d.total)} passed`,
        envelope_linked: d.envelopeId ? `Agreements envelope linked${d.auto ? ' automatically' : ''}` : 'Agreements envelope unlinked',
        envelope_status: `Agreements envelope ${s(d.status)}`,
        deemed_confirmed: `deemed confirmed: no response within 2 business days of ${s(d.sentOn)}`,
        paid_claimed: 'the client says it is paid',
        payment_received: `payment received (recorded by us${d.via === 'agreements' ? ' in Agreements' : ''})`,
        payment_not_received: 'payment not received yet: follow-up',
        payment_reset: 'payment status set to awaiting payment',
        uat_complete: 'UAT complete: the certificate is signed',
        request_attached: 'client intake step attached',
        intake_enabled: 'Client Intake turned on',
        intake_disabled: 'Client Intake turned off',
        workspace_set: d.tenantCode ? `client workspace set to ${s(d.tenantCode)}` : 'client workspace cleared',
        config: 'client intake settings changed',
      };
      return `${k}${what[s(d.action)] ?? s(d.action)}${moved}`;
    }
    default:
      return e.type;
  }
}
