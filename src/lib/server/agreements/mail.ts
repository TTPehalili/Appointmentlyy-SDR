/**
 * Server only. Agreement emails (invites, one-time codes, completion copies, owner notifications)
 * through Resend, from the sender identity in the Agreements settings.
 *
 * Test-only outbox: with AGREEMENTS_DEV_OUTBOX=1, emails (one-time codes included) are written to
 * TENANCY_DATA_DIR/agreements_outbox.json instead of being sent. It fails closed: if the server has
 * any production credential (database, Resend key) or runs on Railway, the outbox refuses and
 * nothing is sent or written. Never set it outside local test servers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getResendApiKey } from '@/lib/resendConfig';
import type { AgreementSettings } from '@/lib/agreements/envelope';

export interface AgreementMail {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
  /** For the test outbox only: what the email is (invite, otp, completed, notify). */
  kind: string;
  envelopeId?: string;
}

export type MailResult = { ok: true; id?: string; outbox?: boolean } | { ok: false; error: string };

function outboxRequested(): boolean {
  return process.env.AGREEMENTS_DEV_OUTBOX === '1';
}

/**
 * A local test server: a file store and no production credential or Railway marker anywhere.
 * Every test-only switch (dev outbox, dev templates) requires this, so they fail closed in production.
 */
export function isLocalTestServer(): boolean {
  const prodSigns = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.RESEND_API_KEY,
    process.env.RAILWAY_ENVIRONMENT,
    process.env.RAILWAY_PROJECT_ID,
    process.env.RAILWAY_SERVICE_ID,
  ].some((v) => (v || '').trim());
  return !prodSigns && Boolean(process.env.TENANCY_DATA_DIR);
}

/** True only on a local test server: flag on, and no production credentials anywhere. */
export function devOutboxActive(): boolean {
  return outboxRequested() && isLocalTestServer();
}

/** Whether invites can go out at all (for the owner's console). */
export function mailStatus(): { configured: boolean; outbox: boolean; problem: string | null } {
  if (outboxRequested() && !devOutboxActive()) {
    return { configured: false, outbox: false, problem: 'AGREEMENTS_DEV_OUTBOX is set on a server with production settings, so all agreement email is blocked. Remove it.' };
  }
  if (devOutboxActive()) return { configured: true, outbox: true, problem: null };
  if (!getResendApiKey()) return { configured: false, outbox: false, problem: 'Email is not set up on this server (RESEND_API_KEY is missing). Use “Copy link” and send the link yourself.' };
  return { configured: true, outbox: false, problem: null };
}

const g = globalThis as typeof globalThis & { __agrOutboxQueue?: Promise<unknown> };

function writeOutbox(mail: AgreementMail, from: string, replyTo: string): Promise<void> {
  const file = path.join(process.env.TENANCY_DATA_DIR as string, 'agreements_outbox.json');
  const run = (g.__agrOutboxQueue ?? Promise.resolve()).then(() => {
    let rows: unknown[] = [];
    try {
      rows = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown[];
    } catch {
      rows = [];
    }
    rows.push({
      at: new Date().toISOString(),
      kind: mail.kind,
      envelopeId: mail.envelopeId ?? null,
      from,
      replyTo,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      attachments: (mail.attachments ?? []).map((a) => ({ filename: a.filename, size: a.content.length })),
    });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(rows, null, 2), 'utf8');
  });
  g.__agrOutboxQueue = run.catch(() => undefined);
  return run;
}

/**
 * Test-only: with AUTH_DEV_OUTBOX=1 on a local test server, sign-in and invite emails (lib/authMailer) are written to the
 * same outbox file instead of being sent. Off unless asked for, so suites that expect "mail not configured" (and the
 * staff-only invite link it returns) are unchanged. It fails closed: anywhere with a production credential or a Railway
 * marker the email is refused, never sent and never written.
 */
export function authOutboxRequested(): boolean {
  return process.env.AUTH_DEV_OUTBOX === '1';
}
export async function writeAuthOutbox(to: string, subject: string, text: string, kind: string): Promise<MailResult> {
  if (!isLocalTestServer()) {
    console.error('[auth/mail] AUTH_DEV_OUTBOX is set on a server with production settings: email blocked.');
    return { ok: false, error: 'Email is blocked on this server (test outbox misconfigured).' };
  }
  await writeOutbox({ to, subject: subject.replace(/[\r\n\u2028\u2029]+/g, ' ').slice(0, 250), html: '', text, kind }, 'auth-dev-outbox', '');
  return { ok: true, outbox: true };
}

