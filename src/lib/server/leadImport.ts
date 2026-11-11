/**
 * Rows for the Supabase `leads` table from a CSV import (server-only, pure: no I/O).
 * Every row carries the importing workspace's tenant code, taken from the session by the caller.
 * Column added in supabase/migrations/20261114000000_leads_tenant.sql.
 */
import type { Lead } from '@/types';

export interface LeadRowContext {
  tenantCode: string;
  campaignId: string;
  assignedRepId: string | null;
}

export function toLeadRows(leads: Lead[], ctx: LeadRowContext): Record<string, unknown>[] {
  if (!ctx.tenantCode) throw new Error('toLeadRows needs a tenant code');
  return leads.map((l) => ({
    tenant_code: ctx.tenantCode,
    campaign_id: ctx.campaignId === 'enterprise-outbound' ? null : ctx.campaignId,
    assigned_rep_id: ctx.assignedRepId,
    first_name: l.first_name,
    last_name: l.last_name,
    email: l.email,
    phone: l.phone,
    company: l.company,
    title: l.title,
    status: l.status,
    custom_variables: l.custom_variables,
  }));
}
