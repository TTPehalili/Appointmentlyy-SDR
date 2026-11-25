/**
 * Agreements (owner-only e-signature): envelope types and small helpers shared by the server and
 * the owner console / signer pages. Browser + server safe (no Node imports).
 */
import type { SignerFormField, TemplateAction } from '@/lib/agreements/templates/types';

export type EnvelopeStatus = 'draft' | 'sent' | 'opened' | 'signed' | 'completed' | 'declined' | 'expired' | 'revoked';

export const ENVELOPE_STATUSES: EnvelopeStatus[] = ['draft', 'sent', 'opened', 'signed', 'completed', 'declined', 'expired', 'revoked'];

/** Before the client has signed: access rules can still change, the link can be revoked. */
export const UNSIGNED_STATUSES: EnvelopeStatus[] = ['sent', 'opened'];

export interface EnvelopeRecipient {
  name: string;
  title: string;
  email: string;
}

/**
 * A copy (CC) recipient: gets a "for your information" email with their OWN view-only link (never the
 * signer's link), and the final copy on completion. A copy can never sign, decline or get a code.
 */
export interface CcRecipient {
  /** Short random id (base64url), stable for the envelope's life. */
  id: string;
  name: string;
  email: string;
  /** sha256 of the view-only link token (set when sent; cleared when removed). */
  tokenHash: string | null;
  /** The token sealed (AES-GCM) for re-sending; never sent to a browser. */
  tokenSealed: string | null;
  addedAt: string;
  /** Removed by the owner: the link stops working (token cleared). Kept for the record. */
  removedAt: string | null;
}

/** At most 5 copies: 6 recipients in all, with the signer. */
export const CC_LIMITS = { max: 5, totalRecipients: 6 };

export interface AccessRules {
  /** ISO UTC. The link stops working after this (until signed). */
  expiresAt: string;
  openFrom: string | null;
  openUntil: string | null;
  maxOpens: number | null;
  requireOtpToView: boolean;
  /** After completion, the client's download link works for this many days. */
  downloadDays: number;
}

export type SignatureKind = 'drawn' | 'typed' | 'none';

/** What the client did, as recorded on the Execution page and the Certificate. */
export interface SignerRecord {
  name: string;
  title: string;
  email: string;
  signatureKind: SignatureKind;
  /** acknowledge templates: confirmed, or raised a concern. */
  outcome: 'signed' | 'confirmed' | 'concern';
  concern?: string;
  signedAt: string;
  ip: string;
  userAgent: string;
}

export interface OwnerSignatureRecord {
  name: string;
  title: string;
  signedAt: string;
  ip: string;
  userAgent: string;
}

/** The template's signing setup, frozen when the envelope is created or sent. */
export interface TemplateMeta {
  name: string;
  action: TemplateAction;
  countersign: boolean;
  signerForm: SignerFormField[];
}

export interface Envelope {
  id: string;
  templateId: string;
  templateMeta: TemplateMeta | null;
  title: string;
  fieldValues: Record<string, string>;
  recipient: EnvelopeRecipient;
  /** Copy recipients (view only). Empty when none, or before the `cc` column exists in the database. */
  cc: CcRecipient[];
  access: AccessRules;
  status: EnvelopeStatus;
  originalSha256: string | null;
  finalSha256: string | null;
  pageCount: number;
  tokenHash: string | null;
  tokenSealed: string | null;
  opens: number;
  viewSeconds: number;
  maxPage: number;
  pagesSeen: number[];
  signerFormValues: Record<string, unknown> | null;
  signer: SignerRecord | null;
  ownerSignature: OwnerSignatureRecord | null;
  declineReason: string | null;
  /** Billing statements ('view' templates): number, amount due and payments. */
  billing: BillingInfo | null;
  /** Per visit (key = visit id): seconds visible and pages seen, from that visit's heartbeats. */
  visitStats: Record<string, VisitStat>;
  notified: { firstOpen?: boolean; signed?: boolean; declined?: boolean; expiring?: boolean };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  firstOpenedAt: string | null;
  lastActivityAt: string | null;
  signedAt: string | null;
  completedAt: string | null;
  declinedAt: string | null;
  revokedAt: string | null;
}