export function senderOf(settings: AgreementSettings): { from: string; replyTo: string } {
  // Display name: no characters that could split or extend the address list (or a header).
  const name = settings.senderName.replace(/[<>"\,;:\r\n]/g, '').trim();
  const email = settings.senderEmail.replace(/[\s<>,;]/g, '');
  return { from: name ? `${name} <${email}>` : email, replyTo: (settings.replyTo || email).trim() };
}

export async function sendAgreementMail(mail: AgreementMail, settings: AgreementSettings): Promise<MailResult> {
  const { from, replyTo } = senderOf(settings);
  // Subjects carry owner-entered titles: one line only.
  mail = { ...mail, subject: mail.subject.replace(/[\r\n\u2028\u2029]+/g, ' ').slice(0, 250) };
  if (outboxRequested()) {
    if (!devOutboxActive()) {
      console.error('[agreements/mail] AGREEMENTS_DEV_OUTBOX is set on a server with production settings: email blocked.');
      return { ok: false, error: 'Agreement email is blocked on this server (test outbox misconfigured).' };
    }
    await writeOutbox(mail, from, replyTo);
    return { ok: true, outbox: true };
  }
  const apiKey = getResendApiKey();
  if (!apiKey) return { ok: false, error: 'Email is not set up on this server (RESEND_API_KEY is missing). Use “Copy link” and send the link yourself.' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [mail.to],
        reply_to: replyTo,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        ...(mail.attachments?.length
          ? { attachments: mail.attachments.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })) }
          : {}),
      }),
      signal: AbortSignal.timeout(20000),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      console.warn('[agreements/mail] Resend rejected the email:', res.status, data?.message || '');
      const msg = data?.message || `Email provider error (${res.status}).`;
      const hint = /domain|from|sender|verify/i.test(msg) ? ` Check that ${settings.senderEmail.split('@')[1] || 'the sender'} is verified in Resend, or change the sender in Agreements settings.` : '';
      return { ok: false, error: `Resend did not send the email: ${msg}.${hint} “Copy link” still works.` };
    }
    return { ok: true, id: data?.id };
  } catch {
    return { ok: false, error: 'Could not reach the email provider. “Copy link” still works.' };
  }
}

// ------------------------------------------------------------------ email bodies

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout(heading: string, paragraphs: string[], cta?: { label: string; url: string }, footer?: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2937">${p}</p>`).join('');
  const button = cta
    ? `<p style="margin:22px 0"><a href="${esc(cta.url)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:15px">${esc(cta.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f5f5f4;padding:24px;font-family:Inter,Segoe UI,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;padding:28px">
<h1 style="margin:0 0 16px;font-size:20px;color:#111827">${esc(heading)}</h1>${body}${button}
<p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#6b7280">${footer ? esc(footer) : 'Sent with Appointmentlyy Agreements.'}</p>
</div></body></html>`;
}

export function inviteMail(p: { to: string; recipientName: string; title: string; url: string; expiresText: string; action: 'sign' | 'acknowledge' | 'view'; senderName: string; envelopeId: string }): AgreementMail {
  const verb = p.action === 'sign' ? 'review and sign' : p.action === 'view' ? 'view' : 'review and confirm';
  const first = p.recipientName.split(' ')[0] || 'there';
  return {
    kind: 'invite',
    envelopeId: p.envelopeId,
    to: p.to,
    subject: p.action === 'view' ? p.title : `Please ${verb}: ${p.title}`,
    html: layout(
      p.title,
      [
        `Hi ${esc(first)},`,
        `${esc(p.senderName)} has sent you a document to ${verb}.`,
        `The link works until <strong>${esc(p.expiresText)}</strong> (Philippine time). Please don't forward it: it is personal to you.`,
      ],
      { label: p.action === 'sign' ? 'Review and sign' : p.action === 'view' ? 'View the document' : 'Review and confirm', url: p.url },
      'If you were not expecting this email, you can ignore it.',
    ),
    text: `Hi ${first},\n\n${p.senderName} has sent you a document to ${verb}: ${p.title}\n\nOpen it here: ${p.url}\n\nThe link works until ${p.expiresText} (Philippine time). Please don't forward it: it is personal to you.\n`,
  };
}

