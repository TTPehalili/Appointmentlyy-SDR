'use client';

/**
 * On-screen replica of the customer one-pager PDF (src/lib/server/meetingPlan/onePagerPdf.tsx), so the
 * Account Executive sees exactly what the customer gets. US Letter proportions; scales to the width of
 * its container. Every size is in PDF points through the --pt variable (1pt = container width / 612).
 *
 * Fitting mirrors the PDF: copy is capped per field, then the largest type scale whose content fits
 * the page is chosen by measuring. Fonts are Helvetica/Arial, which share metrics with the PDF's
 * built-in Helvetica, so line breaks match closely. Keep FIT_TIERS and the measurements in step with
 * the PDF renderer.
 *
 * Pure presentational: no fetching, no state beyond the chosen fit tier.
 */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { OnePagerCopy } from '@/lib/meetingPlan';
import { safeBrandColor, type OnePagerRenderData } from '@/lib/onePagerRender';

/* ---------------- fitting (mirrors onePagerPdf.tsx) ---------------- */

interface FitCaps {
  headline: number;
  subheadline: number;
  bullet: number;
  step: number;
  when: number;
  cardTitle: number;
  cardDetail: number;
  cta: number;
  heard: number;
  why: number;
  steps: number;
}

const LOOSE: FitCaps = { headline: 90, subheadline: 200, bullet: 210, step: 170, when: 40, cardTitle: 48, cardDetail: 190, cta: 260, heard: 4, why: 4, steps: 4 };
const TIGHT: FitCaps = { headline: 80, subheadline: 160, bullet: 160, step: 130, when: 32, cardTitle: 44, cardDetail: 150, cta: 210, heard: 4, why: 3, steps: 4 };
const TIGHTER: FitCaps = { ...TIGHT, heard: 3, why: 3, steps: 3 };
const TIGHTEST: FitCaps = { headline: 70, subheadline: 120, bullet: 120, step: 100, when: 28, cardTitle: 40, cardDetail: 110, cta: 160, heard: 3, why: 3, steps: 3 };

const FIT_TIERS: { scale: number; caps: FitCaps }[] = [
  { scale: 1, caps: LOOSE },
  { scale: 0.93, caps: LOOSE },
  { scale: 0.87, caps: TIGHT },
  { scale: 0.82, caps: TIGHT },
  { scale: 0.82, caps: TIGHTER },
  { scale: 0.82, caps: TIGHTEST },
];

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 50;
const PAD_TOP = 36;
const PAD_BOTTOM = 84;

const INK = { 900: '#1C1917', 800: '#292524', 700: '#44403B', 600: '#57534D', 500: '#79716B', 200: '#E7E5E4' };

function clip(raw: unknown, max: number): string {
  const v = (typeof raw === 'string' ? raw : '').replace(/\s+/g, ' ').trim();
  if (v.length <= max) return v;
  const cut = v.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  const base = space > max * 0.6 ? cut.slice(0, space) : cut;
  return base.replace(/[\s,;:.\-–—]+$/, '') + '…';
}

/* Same character handling as the PDF's built-in fonts, so names read the same in both. */
const CP1252_EXTRAS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const CHAR_MAP: Record<string, string> = {
  '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '−': '-', '‐': '-', '‑': '-',
  '≈': '~', '≤': '<=', '≥': '>=', '′': "'", '″': '"', ' ': ' ', ' ': ' ', ' ': ' ',
  '✓': '', '✔': '', '✅': '',
};
function pdfText(raw: string): string {
  let out = '';
  for (const ch of (raw || '').normalize('NFC')) {
    if (ch in CHAR_MAP) {
      out += CHAR_MAP[ch];
      continue;
    }
    const code = ch.codePointAt(0) || 0;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || CP1252_EXTRAS.has(ch)) {
      out += ch;
      continue;
    }
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (base && base !== ch && [...base].every((c) => (c.codePointAt(0) || 0) <= 0xff)) out += base;
  }
  return out.replace(/\s+/g, ' ').trim();
}

const txt = (raw: unknown, max: number) => pdfText(clip(raw, max));

