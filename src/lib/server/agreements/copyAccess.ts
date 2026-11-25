/**
 * Server only. Access helpers for copy (CC) recipients' view-only links. A copy has its own opens
 * (its `cc_viewed` events), so "Maximum opens" applies to each copy separately and never uses up
 * the signer's opens.
 */
import { getAgreementStore } from '@/lib/server/agreementStore';
import type { Envelope } from '@/lib/agreements/envelope';

export async function copyOpens(envelopeId: string, ccId: string): Promise<number> {
  const events = await getAgreementStore().listEvents(envelopeId);
  return events.filter((ev) => ev.type === 'cc_viewed' && ev.data?.ccId === ccId).length;
}

export async function copyOpensExhausted(e: Envelope, ccId: string): Promise<boolean> {
  if (e.access.maxOpens === null) return false;
  return (await copyOpens(e.id, ccId)) >= e.access.maxOpens;
}
