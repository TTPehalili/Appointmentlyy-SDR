'use client';

/** Shared bits for the owner's Agreements console (types, guard, status chip, small helpers). */
import * as React from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Badge, EmptyState, Skeleton } from '@/components/ui';
import { useServerAuth } from '@/lib/authClient';
import type { AgreementTemplate } from '@/lib/agreements/templates/types';
import {
  STATUS_LABEL,
  STATUS_TONE,
  fmtDuration,
  fmtManila,
  type AgreementSettings,
  type EnvelopeStatus,
  type EnvelopeView,
} from '@/lib/agreements/envelope';

export type TemplateSummary = Omit<AgreementTemplate, 'title' | 'render'>;

export interface MailStatus {
  configured: boolean;
  outbox: boolean;
  problem: string | null;
}

export interface ListResponse {
  envelopes: EnvelopeView[];
  templates: TemplateSummary[];
  settings: AgreementSettings;
  mail: MailStatus;
  storage: 'supabase' | 'file';
}

export function StatusChip({ status, concern }: { status: EnvelopeStatus; concern?: boolean }) {
  if (concern && status === 'completed') return <Badge tone="warning">Concern raised</Badge>;
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

/** "Opened 3 times · 14 min · read to page 18 of 18 · last seen 10:42" */
export function trackingSummary(e: EnvelopeView): string {
  if (!e.opens) return e.sentAt ? 'Not opened yet' : 'Not sent yet';
  const parts = [`Opened ${e.opens} ${e.opens === 1 ? 'time' : 'times'}`, fmtDuration(e.viewSeconds)];
  if (e.pageCount) parts.push(`read to page ${e.maxPage || 1} of ${e.pageCount}`);
  if (e.lastActivityAt) parts.push(`last seen ${fmtManila(e.lastActivityAt)}`);
  return parts.join(' · ');
}

/** Owner-only: platform staff in the Appointmentlyy workspace. Others see a short explanation. */
export function OwnerGate({ children }: { children: React.ReactNode }) {
  const { status, identity } = useServerAuth();
  if (status === 'unknown') {
    return (
      <div className="flex flex-col gap-3 px-4 py-6 md:px-8">
        <Skeleton className="h-8 w-1/4" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!identity?.isPlatformAdmin || identity.tenantCode !== 'APPOINTMENTLYY') {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={<Lock />}
          title="Agreements are for the platform owner"
          description={identity?.isPlatformAdmin ? 'Switch back to the Appointmentlyy workspace to use Agreements.' : 'This area is not available in your workspace.'}
          action={
            <Link href="/" className="focus-ring inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3.5 text-body font-medium text-fg hover:bg-subtle">
              Go home
            </Link>
          }
        />
      </div>
    );
  }
  return <>{children}</>;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** ISO UTC -> <input type="datetime-local"> value in the browser's time zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Fetch a PDF from an owner route as bytes for the viewer. */
export async function fetchPdf(url: string, init?: { body?: unknown }): Promise<ArrayBuffer | { error: string }> {
  const res = await fetch(url, {
    method: init?.body ? 'POST' : 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: d.error || 'Could not load the PDF.' };
  }
  return res.arrayBuffer();
}
