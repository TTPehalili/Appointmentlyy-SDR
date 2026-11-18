import { AUTOMATION_INFO, STATUS_LABEL, type AutomationRule, type CpEvent, type TaskStatus } from '@/lib/clientProjects/types';

const s = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
const status = (v: unknown) => STATUS_LABEL[v as TaskStatus] ?? s(v);

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
    default:
      return e.type;
  }
}