export type AgreementEventType =
  | 'created'
  | 'updated'
  | 'sent'
  | 'resent'
  | 'email_failed'
  | 'opened'
  | 'otp_sent'
  | 'otp_verified'
  | 'otp_failed'
  | 'signed'
  | 'acknowledged'
  | 'concern'
  | 'declined'
  | 'countersigned'
  | 'completed'
  | 'final_emailed'
  | 'access_changed'
  | 'revoked'
  | 'expired'
  | 'downloaded'
  | 'payment_recorded'
  | 'payment_emailed'
  | 'pay_link_clicked'
  | 'completion_retried'
  // Copy (CC) recipients: kept apart from the signer's events (never counted as the signer's views).
  | 'cc_sent'
  | 'cc_email_failed'
  | 'cc_viewed'
  | 'cc_removed'
  | 'cc_final_emailed'
  | 'cc_downloaded'
  | 'cc_pay_link_clicked';

export interface AgreementEvent {
  id: string;
  envelopeId: string;
  type: AgreementEventType;
  at: string;
  ip: string | null;
  userAgent: string | null;
  data: Record<string, unknown>;
}

export interface AgreementSettings {
  /** Where owner notifications go (first open, signed, declined, expiring). */
  ownerEmail: string;
  /** Owner's name and title on the Execution page. */
  ownerName: string;
  ownerTitle: string;
  /** Sender identity for every agreement email (invite, OTP, completion copy). */
  senderName: string;
  senderEmail: string;
  replyTo: string;
  /** Owner has a saved countersignature (the image itself is never sent to the browser list). */
  hasSavedSignature: boolean;
  /** Default free-text payment note for billing statements (optional; printed last in "How to pay"). Never hard-coded. */
  paymentInstructions: string;
  /** Default Wise "Pay now" link (https:// only) and QR image (PNG data URL, any provider) for billing statements. */
  paymentLink: string;
  paymentQr: string;
  /** Default bank transfer details for billing statements (sensitive: never logged). Currency defaults to USD. */
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankSwift: string;
  bankBranch: string;
  bankCurrency: string;
  /** Default PayPal link (https://paypal.me or paypal.com only) and an optional fee note printed under it. */
  paypalLink: string;
  paypalFeeNote: string;
}

/** Owner decision 2026-11-16: emails go out as Emil Halili <emil@appointmentlyy.com>. Editable in settings. */
export const DEFAULT_AGREEMENT_SETTINGS: AgreementSettings = {
  ownerEmail: 'emil@appointmentlyy.com',
  ownerName: 'Emil Libatique Halili',
  ownerTitle: 'Independent Contractor (Appointmentlyy)',
  senderName: 'Emil Halili',
  senderEmail: 'emil@appointmentlyy.com',
  replyTo: 'emil@appointmentlyy.com',
  hasSavedSignature: false,
  paymentInstructions: '',
  paymentLink: '',
  paymentQr: '',
  bankName: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankSwift: '',
  bankBranch: '',
  bankCurrency: 'USD',
  paypalLink: '',
  paypalFeeNote: '',
};

export const AGREEMENT_LIMITS = {
  titleMax: 200,
  nameMax: 120,
  emailMax: 254,
  fieldValueMax: 20_000,
  reasonMax: 2000,
  /** Signature PNG, decoded. */
  signatureMaxBytes: 200 * 1024,
  maxOpensMax: 1000,
  downloadDaysMax: 365,
  defaultExpiryDays: 3,
  defaultDownloadDays: 30,
  otpTtlMinutes: 10,
  otpMaxAttempts: 5,
  otpCooldownSeconds: 60,
};

export const STATUS_LABEL: Record<EnvelopeStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  opened: 'Opened',
  signed: 'Client signed',
  completed: 'Completed',
  declined: 'Declined',
  expired: 'Expired',
  revoked: 'Revoked',
};

