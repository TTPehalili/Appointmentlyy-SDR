/**
 * Server only. Builds the final signed PDF with pdf-lib: the frozen client PDF, then an Execution
 * page (each party's choices, typed names and titles, signature images, signed-at times in
 * Asia/Manila), then a Certificate of Completion (envelope ID, SHA-256 of the original, the event
 * timeline with time, IP and device). The certificate is also produced on its own.
 *
 * Fonts: the standard Helvetica family (WinAnsi), so text goes through `ansi()`.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import type { SignerFormField } from '@/lib/agreements/templates/types';
import { describeDevice, fmtManila, type AgreementEvent, type Envelope } from '@/lib/agreements/envelope';

export const CONSENT_TEXT =
  'I agree to sign electronically. My electronic signature has the same legal effect as a handwritten signature under the Philippine E-Commerce Act (RA 8792).';

/** Map text to what the standard PDF fonts can draw (WinAnsi); anything else is dropped. */
export function ansi(s: string): string {
  return String(s ?? '')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[•·]/g, '-')
    .replace(/₱/g, 'PHP ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\t]/g, ' ')
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, '');
}

const A4: [number, number] = [595.28, 841.89];
const M = 50;
const INK = rgb(0.07, 0.09, 0.15);
const MUTED = rgb(0.38, 0.4, 0.45);
const LINE = rgb(0.85, 0.85, 0.85);

interface Fonts {
  r: PDFFont;
  b: PDFFont;
  mono: PDFFont;
}

/** Simple flowing writer that adds pages as needed. */
class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    private f: Fonts,
    private header: string,
    private envelopeId: string,
  ) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage(A4);
    this.y = A4[1] - M;
    this.page.drawText(ansi(this.header), { x: M, y: this.y, size: 9, font: this.f.b, color: MUTED });
    this.page.drawText(ansi(`Envelope ${this.envelopeId}`), {
      x: A4[0] - M - this.f.r.widthOfTextAtSize(`Envelope ${this.envelopeId}`, 8),
      y: this.y,
      size: 8,
      font: this.f.r,
      color: MUTED,
    });
    this.y -= 14;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4[0] - M, y: this.y }, thickness: 0.5, color: LINE });
    this.y -= 22;
  }
  ensure(h: number) {
    if (this.y - h < M + 20) this.newPage();
  }
  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const out: string[] = [];
    for (const para of ansi(text).split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      let line = '';
      for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(next, size) <= width) line = next;
        else {
          if (line) out.push(line);
          // A single word wider than the line: hard-break it.
          let rest = w;
          while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
            let n = rest.length - 1;
            while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n--;
            out.push(rest.slice(0, n));
            rest = rest.slice(n);
          }
          line = rest;
        }
      }
      out.push(line);
    }
    return out;
  }
  text(text: string, opts: { size?: number; bold?: boolean; mono?: boolean; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.mono ? this.f.mono : opts.bold ? this.f.b : this.f.r;
    const x = opts.x ?? M;
    const width = opts.width ?? A4[0] - M - x;
    const lh = size * 1.35;
    for (const line of this.wrap(text, font, size, width)) {
      this.ensure(lh);
      this.page.drawText(line, { x, y: this.y - size, size, font, color: opts.color ?? INK });
      this.y -= lh;
    }
    this.y -= opts.gap ?? 4;
  }
  /** "Label: value" row with the label in a fixed column. */
  row(label: string, value: string, opts: { mono?: boolean; labelWidth?: number } = {}) {
    const lw = opts.labelWidth ?? 130;
    const size = 10;
    const font = opts.mono ? this.f.mono : this.f.r;
    const lines = this.wrap(value || '-', font, opts.mono ? 8.5 : size, A4[0] - M * 2 - lw);
    const lh = size * 1.35;
    // Long labels (e.g. a signer-form question) wrap inside their column instead of running into the value.
    const labelLines = this.wrap(label, this.f.b, size, lw - 10);
    const rows = Math.max(lines.length, labelLines.length);
    this.ensure(lh * Math.min(rows, 4));
    for (let i = 0; i < rows; i++) {
      this.ensure(lh);
      if (labelLines[i]) this.page.drawText(labelLines[i], { x: M, y: this.y - size, size, font: this.f.b, color: MUTED });
      if (lines[i]) this.page.drawText(lines[i], { x: M + lw, y: this.y - size, size: opts.mono ? 8.5 : size, font, color: INK });
      this.y -= lh;
    }
    this.y -= 3;
  }
  rule(gap = 10) {
    this.ensure(gap * 2);
    this.y -= gap / 2;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4[0] - M, y: this.y }, thickness: 0.5, color: LINE });
    this.y -= gap;
  }
  image(img: PDFImage, maxW: number, maxH: number) {
    const s = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * s;
    const h = img.height * s;
    this.ensure(h + 8);
    this.page.drawImage(img, { x: M, y: this.y - h, width: w, height: h });
    this.y -= h + 4;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: M + Math.max(w, 200), y: this.y }, thickness: 0.6, color: MUTED });
    this.y -= 8;
  }
}

