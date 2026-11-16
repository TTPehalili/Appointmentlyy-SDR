/**
 * Pure helpers for template values: field defaults, money and date formatting, token substitution.
 * Deterministic: no clock, no locale (formatting is hand-rolled so server locale cannot change output).
 */
import type { TemplateField } from '../types';

/** Merge owner values over field defaults. Blank strings count as "not filled" and stay blank. */
export function withDefaults(fields: TemplateField[], values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = values[f.key];
    // Strip our inline-marker characters so typed values can never inject markup.
    out[f.key] = (typeof v === 'string' ? v : (f.default ?? '')).replace(/[⟦⟧]|\*\*/g, '').trim();
  }
  return out;
}

export function defaultsOf(fields: TemplateField[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, f.default ?? '']));
}

/** "15,000" / "$15,000" / "15000.50" -> number, or null when blank or unparsable. */
export function parseMoney(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned || !/^\d*\.?\d*$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 15000 -> "15,000"; 41.5 -> "41.50". */
export function formatAmount(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return groupThousands(String(rounded));
  const [i, d] = rounded.toFixed(2).split('.');
  return `${groupThousands(i)}.${d}`;
}

/** 15000 -> "$15,000". */
export function usd(n: number): string {
  return `$${formatAmount(n)}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface Ymd { y: number; m: number; d: number }

export function parseIsoDate(raw: string | undefined): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((raw ?? '').trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

function weekday(p: Ymd): string {
  return WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
}

/**
 * Date display. Styles: 'long' 16 November 2026 · 'dayMonth' 4 December · 'weekdayLong'
 * Wednesday, 18 November 2026 · 'weekdayDayMonth' Wednesday, 18 November.
 * A value that is not YYYY-MM-DD is shown as typed (the owner may enter free text).
 */
export function formatDate(raw: string | undefined, style: 'long' | 'dayMonth' | 'weekdayLong' | 'weekdayDayMonth' = 'long'): string {
  const p = parseIsoDate(raw);
  if (!p) return (raw ?? '').trim();
  const dm = `${p.d} ${MONTHS[p.m - 1]}`;
  switch (style) {
    case 'dayMonth': return dm;
    case 'weekdayLong': return `${weekday(p)}, ${dm} ${p.y}`;
    case 'weekdayDayMonth': return `${weekday(p)}, ${dm}`;
    default: return `${dm} ${p.y}`;
  }
}

/**
 * Inline markers understood by the PDF text renderer (see kit.tsx `Rich`):
 *   **bold**              strong text
 *   ⟦MARK:label⟧          a blank value, shown as "label" highlighted in yellow
 */
export const MARK_OPEN = '⟦MARK:';
export const MARK_CLOSE = '⟧';

export function blankMark(label: string): string {
  return `${MARK_OPEN}${label}${MARK_CLOSE}`;
}

/** The value, or a yellow-highlighted "[label]" placeholder if it is blank. */
export function valueOrMark(v: string | undefined, label: string): string {
  const t = (v ?? '').trim();
  return t ? t : blankMark(`[${label}]`);
}

/** Replace {{key}} tokens. Unknown keys throw, so a typo in template text can never ship silently. */
export function fillTokens(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    if (!(k in vars)) throw new Error(`Template token {{${k}}} has no value`);
    return vars[k];
  });
}

/** Lines of a textarea value, trimmed, empty lines dropped, leading list bullets removed. */
export function lines(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);
}

/** Paragraphs of a textarea value (split on blank lines; single newlines become spaces). */
export function paragraphs(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/\s*\r?\n\s*/g, ' ').trim())
    .filter(Boolean);
}

/** YYYY-MM-DD plus n days (UTC, no clock), or '' if the date is not ISO. */
export function addDaysIso(raw: string | undefined, n: number): string {
  const p = parseIsoDate(raw);
  if (!p || !Number.isFinite(n)) return '';
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d + Math.trunc(n)));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** YYYY-MM-DD plus n business days (Mon–Fri; holidays not counted), or '' if the date is not ISO. */
export function addBusinessDaysIso(raw: string | undefined, n: number): string {
  const p = parseIsoDate(raw);
  if (!p || !Number.isFinite(n) || n < 0) return '';
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d));
  let left = Math.trunc(n);
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
