/**
 * Everything needed to draw the customer one-pager, both as the on-screen preview
 * (src/components/meetings/OnePagerPreview.tsx) and as the PDF (src/lib/server/meetingPlan/onePagerPdf.tsx).
 * Browser + server safe.
 */
import type { LeadSnapshot, OnePagerCopy } from '@/lib/meetingPlan';

export interface OnePagerBrand {
  /** The workspace's company name (branding display name, else tenant name). */
  companyName: string;
  /** Hex colour, e.g. "#0F766E". Empty = Appointmentlyy default. */
  brandColor?: string;
  /** Two letters for the logo tile. */
  logoInitials?: string;
  /** From the Company profile, when set. */
  website?: string;
}

export interface OnePagerRenderData {
  copy: OnePagerCopy;
  lead: Pick<LeadSnapshot, 'name' | 'company' | 'title'>;
  /** Agreed meeting time as entered by the rep. */
  meetingAt?: string;
  brand: OnePagerBrand;
  /** The Account Executive the customer will meet. */
  ae: { name: string; email: string };
}

export const DEFAULT_BRAND_COLOR = '#4F46E5';

/** Accepts "#abc" / "#aabbcc"; anything else falls back to the default. */
export function safeBrandColor(raw: string | undefined): string {
  const v = (raw || '').trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : DEFAULT_BRAND_COLOR;
}

/** File name for the PDF, e.g. "Acme-Logistics-meeting-recap.pdf". */
export function onePagerFileName(company: string): string {
  const slug = (company || 'meeting').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'meeting';
  return `${slug}-meeting-recap.pdf`;
}