async function fonts(doc: PDFDocument): Promise<Fonts> {
  return {
    r: await doc.embedFont(StandardFonts.Helvetica),
    b: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
}

/** Human value of one signer-form answer. */
export function describeAnswer(field: SignerFormField, v: unknown): string {
  if (v === undefined || v === null || v === '') return '-';
  switch (field.kind) {
    case 'confirm':
      return v === true ? 'Confirmed' : 'Not confirmed';
    case 'multi-check': {
      const picked = Array.isArray(v) ? (v as unknown[]).map(String) : [];
      const all = field.options ?? picked;
      return all.map((o) => `${picked.includes(o) ? '[x]' : '[ ]'} ${o}`).join('\n') || '-';
    }
    case 'rows': {
      const rows = Array.isArray(v) ? (v as unknown[]) : [];
      if (!rows.length) return 'None';
      const cols = field.columns ?? [];
      return rows
        .map((r, i) => {
          const cells = Array.isArray(r) ? (r as unknown[]).map(String) : cols.map((c) => String((r as Record<string, unknown>)?.[c] ?? ''));
          return `${i + 1}. ${cells.map((c, j) => (cols[j] ? `${cols[j]}: ${c || '-'}` : c)).join('  |  ')}`;
        })
        .join('\n');
    }
    default:
      return String(v);
  }
}

export interface FinalInputs {
  envelope: Envelope;
  signerForm: SignerFormField[];
  action: 'sign' | 'acknowledge' | 'view';
  countersign: boolean;
  events: AgreementEvent[];
  signerSignature: Uint8Array | null;
  ownerSignature: Uint8Array | null;
  /** When the document is completed (also the last timeline row). */
  completedAt: string;
}

async function drawExecution(doc: PDFDocument, f: Fonts, x: FinalInputs) {
  const e = x.envelope;
  const w = new Writer(doc, f, 'EXECUTION PAGE', e.id);
  w.text('Execution page', { size: 18, bold: true, gap: 6 });
  w.text(e.title, { size: 12, bold: true, gap: 10 });
  w.row('Envelope ID', e.id, { mono: true });
  w.row('Original SHA-256', e.originalSha256 || '', { mono: true });
  w.row('Pages in document', String(e.pageCount));
  w.rule();

  if (x.signerForm.length) {
    w.text("Client's choices", { size: 12, bold: true, gap: 6 });
    const answers = e.signerFormValues ?? {};
    for (const field of x.signerForm) w.row(field.label, describeAnswer(field, answers[field.key]), { labelWidth: 190 });
    w.rule();
  }

  const s = e.signer;
  w.text(x.action === 'sign' ? 'Signed for the client' : 'Client response', { size: 12, bold: true, gap: 6 });
  if (s) {
    if (x.action === 'acknowledge') w.row('Response', s.outcome === 'concern' ? 'Raised a concern' : 'Confirmed');
    if (s.outcome === 'concern' && s.concern) w.row('Concern', s.concern);
    w.row('Name', s.name);
    w.row('Title', s.title);
    w.row('Email', s.email);
    w.row(x.action === 'sign' ? 'Signed at' : 'Responded at', `${fmtManila(s.signedAt, true)} (Asia/Manila)`);
    w.row('Signature', s.signatureKind === 'drawn' ? 'Drawn by hand' : s.signatureKind === 'typed' ? 'Typed name in script' : 'Typed name, confirmed by one-time code');
    if (x.signerSignature) w.image(await doc.embedPng(x.signerSignature), 220, 70);
    w.text(`Consent given: "${CONSENT_TEXT}"`, { size: 8.5, color: MUTED, gap: 2 });
    w.text('Identity confirmed by a one-time code sent to the email above.', { size: 8.5, color: MUTED });
  }
  if (x.countersign) {
    w.rule();
    w.text('Countersigned by the provider (Appointmentlyy)', { size: 12, bold: true, gap: 6 });
    const o = e.ownerSignature;
    if (o) {
      w.row('Name', o.name);
      w.row('Title', o.title);
      w.row('Signed at', `${fmtManila(o.signedAt, true)} (Asia/Manila)`);
      if (x.ownerSignature) w.image(await doc.embedPng(x.ownerSignature), 220, 70);
    }
  }
}

const EVENT_LABEL: Partial<Record<AgreementEvent['type'], string>> = {
  sent: 'Sent to the client',
  resent: 'Sent again',
  opened: 'Opened by the client',
  otp_verified: 'One-time code verified',
  signed: 'Signed by the client',
  acknowledged: 'Confirmed by the client',
  concern: 'Client raised a concern',
  countersigned: 'Countersigned by the provider',
};

async function drawCertificate(doc: PDFDocument, f: Fonts, x: FinalInputs) {
  const e = x.envelope;
  const w = new Writer(doc, f, 'CERTIFICATE OF COMPLETION', e.id);
  w.text('Certificate of Completion', { size: 18, bold: true, gap: 6 });
  w.text(e.title, { size: 12, bold: true, gap: 10 });
  w.row('Envelope ID', e.id, { mono: true });
  w.row('Template', e.templateId);
  w.row('Original SHA-256', e.originalSha256 || '', { mono: true });
  w.row('Original pages', String(e.pageCount));
  w.row('Signer', `${e.signer?.name || e.recipient.name} <${e.signer?.email || e.recipient.email}>`);
  if (e.ownerSignature) w.row('Countersigner', `${e.ownerSignature.name}, ${e.ownerSignature.title}`);
  w.row('Completed', `${fmtManila(x.completedAt, true)} (Asia/Manila)`);
  w.rule();

  w.text('Event timeline (times in Asia/Manila)', { size: 12, bold: true, gap: 8 });
  const cols = [M, M + 135, M + 290, M + 385];
  const head = ['Time', 'Event', 'IP address', 'Device'];
  w.ensure(16);
  head.forEach((h, i) => w.page.drawText(h, { x: cols[i], y: w.y - 9, size: 9, font: f.b, color: MUTED }));
  w.y -= 16;
  const rows = x.events
    .filter((ev) => EVENT_LABEL[ev.type])
    .map((ev) => [fmtManila(ev.at, true), EVENT_LABEL[ev.type] as string, ev.ip || '-', ev.userAgent ? describeDevice(ev.userAgent) : '-']);
  rows.push([fmtManila(x.completedAt, true), 'Completed, final PDF sealed', '-', 'Appointmentlyy server']);
  for (const r of rows) {
    w.ensure(14);
    r.forEach((cell, i) => {
      const width = (cols[i + 1] ?? A4[0] - M) - cols[i] - 6;
      let t = ansi(cell);
      while (t.length > 1 && f.r.widthOfTextAtSize(t, 8.5) > width) t = t.slice(0, -1);
      w.page.drawText(t, { x: cols[i], y: w.y - 8.5, size: 8.5, font: f.r, color: INK });
    });
    w.y -= 14;
  }
  w.rule();
  w.text(
    'The SHA-256 fingerprint of the original document above was recorded when it was sent and has not changed. ' +
      'The SHA-256 of this final PDF (document, Execution page and this certificate) is recorded by Appointmentlyy and sent to both parties in the completion email, ' +
      'so any later change to this file can be detected.',
    { size: 9, color: MUTED, gap: 4 },
  );
  w.text('Electronic signatures under the Philippine E-Commerce Act (RA 8792). IP addresses and emails are kept only as evidence of this contract (Data Privacy Act).', {
    size: 9,
    color: MUTED,
  });
}

export async function buildFinalPdf(original: Uint8Array, x: FinalInputs): Promise<{ final: Uint8Array; certificate: Uint8Array; pageCount: number }> {
  const doc = await PDFDocument.load(original, { updateMetadata: false });
  const f = await fonts(doc);
  await drawExecution(doc, f, x);
  await drawCertificate(doc, f, x);
  doc.setTitle(ansi(x.envelope.title));
  doc.setProducer('Appointmentlyy Agreements');
  doc.setModificationDate(new Date(x.completedAt));
  const final = await doc.save();

  const cdoc = await PDFDocument.create();
  const cf = await fonts(cdoc);
  await drawCertificate(cdoc, cf, x);
  cdoc.setTitle(ansi(`Certificate of Completion: ${x.envelope.title}`));
  cdoc.setProducer('Appointmentlyy Agreements');
  const certificate = await cdoc.save();
  return { final, certificate, pageCount: doc.getPageCount() };
}

export async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return doc.getPageCount();
}