export const STATUS_TONE: Record<EnvelopeStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'brand'> = {
  draft: 'neutral',
  sent: 'brand',
  opened: 'brand',
  signed: 'warning',
  completed: 'success',
  declined: 'danger',
  expired: 'neutral',
  revoked: 'danger',
};

export const MANILA_TZ = 'Asia/Manila';

/** "16 Nov 2026, 10:42 AM" in Asia/Manila. */
export function fmtManila(iso: string | null | undefined, withSeconds = false): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    timeZone: MANILA_TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: true,
  });
}

/** "14 min", "1 h 5 min", "40 s". */
export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Plain-English device from a user agent ("Chrome on Windows"). */
export function describeDevice(ua: string | null | undefined): string {
  const u = ua || '';
  if (!u) return 'Unknown device';
  const browser = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : 'Browser';
  const os = /iPhone|iPad/.test(u) ? 'iOS' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows' : /Mac OS X/.test(u) ? 'macOS' : /Linux/.test(u) ? 'Linux' : 'unknown system';
  return `${browser} on ${os}`;
}

/** Owner-safe view of a copy recipient (no token hash or sealed token). */
export type CcView = Omit<CcRecipient, 'tokenHash' | 'tokenSealed'> & { hasLink: boolean };

/** Owner-safe view of an envelope (no token hash or sealed token, for the signer or any copy). */
export type EnvelopeView = Omit<Envelope, 'tokenHash' | 'tokenSealed' | 'cc'> & { hasLink: boolean; cc: CcView[] };

export function toEnvelopeView(e: Envelope): EnvelopeView {
  const { tokenHash: _h, tokenSealed, cc, ...rest } = e;
  void _h;
  return {
    ...rest,
    hasLink: Boolean(tokenSealed),
    cc: (cc ?? []).map(({ tokenHash: _ch, tokenSealed: cs, ...c }) => {
      void _ch;
      return { ...c, hasLink: Boolean(cs) };
    }),
  };
}

/** Active copies: not removed. */
export const activeCopies = <T extends { removedAt: string | null }>(cc: T[] | undefined): T[] => (cc ?? []).filter((c) => !c.removedAt);

/** One copy recipient as the owner sees it: email status and their own (separate) views. */
export interface CopyStatus {
  id: string;
  name: string;
  email: string;
  removedAt: string | null;
  hasLink: boolean;
  /** not_sent: draft, or never emailed; sent: last email went out; failed: last email failed; removed. */
  state: 'not_sent' | 'sent' | 'failed' | 'removed';
  lastSentAt: string | null;
  lastError: string | null;
  finalSentAt: string | null;
  views: { at: string; device: string; ip: string | null }[];
}

/** Copy statuses from the envelope and its events (copy views never touch the signer's counters). */
export function copyStatuses(cc: CcView[], events: AgreementEvent[]): CopyStatus[] {
  return cc.map((c) => {
    const mine = events.filter((ev) => ev.type.startsWith('cc_') && ev.data?.ccId === c.id);
    const mails = mine.filter((ev) => ev.type === 'cc_sent' || ev.type === 'cc_email_failed');
    const last = mails[mails.length - 1];
    const finals = mine.filter((ev) => ev.type === 'cc_final_emailed' && ev.data?.ok === true);
    const state: CopyStatus['state'] = c.removedAt ? 'removed' : !last ? 'not_sent' : last.type === 'cc_sent' ? 'sent' : 'failed';
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      removedAt: c.removedAt,
      hasLink: c.hasLink,
      state,
      lastSentAt: [...mails].reverse().find((ev) => ev.type === 'cc_sent')?.at ?? null,
      lastError: last?.type === 'cc_email_failed' && typeof last.data?.error === 'string' ? last.data.error : null,
      finalSentAt: finals[finals.length - 1]?.at ?? null,
      views: mine.filter((ev) => ev.type === 'cc_viewed').map((ev) => ({ at: ev.at, device: describeDevice(ev.userAgent), ip: ev.ip })),
    };
  });
}

// ------------------------------------------------------------------ billing statements