function fitCopy(copy: OnePagerCopy, caps: FitCaps) {
  const list = (items: unknown, max: number, len: number) =>
    (Array.isArray(items) ? items : []).map((s) => txt(s, len)).filter(Boolean).slice(0, max);
  return {
    headline: txt(copy.headline, caps.headline),
    subheadline: txt(copy.subheadline, caps.subheadline),
    whatWeHeard: list(copy.whatWeHeard, caps.heard, caps.bullet),
    whyItMatters: list(copy.whyItMatters, caps.why, caps.bullet),
    nextSteps: (Array.isArray(copy.nextSteps) ? copy.nextSteps : [])
      .map((s) => ({ step: txt(s?.step, caps.step), when: txt(s?.when, caps.when) }))
      .filter((s) => s.step)
      .slice(0, caps.steps),
    howWeHelp: (Array.isArray(copy.howWeHelp) ? copy.howWeHelp : [])
      .map((c) => ({ title: txt(c?.title, caps.cardTitle), detail: txt(c?.detail, caps.cardDetail) }))
      .filter((c) => c.title || c.detail)
      .slice(0, 3),
    cta: txt(copy.cta, caps.cta),
  };
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(hex: string, toward: string, t: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(toward);
  return '#' + a.map((v, i) => Math.round(Math.max(0, Math.min(255, v + (b[i] - v) * t))).toString(16).padStart(2, '0')).join('');
}
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
function palette(raw: string | undefined) {
  const accent = safeBrandColor(raw);
  let accentText = accent;
  for (let i = 0; i < 8 && contrast(accentText, '#FFFFFF') < 4.5; i++) accentText = mix(accentText, '#000000', 0.15);
  return {
    accent,
    accentText,
    onAccent: contrast('#FFFFFF', accent) >= 3 ? '#FFFFFF' : INK[900],
    tint: mix(accent, '#FFFFFF', 0.94),
    rail: mix(accent, '#FFFFFF', 0.72),
  };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatMeetingAt(raw: string | undefined): string {
  const v = (raw || '').trim();
  if (!v) return '';
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return clip(v, 60);
  const [, y, mo, d, hh, mm] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d));
  if (Number.isNaN(date.getTime()) || +mo < 1 || +mo > 12) return clip(v, 60);
  let out = `${WEEKDAYS[date.getUTCDay()]} ${+d} ${MONTHS[+mo - 1]} ${y}`;
  if (hh !== undefined && mm !== undefined) {
    const h = +hh;
    out += `, ${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
  }
  return out;
}
function initialsOf(name: string, given?: string): string {
  const g = (given || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase();
  if (g) return g;
  const words = (name || '').replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'A';
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}
function shortCompanyName(raw: string | undefined): string {
  const suffix = /[,.]?\s+(ltd|limited|inc|incorporated|llc|llp|plc|pty|corp|corporation|gmbh)\.?$/i;
  return clip(clip(raw, 80).replace(suffix, '').replace(suffix, ''), 34);
}
function displayWebsite(raw: string | undefined): string {
  return clip((raw || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, ''), 40);
}

/* ---------------- component ---------------- */

/** n PDF points, scaled to the container width. */
const pt = (n: number) => `calc(${n} * var(--pt))`;

const ellipsis1: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

export function OnePagerPreview({ data, className }: { data: OnePagerRenderData; className?: string }) {
  const signature = useMemo(() => JSON.stringify(data), [data]);
  const [fit, setFit] = useState({ signature, tier: 0 });
  const tier = fit.signature === signature ? fit.tier : 0;
  const bodyRef = useRef<HTMLDivElement>(null);

  // Step down the type scale until the content fits the page, as the PDF renderer does.
  // Sizes are proportional to the width, so the result does not depend on the container size.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const overflows = el.scrollHeight > el.clientHeight + 1;
    const next = overflows && tier < FIT_TIERS.length - 1 ? tier + 1 : tier;
    if (next === tier && fit.signature === signature) return;
    // Measured before paint: at most FIT_TIERS.length steps, and no overflowing frame is ever shown.
    setFit({ signature, tier: next });
  }, [signature, tier, fit.signature]);

  const { scale, caps } = FIT_TIERS[tier];
  const f = (n: number) => pt(Math.round(n * scale * 10) / 10);
  const c = fitCopy(data.copy, caps);
  const p = palette(data.brand.brandColor);
  const company = txt(data.lead.company, 60);
  const shortCompany = pdfText(shortCompanyName(data.lead.company));
  const brandName = txt(data.brand.companyName, 50) || 'Our team';
  const website = pdfText(displayWebsite(data.brand.website));
  const meeting = pdfText(formatMeetingAt(data.meetingAt));
  const leadName = txt(data.lead.name, 50);
  const leadTitle = txt(data.lead.title, 48);
  const aeName = txt(data.ae.name, 50);
  const aeEmail = txt(data.ae.email, 60);
  const hasHeard = c.whatWeHeard.length > 0;
  const hasWhy = c.whyItMatters.length > 0;
  const whyLabel = shortCompany ? `Why it matters for ${shortCompany}` : 'Why it matters';

  const label = (text: string) => (
    <div>
      <div style={{ width: pt(18), height: pt(1.5), background: p.accent, marginBottom: f(7) }} />
      <div
        className="uppercase"
        style={{ fontWeight: 700, fontSize: f(7.5), letterSpacing: pt(1.5), lineHeight: 1.2, color: p.accentText, marginBottom: f(9) }}
      >
        {text}
      </div>
    </div>
  );

  const bullets = (items: string[]) => (
    <div>
      {items.map((item, i) => (
        <div key={i} className="flex" style={{ marginBottom: f(6) }}>
          <span
            className="shrink-0 rounded-full"
            style={{ width: pt(4), height: pt(4), background: p.accent, marginTop: pt(Math.round(10 * scale * 10) / 10 * 0.55), marginRight: pt(9) }}
          />
          <span className="min-w-0 flex-1" style={{ fontSize: f(10), lineHeight: 1.5, color: INK[800] }}>
            {item}
          </span>
        </div>
      ))}
    </div>
  );

  const section = (children: ReactNode) => <div style={{ marginTop: f(22) }}>{children}</div>;

  return (
    <div className={cn('@container w-full', className)}>
      <div
        role="document"
        data-fit-tier={tier}
        aria-label={`One-page meeting recap${company ? ` for ${company}` : ''}`}
        className="relative w-full overflow-hidden bg-white shadow-[0_1px_2px_rgb(12_10_9/0.06),0_8px_24px_-6px_rgb(12_10_9/0.12)] ring-1 ring-black/5"
        style={
          {
            '--pt': `calc(100cqw / ${PAGE_W})`,
            aspectRatio: `${PAGE_W} / ${PAGE_H}`,
            fontFamily: 'Helvetica, Arial, "Liberation Sans", sans-serif',
            color: INK[800],
            WebkitFontSmoothing: 'antialiased',
          } as CSSProperties
        }
      >
        {/* top accent bar */}
        <div className="absolute inset-x-0 top-0" style={{ height: pt(5), background: p.accent }} />

        {/* body: everything above the footer, clipped to the page like the PDF */}
        <div
          ref={bodyRef}
          className="absolute inset-x-0 top-0 overflow-hidden"
          style={{ marginTop: f(PAD_TOP), paddingLeft: pt(MARGIN_X), paddingRight: pt(MARGIN_X), height: `calc(${PAGE_H - PAD_BOTTOM} * var(--pt) - ${f(PAD_TOP)})` }}
        >
          {/* header */}
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 flex-1 items-center" style={{ marginRight: pt(24) }}>
              <div
                className="flex shrink-0 items-center justify-center"
                style={{ width: pt(30), height: pt(30), borderRadius: pt(7), background: p.accent, marginRight: pt(10) }}
              >
                <span style={{ fontWeight: 700, fontSize: pt(11.5), letterSpacing: pt(0.3), color: p.onAccent, lineHeight: 1 }}>
                  {initialsOf(data.brand.companyName, data.brand.logoInitials)}
                </span>
              </div>
              <div className="min-w-0">
                <div style={{ fontWeight: 700, fontSize: pt(11), color: INK[900], lineHeight: 1.2 }}>{brandName}</div>
                {website ? <div style={{ fontSize: pt(8.5), color: INK[500], marginTop: pt(2), lineHeight: 1.2 }}>{website}</div> : null}
              </div>
            </div>
            <div className="text-right" style={{ maxWidth: pt(230) }}>
              <div style={{ fontWeight: 700, fontSize: pt(7), letterSpacing: pt(1.6), color: INK[500], lineHeight: 1.2 }}>MEETING RECAP</div>
              {meeting ? <div style={{ fontSize: pt(9), color: INK[700], marginTop: pt(3), lineHeight: 1.2 }}>{meeting}</div> : null}
            </div>
          </div>

          <div style={{ height: pt(0.75), background: INK[200], marginTop: f(16), marginBottom: f(20) }} />

          {leadName || leadTitle || company ? (
            <div style={{ fontSize: f(9.5), color: INK[600], lineHeight: 1.2 }}>
              Prepared for{' '}
              {leadName ? <strong style={{ fontWeight: 700, color: INK[900] }}>{leadName}</strong> : null}
              {leadName && leadTitle ? `, ${leadTitle}` : !leadName && leadTitle ? leadTitle : ''}
              {company ? `${leadName || leadTitle ? ' · ' : ''}${company}` : ''}
            </div>
          ) : null}
          {c.headline ? (
            <h2 style={{ fontWeight: 700, fontSize: f(25), lineHeight: 1.16, color: INK[900], marginTop: f(10), letterSpacing: pt(-0.3) }}>{c.headline}</h2>
          ) : null}
          {c.subheadline ? <p style={{ fontSize: f(12), lineHeight: 1.45, color: INK[600], marginTop: f(8) }}>{c.subheadline}</p> : null}

          {hasHeard || hasWhy
            ? section(
                <>
                  <div className="flex">
                    {hasHeard ? <div className="min-w-0 flex-1" style={hasWhy ? { marginRight: pt(28) } : undefined}>{label('What we heard')}</div> : null}
                    {hasWhy ? <div className="min-w-0 flex-1">{label(whyLabel)}</div> : null}
                  </div>
                  <div className="flex">
                    {hasHeard ? <div className="min-w-0 flex-1" style={hasWhy ? { marginRight: pt(28) } : undefined}>{bullets(c.whatWeHeard)}</div> : null}
                    {hasWhy ? <div className="min-w-0 flex-1">{bullets(c.whyItMatters)}</div> : null}
                  </div>
                </>,
              )
            : null}

          {c.nextSteps.length > 0
            ? section(
                <>
                  {label('Agreed next steps')}
                  <ol>
                    {c.nextSteps.map((step, i) => {
                      const isLast = i === c.nextSteps.length - 1;
                      return (
                        <li key={i} className="flex">
                          <div className="flex shrink-0 flex-col items-center" style={{ width: pt(22) }}>
                            <span
                              className="flex shrink-0 items-center justify-center rounded-full"
                              style={{ width: f(18), height: f(18), background: p.accent, color: p.onAccent, fontWeight: 700, fontSize: f(8.5), lineHeight: 1 }}
                            >
                              {i + 1}
                            </span>
                            {isLast ? null : <span className="grow" style={{ width: pt(1.25), background: p.rail, marginTop: pt(3), marginBottom: pt(3) }} />}
                          </div>
                          <div className="flex min-w-0 flex-1" style={{ marginLeft: pt(10), paddingTop: f(2.5), paddingBottom: isLast ? 0 : f(10) }}>
                            <span className="min-w-0 flex-1" style={{ fontSize: f(10), lineHeight: 1.45, color: INK[800] }}>
                              {step.step}
                            </span>
                            {step.when ? (
                              <span
                                className="shrink-0 text-right"
                                style={{ width: pt(120), marginLeft: pt(16), fontWeight: 700, fontSize: f(8.5), lineHeight: 1.6, color: p.accentText }}
                              >
                                {step.when}
                              </span>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </>,
              )
            : null}

          {c.howWeHelp.length > 0
            ? section(
                <>
                  {label('How we can help')}
                  <div className="flex">
                    {c.howWeHelp.map((card, i) => (
                      <div
                        key={i}
                        className="min-w-0 flex-1"
                        style={{
                          background: p.tint,
                          borderRadius: pt(6),
                          borderTop: `${pt(2)} solid ${p.accent}`,
                          padding: `${f(12)} ${f(12)} ${f(13)}`,
                          marginRight: i < c.howWeHelp.length - 1 ? pt(12) : 0,
                        }}
                      >
                        {card.title ? (
                          <div style={{ fontWeight: 700, fontSize: f(10.5), lineHeight: 1.3, color: INK[900], marginBottom: f(5) }}>{card.title}</div>
                        ) : null}
                        {card.detail ? <div style={{ fontSize: f(9), lineHeight: 1.45, color: INK[700] }}>{card.detail}</div> : null}
                      </div>
                    ))}
                  </div>
                </>,
              )
            : null}

          {c.cta ? (
            <div style={{ marginTop: f(20), borderLeft: `${pt(2.5)} solid ${p.accent}`, paddingLeft: pt(14), paddingTop: f(3), paddingBottom: f(3) }}>
              <p style={{ fontSize: f(11), lineHeight: 1.5, color: INK[900] }}>{c.cta}</p>
            </div>
          ) : null}
        </div>

        {/* footer */}
        <div
          className="absolute flex items-end justify-between"
          style={{ left: pt(MARGIN_X), right: pt(MARGIN_X), bottom: pt(30), borderTop: `${pt(0.75)} solid ${INK[200]}`, paddingTop: pt(11) }}
        >
          <div className="min-w-0 flex-1" style={{ marginRight: pt(24) }}>
            <div style={{ fontWeight: 700, fontSize: pt(6.5), letterSpacing: pt(1.4), color: INK[500], marginBottom: pt(4), lineHeight: 1.2 }}>YOUR CONTACT</div>
            <div style={{ ...ellipsis1, fontWeight: 700, fontSize: pt(9), color: INK[900], lineHeight: 1.2 }}>{aeName || brandName}</div>
            {aeEmail ? <div style={{ ...ellipsis1, fontSize: pt(8.5), color: INK[600], marginTop: pt(2), lineHeight: 1.2 }}>{aeEmail}</div> : null}
          </div>
          <div className="min-w-0 text-right" style={{ maxWidth: pt(220) }}>
            <div style={{ ...ellipsis1, fontWeight: 700, fontSize: pt(8.5), color: INK[700], lineHeight: 1.2 }}>{brandName}</div>
            {website ? <div style={{ ...ellipsis1, fontSize: pt(8.5), color: INK[500], marginTop: pt(2), lineHeight: 1.2 }}>{website}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
