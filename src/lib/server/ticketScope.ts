import type { TroubleTicket } from '@/lib/ticketTypes';

/** Clients only see their own workspace's tickets, without Appointmentlyy's internal notes. */
export function scopeTicketsFor(tickets: TroubleTicket[], session: { isPlatformAdmin: boolean; tenantCode: string }): TroubleTicket[] {
  if (session.isPlatformAdmin) return tickets;
  return tickets
    .filter((t) => t.tenantCode === session.tenantCode)
    .map((t) => ({ ...t, messages: t.messages.filter((m) => !m.isInternalNote) }));
}
