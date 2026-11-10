'use client';

/**
 * Browser calls to /api/email-templates (the workspace comes from the session cookie, never from
 * here). Used by the Templates tab, and later by the Cold email and Dialer template pickers.
 */
import type { EmailTemplate, TemplateInput } from '@/lib/emailTemplates';

export interface TemplateList {
  templates: EmailTemplate[];
  campaigns: string[];
  canManage: boolean;
  me: string;
}

export interface WorkspaceMember {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
}

type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: string; status: number; field?: string };

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => null)) as (Record<string, unknown> & { success?: boolean; error?: string; field?: string }) | null;
    if (!res.ok || !data || data.success === false) {
      return { ok: false, status: res.status, error: data?.error || `Request failed (${res.status}).`, field: data?.field };
    }
    return { ok: true, ...(data as T) };
  } catch {
    return { ok: false, status: 0, error: 'Could not reach the server. Check your connection.' };
  }
}

export const fetchTemplates = (opts: { archived?: boolean } = {}) =>
  call<TemplateList>(`/api/email-templates${opts.archived ? '?archived=1' : ''}`);

export const createTemplate = (input: Partial<TemplateInput>) =>
  call<{ template: EmailTemplate }>('/api/email-templates', { method: 'POST', body: JSON.stringify(input) });

export const updateTemplate = (id: string, patch: Partial<TemplateInput>) =>
  call<{ template: EmailTemplate }>(`/api/email-templates/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteTemplate = (id: string) =>
  call<Record<string, never>>(`/api/email-templates/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** Workspace members (Supervisor and above only; the same list the admin People page uses). */
export async function fetchMembers(): Promise<WorkspaceMember[]> {
  const r = await call<{ members: WorkspaceMember[] }>('/api/tenant/members');
  return r.ok ? r.members.filter((m) => m.status !== 'removed') : [];
}