/**
 * "For your information" to a copy (CC) recipient: its own email, its own view-only link. The
 * signer's link is never in it, and the copy is never in the signer's email headers.
 */
export function ccMail(p: { to: string; ccName: string; signerName: string; title: string; url: string; expiresText: string; action: 'sign' | 'acknowledge' | 'view'; senderName: string; envelopeId: string }): AgreementMail {
  const first = p.ccName.split(' ')[0] || 'there';
  const what =
    p.action === 'view'
      ? `${p.senderName} has sent “${p.title}” to ${p.signerName}.`
      : `${p.senderName} has sent “${p.title}” to ${p.signerName} to ${p.action === 'sign' ? 'sign' : 'review and confirm'}.`;
  const role = p.action === 'view' ? 'This link shows you the document. It is view only.' : `This link shows you the document. It is view only: ${p.signerName} ${p.action === 'sign' ? 'signs' : 'confirms'} it, not you.`;
  return {
    kind: 'cc',
    envelopeId: p.envelopeId,
    to: p.to,
    subject: `For your information: ${p.title}`,
    html: layout(
      'For your information',
      [
        `Hi ${esc(first)},`,
        `${esc(what)} You are copied for your information.`,
        esc(role),
        `The link works until <strong>${esc(p.expiresText)}</strong> (Philippine time). Please don't forward it: it is personal to you.`,
      ],
      { label: 'View the document', url: p.url },
      'You are receiving this because the sender copied you. If you were not expecting it, you can ignore this email.',
    ),
    text: `Hi ${first},\n\n${what} You are copied for your information.\n\n${role}\n\nView it here: ${p.url}\n\nThe link works until ${p.expiresText} (Philippine time). Please don't forward it: it is personal to you.\n`,
  };
}

export function otpMail(p: { to: string; code: string; title: string; purpose: 'view' | 'sign'; envelopeId: string }): AgreementMail {
  const why = p.purpose === 'sign' ? 'to sign' : 'to open';
  return {
    kind: 'otp',
    envelopeId: p.envelopeId,
    to: p.to,
    subject: `Your code ${why} ${p.title}: ${p.code}`,
    html: layout(
      'Your one-time code',
      [
        `Use this code ${why} <strong>${esc(p.title)}</strong>:`,
        `<span style="font-size:28px;letter-spacing:6px;font-weight:700;font-family:Consolas,monospace">${esc(p.code)}</span>`,
        'It works for 10 minutes. Never share it with anyone.',
      ],
      undefined,
      'If you did not ask for this code, you can ignore this email.',
    ),
    text: `Your code ${why} ${p.title}: ${p.code}\n\nIt works for 10 minutes. Never share it with anyone.\n`,
  };
}

export function completedMail(p: { to: string; name: string; title: string; url: string | null; attached: boolean; envelopeId: string; finalSha256: string }): AgreementMail {
  const first = p.name.split(' ')[0] || 'there';
  return {
    kind: 'completed',
    envelopeId: p.envelopeId,
    to: p.to,
    subject: `Completed: ${p.title}`,
    html: layout(
      'Your signed copy',
      [
        `Hi ${esc(first)},`,
        `<strong>${esc(p.title)}</strong> is now signed by everyone.`,
        p.attached ? 'The final PDF, with its Execution page and Certificate of Completion, is attached.' : 'Download the final PDF, with its Execution page and Certificate of Completion, from the link below.',
        `Document fingerprint (SHA-256): <span style="font-family:Consolas,monospace;font-size:12px">${esc(p.finalSha256)}</span>`,
      ],
      p.url ? { label: 'Download the signed PDF', url: p.url } : undefined,
    ),
    text: `Hi ${first},\n\n${p.title} is now signed by everyone.\n${p.attached ? 'The final PDF is attached.\n' : ''}${p.url ? `Download: ${p.url}\n` : ''}\nSHA-256: ${p.finalSha256}\n`,
    attachments: undefined,
  };
}

export function ownerNoticeMail(p: { to: string; subject: string; lines: string[]; consoleUrl: string; envelopeId: string }): AgreementMail {
  return {
    kind: 'notify',
    envelopeId: p.envelopeId,
    to: p.to,
    subject: p.subject,
    html: layout(p.subject, p.lines.map(esc), { label: 'Open in Agreements', url: p.consoleUrl }),
    text: `${p.lines.join('\n')}\n\n${p.consoleUrl}\n`,
  };
}
