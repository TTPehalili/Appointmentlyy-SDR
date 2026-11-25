import type { TroubleTicket } from '@/lib/ticketTypes';
import { ROLE_RANK, type Role } from '@/lib/roles';
import type { TicketScope } from '@/lib/server/supportTickets';

/**
 * Who sees which support tickets (server-enforced; every ticket route goes through these):
 *   - Appointmentlyy platform staff: every workspace, internal notes included.
 *   - Supervisor and above: every ticket in their own workspace.
 *   - Rep / Account Executive: only the tickets they filed.
 * Internal notes never leave for anyone but staff. The captured context and screenshots (which may show lead data)
 * go only to the person who filed and to staff, not to the rest of the workspace.
 */
export interface TicketViewer {
  isPlatformAdmin: boolean;
  tenantCode: string;
  email: string;
  role: Role;
}

export function ticketScopeFor(v: TicketViewer): TicketScope {
  if (v.isPlatformAdmin) return { kind: 'all' };
  if ((ROLE_RANK[v.role] ?? 0) >= ROLE_RANK.Supervisor) return { kind: 'workspace', tenantCode: v.tenantCode };
  return { kind: 'own', tenantCode: v.tenantCode, email: v.email };
}

/** The person this ticket is for (in its workspace), or the staff member who filed it on their behalf. */
export function isTicketReporter(t: TroubleTicket, v: TicketViewer): boolean {
  const me = v.email.trim().toLowerCase();
  if (t.tenantCode !== v.tenantCode) return false;
  return t.requesterEmail.toLowerCase() === me || (!!t.filedByEmail && t.filedByEmail.toLowerCase() === me);
}

export function canViewTicket(t: TroubleTicket, v: TicketViewer): boolean {
  const s = ticketScopeFor(v);
  if (s.kind === 'all') return true;
  if (t.tenantCode !== s.tenantCode) return false;
  return s.kind === 'workspace' || t.requesterEmail.toLowerCase() === s.email.trim().toLowerCase();
}

/** Screenshots and captured context: the reporter and staff only. */
export function canSeeReporterFiles(t: TroubleTicket, v: TicketViewer): boolean {
  return v.isPlatformAdmin || isTicketReporter(t, v);
}

/** What this viewer may receive of a ticket they can view. */
export function ticketViewFor(t: TroubleTicket, v: TicketViewer): TroubleTicket {
  if (v.isPlatformAdmin) return t;
  const files = canSeeReporterFiles(t, v);
  return {
    ...t,
    filedByEmail: undefined,
    context: files ? t.context : undefined,
    attachments: files ? t.attachments : undefined,
    attachmentCount: t.attachmentCount ?? t.attachments?.length ?? 0,
    messages: t.messages.filter((m) => !m.isInternalNote),
  };
}