export interface BillingPayment {
  /** YYYY-MM-DD, as received. */
  date: string;
  reference: string;
  amount: number;
  recordedAt: string;
  by: string;
}

export interface BillingInfo {
  /** APY-SOA-2026-0001 */
  number: string;
  currency: string;
  total: number;
  /** YYYY-MM-DD */
  dueDate: string | null;
  payments: BillingPayment[];
  /** The proposal envelope this statement was created from, if any. */
  sourceEnvelopeId: string | null;
}

export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overdue';

export const PAYMENT_LABEL: Record<PaymentStatus, string> = { unpaid: 'Unpaid', partial: 'Part paid', paid: 'Paid', overdue: 'Overdue' };
export const PAYMENT_TONE: Record<PaymentStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'brand'> = {
  unpaid: 'brand',
  partial: 'warning',
  paid: 'success',
  overdue: 'danger',
};

export const paidSoFar = (b: BillingInfo) => Math.round(b.payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
export const balanceOf = (b: BillingInfo) => Math.max(0, Math.round((b.total - paidSoFar(b)) * 100) / 100);

/** Paid when the balance is zero; overdue after the due date (Manila); part paid with some money in. */
export function paymentStatus(b: BillingInfo, now = Date.now()): PaymentStatus {
  if (b.total > 0 && balanceOf(b) <= 0) return 'paid';
  if (b.dueDate) {
    const today = new Date(now).toLocaleDateString('en-CA', { timeZone: MANILA_TZ });
    if (today > b.dueDate) return 'overdue';
  }
  return paidSoFar(b) > 0 ? 'partial' : 'unpaid';
}

export function fmtMoney(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// ------------------------------------------------------------------ per-view breakdown

export interface VisitStat {
  seconds: number;
  pages: number[];
}

export interface ViewRow {
  at: string;
  device: string;
  ip: string | null;
  seconds: number;
  pages: number[];
  /** e.g. "Viewed pricing again" */
  flags: string[];
}

/** Pages worth flagging when the client reads them again, per template. */
export const WATCHED_PAGES: Record<string, Record<number, string>> = {
  'proposal-growth-v1': { 6: 'pricing', 9: 'terms' },
  // v2 adds the founder-led training page (page 5), so Investment and Terms move down one page.
  'proposal-growth-v2': { 7: 'pricing', 10: 'terms' },
};

/** "1–9", "1–3, 6, 9" */
export function pageRanges(pages: number[]): string {
  const p = [...new Set(pages)].filter((n) => n > 0).sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < p.length; i++) {
    let j = i;
    while (j + 1 < p.length && p[j + 1] === p[j] + 1) j++;
    out.push(i === j ? String(p[i]) : `${p[i]}–${p[j]}`);
    i = j;
  }
  return out.join(', ');
}

/**
 * One row per real view ("opened" events come from POST /viewed: page 1 rendered in a visible tab),
 * oldest first, with that visit's visible time and pages, and re-reads of watched pages flagged.
 */
export function viewRows(events: AgreementEvent[], stats: Record<string, VisitStat>, templateId: string): ViewRow[] {
  const watched = WATCHED_PAGES[templateId] ?? {};
  const seenBefore = new Set<number>();
  const rows: ViewRow[] = [];
  for (const ev of events.filter((x) => x.type === 'opened').sort((a, b) => a.at.localeCompare(b.at))) {
    const vid = typeof ev.data.visitId === 'string' ? ev.data.visitId : '';
    const st = (vid && stats[vid]) || { seconds: 0, pages: [] };
    const flags: string[] = [];
    for (const [page, name] of Object.entries(watched)) {
      const n = Number(page);
      if (st.pages.includes(n) && seenBefore.has(n)) flags.push(`Viewed ${name} again`);
    }
    st.pages.forEach((n) => seenBefore.add(n));
    rows.push({ at: ev.at, device: describeDevice(ev.userAgent), ip: ev.ip, seconds: st.seconds, pages: [...st.pages].sort((a, b) => a - b), flags });
  }
  return rows;
}
