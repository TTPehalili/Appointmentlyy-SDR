'use client';

/**
 * The client's signing page (/s/[token]): view the frozen PDF (pdf.js, no download before
 * completion), then sign or acknowledge with a one-time email code. Every request is checked
 * against the owner's access rules on the server.
 */
import * as React from 'react';
import { CheckCircle2, Clock, Download, FileSignature, Lock, Mail, XCircle } from 'lucide-react';
import { Badge, Button, Card, Checkbox, Field, Input, Select, Skeleton, Textarea } from '@/components/ui';
import { PdfViewer } from '@/components/agreements/PdfViewer';
import { SignaturePad, type SignatureValue } from '@/components/agreements/SignaturePad';
import type { SignerFormField } from '@/lib/agreements/templates/types';
import { fmtManila } from '@/lib/agreements/envelope';
import { cn } from '@/lib/cn';

const CONSENT =
  'I agree to sign electronically. My electronic signature has the same legal effect as a handwritten signature under the Philippine E-Commerce Act (RA 8792).';

interface Doc {
  title: string;
  emailMasked: string;
  action?: 'sign' | 'acknowledge' | 'view';
  countersign?: boolean;
  signerForm?: SignerFormField[];
  recipientName?: string;
  recipientTitle?: string;
  clientName?: string;
  pageCount?: number;
  expiresAt?: string;
  payLink?: string | null;
  hasQr?: boolean;
}

type State =
  | { s: 'loading' }
  | { s: 'error'; message: string }
  | { s: 'closed'; reason: string; contact: string }
  | { s: 'not_yet'; openFrom: string; contact: string }
  | { s: 'signed'; title: string; countersign: boolean; contact: string }
  | { s: 'completed'; title: string; action: string; finalSha256: string; downloadUntil: string; contact: string }
  | { s: 'declined'; contact: string }
  | { s: 'otp_view'; doc: Doc; contact: string }
  | { s: 'open'; doc: Doc; contact: string };

async function call(url: string, init?: { method?: string; body?: unknown; visit?: string | null }) {
  const headers: Record<string, string> = {};
  if (init?.body) headers['Content-Type'] = 'application/json';
  if (init?.visit) headers['x-agr-visit'] = init.visit;
  const res = await fetch(url, { method: init?.method ?? (init?.body ? 'POST' : 'GET'), headers, body: init?.body ? JSON.stringify(init.body) : undefined, cache: 'no-store' });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok && data.success === true, status: res.status, data };
}

function Shell({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 md:px-6">
          <span className="flex size-7 items-center justify-center rounded-md bg-action text-caption font-semibold text-action-fg" aria-hidden>
            A
          </span>
          <span className="text-body-strong text-fg">Appointmentlyy</span>
          {title && <span className="hidden min-w-0 truncate text-body text-fg-secondary sm:inline">· {title}</span>}
          <span className="ml-auto inline-flex items-center gap-1.5 text-small text-fg-tertiary">
            <Lock className="size-3.5" aria-hidden /> Secure link
          </span>
        </div>
      </header>
      {children}
    </>
  );
}

function Notice({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <Shell>
      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-subtle text-fg-secondary [&_svg]:size-6">{icon}</div>
          <h1 className="text-h2 text-fg">{title}</h1>
          <div className="mt-2 text-body text-fg-secondary">{children}</div>
        </Card>
      </main>
    </Shell>
  );
}

export function SignerApp({ token }: { token: string }) {
  const base = `/api/sign/${encodeURIComponent(token)}`;
  const visitKey = `agr:v:${token.slice(0, 12)}`;
  const grantKey = `agr:g:${token.slice(0, 12)}`;
  const [state, setState] = React.useState<State>({ s: 'loading' });
  const [visit, setVisit] = React.useState<string | null>(null);
  const [pdf, setPdf] = React.useState<ArrayBuffer | null>(null);

  const load = React.useCallback(async () => {
    const stored = typeof window !== 'undefined' ? sessionStorage.getItem(visitKey) : null;
    const r = await call(base, { visit: stored });
    const d = r.data;
    const contact = String(d.contact || 'the sender');
    if (!r.ok) {
      if (d.state === 'closed') return setState({ s: 'closed', reason: String(d.reason || 'expired'), contact });
      return setState({ s: 'error', message: String(d.error || 'This page could not be loaded.') });
    }
    switch (d.state) {
      case 'closed':
        return setState({ s: 'closed', reason: String(d.reason), contact });
      case 'not_yet':
        return setState({ s: 'not_yet', openFrom: String(d.openFrom), contact });
      case 'signed':
        return setState({ s: 'signed', title: String(d.title), countersign: d.countersign === true, contact });
      case 'completed':
        return setState({ s: 'completed', title: String(d.title), action: String(d.action || 'sign'), finalSha256: String(d.finalSha256 || ''), downloadUntil: String(d.downloadUntil), contact });
    }
    const doc = d.doc as Doc;
    if (d.visitValid && stored) {
      setVisit(stored);
      return setState({ s: 'open', doc, contact });
    }
    if (d.needOtpToView) {
      const grant = sessionStorage.getItem(grantKey);
      if (!grant) return setState({ s: 'otp_view', doc, contact });
    }
    // Start a visit (not an open yet: that is recorded once the PDF has rendered in a visible tab).
    const o = await call(`${base}/open`, { body: { grant: sessionStorage.getItem(grantKey) } });
    if (!o.ok) {
      if (o.data.state === 'otp_view') {
        sessionStorage.removeItem(grantKey);
        return setState({ s: 'otp_view', doc, contact });
      }
      if (o.data.state === 'closed') return setState({ s: 'closed', reason: String(o.data.reason || 'expired'), contact });
      return setState({ s: 'error', message: String(o.data.error || 'This page could not be loaded.') });
    }
    const v = String(o.data.visit);
    sessionStorage.setItem(visitKey, v);
    setVisit(v);
    const again = await call(base, { visit: v });
    if (again.ok && again.data.state === 'open') return setState({ s: 'open', doc: again.data.doc as Doc, contact });
    return load();
  }, [base, visitKey, grantKey]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // The frozen PDF, once there is a visit.
  React.useEffect(() => {
    if (state.s !== 'open' || !visit || pdf) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`${base}/pdf`, { headers: { 'x-agr-visit': visit }, cache: 'no-store' });
      if (cancelled) return;
      if (!res.ok) {
        sessionStorage.removeItem(visitKey);
        setVisit(null);
        void load();
        return;
      }
      setPdf(await res.arrayBuffer());
    })();
    return () => {
      cancelled = true;
    };
  }, [state.s, visit, pdf, base, visitKey, load]);

  // The open is recorded only after the PDF has rendered and stayed in a visible tab for 1.5 s, so
  // link scanners and prefetchers (which never get this far, or run hidden) don't count as views.
  const viewedFor = React.useRef<string | null>(null);
  const onRendered = React.useCallback(() => {
    const v = visit;
    if (!v || viewedFor.current === v) return;
    let timer = 0;
    const arm = () => {
      if (document.visibilityState !== 'visible') return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (document.visibilityState !== 'visible' || viewedFor.current === v) return;
        viewedFor.current = v;
        document.removeEventListener('visibilitychange', arm);
        void call(`${base}/viewed`, { body: { visit: v } });
      }, 1500);
    };
    document.addEventListener('visibilitychange', arm);
    arm();
  }, [visit, base]);

  // Reading tracking: every 10 s while the page is visible.
  const view = React.useRef<{ page: number; seen: number[] }>({ page: 0, seen: [] });
  React.useEffect(() => {
    if (state.s !== 'open' || !visit || !pdf) return;
    let lastBeat = Date.now();
    let visibleSince = document.visibilityState === 'visible' ? Date.now() : 0;
    let acc = 0;
    const beat = () => {
      const now = Date.now();
      if (visibleSince) acc += now - visibleSince;
      visibleSince = document.visibilityState === 'visible' ? now : 0;
      const seconds = Math.min(15, Math.round(acc / 1000));
      acc = 0;
      lastBeat = now;
      void call(`${base}/heartbeat`, { body: { visit, seconds, page: view.current.page, pages: view.current.seen } });
    };
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') beat();
    }, 10_000);
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        if (visibleSince) acc += Date.now() - visibleSince;
        visibleSince = 0;
        if (Date.now() - lastBeat > 2000 && acc > 1000) beat();
      } else visibleSince = Date.now();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [state.s, visit, pdf, base]);

  switch (state.s) {
    case 'loading':
      return (
        <Shell>
          <main className="mx-auto w-full max-w-3xl flex-1 p-6">
            <Skeleton className="mb-4 h-8 w-2/3" />
            <Skeleton className="aspect-[1/1.414] w-full" />
          </main>
        </Shell>
      );
    case 'error':
      return (
        <Notice icon={<XCircle />} title="Something went wrong">
          {state.message}
        </Notice>
      );
    case 'closed':
      return (
        <Notice icon={<Clock />} title={state.reason === 'declined' ? 'This document was declined' : 'This link has expired'}>
          {state.reason === 'declined' ? (
            <>If this was a mistake, please contact {state.contact}.</>
          ) : state.reason === 'not_found' ? (
            <>This link is not valid. Please check the link in your email, or contact {state.contact}.</>
          ) : (
            <>This link has expired, please contact {state.contact}.</>
          )}
        </Notice>
      );
    case 'not_yet':
      return (
        <Notice icon={<Clock />} title="This document is not open yet">
          It opens on {fmtManila(state.openFrom)} (Philippine time). Please come back then, or contact {state.contact}.
        </Notice>
      );
    case 'declined':
      return (
        <Notice icon={<XCircle />} title="You declined this document">
          {state.contact} has been told. Thank you for letting us know.
        </Notice>
      );
    case 'signed':
      return (
        <Notice icon={<CheckCircle2 />} title="Thank you, your signature is recorded">
          {state.countersign ? `${state.contact} will countersign “${state.title}”. You will then get the final signed PDF by email.` : `You will get the final PDF by email.`}
        </Notice>
      );
    case 'completed':
      return (
        <Notice icon={<CheckCircle2 />} title={state.action === 'view' ? 'Paid, thank you' : 'This document is complete'}>
          <p>
            {state.action === 'view'
              ? `“${state.title}” is paid in full. Download the copy stamped PAID.`
              : `“${state.title}” is signed by everyone. Download your copy, with its Execution page and Certificate of Completion.`}
          </p>
          <a
            href={`${base}/download`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="download-final"
            className="focus-ring mx-auto mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-action px-5 text-body font-medium text-action-fg hover:bg-action-hover"
          >
            <Download className="size-4" aria-hidden /> Download the signed PDF
          </a>
          <p className="mt-4 break-all text-caption text-fg-tertiary">SHA-256: {state.finalSha256}</p>
          <p className="mt-1 text-caption text-fg-tertiary">This download works until {fmtManila(state.downloadUntil)}.</p>
        </Notice>
      );
    case 'otp_view':
      return <ViewCode base={base} doc={state.doc} onVerified={(g) => {
        sessionStorage.setItem(grantKey, g);
        setState({ s: 'loading' });
        void load();
      }} />;
    case 'open':
      return (
        <Shell title={state.doc.title}>
          <main className="mx-auto grid w-full max-w-[1440px] flex-1 gap-6 px-4 py-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_400px]">
            <section aria-label="Document" className="min-w-0">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <h1 className="text-h2 text-fg">{state.doc.title}</h1>
                {state.doc.pageCount ? <Badge>{state.doc.pageCount} {state.doc.pageCount === 1 ? "page" : "pages"}</Badge> : null}
              </div>
              <div className="rounded-lg border border-line bg-subtle p-3 md:p-5">
                <PdfViewer
                  data={pdf}
                  label={state.doc.title}
                  onRendered={onRendered}
                  onView={(page, seen) => {
                    view.current = { page, seen };
                  }}
                />
              </div>
            </section>
            <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto" aria-label="Sign">
              {state.doc.action === 'view' ? (
                <Card className="flex flex-col gap-3 p-5">
                  <h2 className="text-h3 text-fg">{state.doc.title}</h2>
                  {state.doc.payLink && (
                    <a
                      href={state.doc.payLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="pay-now"
                      onClick={() => {
                        void fetch(`${base}/paylink`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visit }), keepalive: true });
                      }}
                      className="focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-md bg-danger-fg px-5 text-body font-semibold text-white hover:opacity-90"
                    >
                      Pay now
                    </a>
                  )}
                  {state.doc.payLink && <p className="break-all text-caption text-fg-tertiary">{state.doc.payLink}</p>}
                  {state.doc.hasQr && (
                    <figure className="flex flex-col items-center gap-1 self-center">
                      {/* eslint-disable-next-line @next/next/no-img-element -- same-origin, token-checked image */}
                      <img src={`${base}/qr?visit=${encodeURIComponent(visit ?? '')}`} alt="Payment QR code" className="size-40 rounded-md border border-line bg-white object-contain p-2" data-testid="pay-qr" />
                      <figcaption className="text-caption text-fg-secondary">Scan to pay</figcaption>
                    </figure>
                  )}
                  <p className="text-body text-fg-secondary">Questions about this statement? Reply to the email from {state.contact}.</p>
                  <a
                    href={`${base}/download?visit=${encodeURIComponent(visit ?? '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="download-view"
                    className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-action px-5 text-body font-medium text-action-fg hover:bg-action-hover"
                  >
                    <Download className="size-4" aria-hidden /> Download PDF
                  </a>
                </Card>
              ) : (
              <SignPanel
                base={base}
                visit={visit!}
                doc={state.doc}
                contact={state.contact}
                onDone={(next) => {
                  sessionStorage.removeItem(visitKey);
                  if (next === 'declined') setState({ s: 'declined', contact: state.contact });
                  else {
                    setState({ s: 'loading' });
                    void load();
                  }
                }}
              />
              )}
            </aside>
          </main>
        </Shell>
      );
  }
}

function useCooldown(): [number, (s: number) => void] {
  const [left, setLeft] = React.useState(0);
  React.useEffect(() => {
    if (left <= 0) return;
    const id = window.setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => window.clearTimeout(id);
  }, [left]);
  return [left, setLeft];
}

function ViewCode({ base, doc, onVerified }: { base: string; doc: Doc; onVerified: (grant: string) => void }) {
  const [code, setCode] = React.useState('');
  const [msg, setMsg] = React.useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [cool, setCool] = useCooldown();
  const send = async () => {
    setBusy(true);
    const r = await call(`${base}/otp`, { body: { purpose: 'view' } });
    setBusy(false);
    if (r.ok) {
      setMsg({ tone: 'ok', text: `We emailed a 6-digit code to ${doc.emailMasked}.` });
      setCool(60);
    } else {
      setMsg({ tone: 'err', text: String(r.data.error || 'Could not send the code.') });
      if (r.data.retryIn) setCool(Number(r.data.retryIn));
    }
  };
  const verify = async () => {
    setBusy(true);
    const r = await call(`${base}/verify`, { body: { code: code.trim() } });
    setBusy(false);
    if (r.ok) onVerified(String(r.data.grant));
    else setMsg({ tone: 'err', text: String(r.data.error || 'That code did not work.') });
  };
  return (
    <Shell title={doc.title}>
      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-md p-8">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-subtle text-fg-secondary">
            <Mail className="size-6" aria-hidden />
          </div>
          <h1 className="text-h2 text-fg">Confirm it&apos;s you</h1>
          <p className="mt-2 text-body text-fg-secondary">
            To open “{doc.title}”, enter the code we email to {doc.emailMasked}.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            <Button variant="secondary" onClick={send} disabled={busy || cool > 0}>
              {cool > 0 ? `Send again in ${cool} s` : 'Email me a code'}
            </Button>
            <Field label="6-digit code" htmlFor="view-otp">
              <Input id="view-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} mono />
            </Field>
            <Button variant="primary" onClick={verify} disabled={busy || code.length !== 6} loading={busy}>
              Open the document
            </Button>
            {msg && <p role={msg.tone === 'err' ? 'alert' : 'status'} className={cn('text-small', msg.tone === 'err' ? 'text-danger-fg' : 'text-success-fg')}>{msg.text}</p>}
          </div>
        </Card>
      </main>
    </Shell>
  );
}

function FormField({ f, value, onChange }: { f: SignerFormField; value: unknown; onChange: (v: unknown) => void }) {
  const id = `sf-${f.key}`;
  switch (f.kind) {
    case 'choice':
      return (
        <fieldset className="flex flex-col gap-1.5" data-field={f.key}>
          <legend className="mb-1 text-body-strong text-fg">
            {f.label}
            {f.required && <span className="text-danger-fg"> *</span>}
          </legend>
          {(f.options ?? []).map((o) => (
            <label
              key={o}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-body transition-colors',
                value === o ? 'border-selected bg-selected-soft text-selected-soft-fg' : 'border-line hover:bg-subtle',
              )}
            >
              <input type="radio" name={id} value={o} checked={value === o} onChange={() => onChange(o)} className="accent-selected" />
              {o}
            </label>
          ))}
          {f.help && <p className="text-small text-fg-tertiary">{f.help}</p>}
        </fieldset>
      );
    case 'multi-check': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset className="flex flex-col gap-1.5" data-field={f.key}>
          <legend className="mb-1 text-body-strong text-fg">
            {f.label}
            {f.required && <span className="text-danger-fg"> *</span>}
          </legend>
          {(f.options ?? []).map((o) => (
            <Checkbox key={o} label={o} checked={arr.includes(o)} onChange={(e) => onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))} />
          ))}
          {f.help && <p className="text-small text-fg-tertiary">{f.help}</p>}
        </fieldset>
      );
    }
    case 'confirm':
      return (
        <div data-field={f.key}>
          <Checkbox label={<span>{f.label}{f.required && <span className="text-danger-fg"> *</span>}</span>} checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {f.help && <p className="mt-1 text-small text-fg-tertiary">{f.help}</p>}
        </div>
      );
    case 'date':
      return (
        <Field label={f.label + (f.required ? ' *' : '')} htmlFor={id} hint={f.help}>
          <Input id={id} type="date" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case 'text':
      return (
        <Field label={f.label + (f.required ? ' *' : '')} htmlFor={id} hint={f.help}>
          <Input id={id} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} maxLength={1000} />
        </Field>
      );
    case 'rows': {
      const cols = f.columns ?? [];
      const rows = Array.isArray(value) ? (value as string[][]) : [];
      const max = f.maxRows ?? 5;
      const set = (r: number, c: number, v: string) => {
        const next = rows.map((x) => [...x]);
        next[r][c] = v;
        onChange(next);
      };
      return (
        <fieldset className="flex flex-col gap-2" data-field={f.key}>
          <legend className="mb-1 text-body-strong text-fg">{f.label}</legend>
          {f.help && <p className="text-small text-fg-tertiary">{f.help}</p>}
          {rows.map((row, r) => (
            <div key={r} className="grid gap-2 rounded-md border border-line p-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, cols.length)}, minmax(0, 1fr))` }}>
              {cols.map((c, ci) =>
                /severity/i.test(c) ? (
                  <Select key={c} aria-label={`${c}, row ${r + 1}`} value={row[ci] ?? ''} onChange={(e) => set(r, ci, e.target.value)}>
                    <option value="">{c}</option>
                    <option value="S3">S3</option>
                    <option value="S4">S4</option>
                  </Select>
                ) : (
                  <Input key={c} aria-label={`${c}, row ${r + 1}`} placeholder={c} type={/date/i.test(c) ? 'date' : 'text'} value={row[ci] ?? ''} onChange={(e) => set(r, ci, e.target.value)} />
                ),
              )}
            </div>
          ))}
          <div className="flex gap-2">
            {rows.length < max && (
              <Button size="sm" variant="secondary" onClick={() => onChange([...rows, cols.map(() => '')])}>
                Add a row
              </Button>
            )}
            {rows.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => onChange(rows.slice(0, -1))}>
                Remove last row
              </Button>
            )}
          </div>
        </fieldset>
      );
    }
  }
}

function SignPanel({ base, visit, doc, contact, onDone }: { base: string; visit: string; doc: Doc; contact: string; onDone: (next: 'signed' | 'declined') => void }) {
  const isSign = doc.action !== 'acknowledge';
  const [answers, setAnswers] = React.useState<Record<string, unknown>>({});
  const [name, setName] = React.useState(doc.recipientName ?? '');
  const [title, setTitle] = React.useState(doc.recipientTitle ?? '');
  const [authorised, setAuthorised] = React.useState(false);
  const [consent, setConsent] = React.useState(false);
  const [signature, setSignature] = React.useState<SignatureValue | null>(null);
  const [otp, setOtp] = React.useState('');
  const [outcome, setOutcome] = React.useState<'confirm' | 'concern'>('confirm');
  const [concern, setConcern] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [otpMsg, setOtpMsg] = React.useState<string | null>(null);
  const [cool, setCool] = useCooldown();
  const [declining, setDeclining] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const company = doc.clientName || 'my company';

  const sendCode = async () => {
    setOtpMsg(null);
    const r = await call(`${base}/otp`, { body: { purpose: 'sign', visit } });
    if (r.ok) {
      setOtpMsg(`We emailed a 6-digit code to ${doc.emailMasked}. It works for 10 minutes.`);
      setCool(60);
    } else {
      setOtpMsg(String(r.data.error || 'Could not send the code.'));
      if (r.data.retryIn) setCool(Number(r.data.retryIn));
    }
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    const r = await call(`${base}/sign`, {
      body: {
        visit,
        name,
        title,
        authorised,
        consent,
        otp,
        answers,
        ...(isSign ? { signature: signature?.png, signatureKind: signature?.kind } : { outcome, concern }),
      },
    });
    setBusy(false);
    if (r.ok) onDone('signed');
    else setError(String(r.data.error || 'Could not sign. Please try again.'));
  };

  const decline = async () => {
    setError(null);
    setBusy(true);
    const r = await call(`${base}/decline`, { body: { visit, reason } });
    setBusy(false);
    if (r.ok) onDone('declined');
    else setError(String(r.data.error || 'Could not decline. Please try again.'));
  };

  if (declining) {
    return (
      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-h3 text-fg">Decline this document</h2>
        <p className="text-body text-fg-secondary">{contact} will see your reason.</p>
        <Field label="Reason" htmlFor="decline-reason">
          <Textarea id="decline-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
        </Field>
        {error && <p role="alert" className="text-small text-danger-fg">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeclining(false)}>
            Back
          </Button>
          <Button variant="danger" icon={<XCircle />} onClick={decline} loading={busy} disabled={reason.trim().length < 3}>
            Decline
          </Button>
        </div>
      </Card>
    );
  }

  const ready =
    name.trim().length >= 2 && title.trim() && authorised && consent && otp.length === 6 && (isSign ? !!signature : outcome === 'confirm' || concern.trim().length >= 3);

  return (
    <Card className="flex flex-col gap-5 p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-subtle text-fg-secondary">
          <FileSignature className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-h3 text-fg">{isSign ? 'Review and sign' : 'Review and confirm'}</h2>
          <p className="text-small text-fg-secondary">Read the document, then complete the steps below.</p>
        </div>
      </div>

      {(doc.signerForm ?? []).length > 0 && (
        <div className="flex flex-col gap-4">
          {(doc.signerForm ?? []).map((f) => (
            <FormField key={f.key} f={f} value={answers[f.key]} onChange={(v) => setAnswers((a) => ({ ...a, [f.key]: v }))} />
          ))}
        </div>
      )}

      {!isSign && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-body-strong text-fg">Your response</legend>
          {(['confirm', 'concern'] as const).map((o) => (
            <label
              key={o}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-body',
                outcome === o ? 'border-selected bg-selected-soft text-selected-soft-fg' : 'border-line hover:bg-subtle',
              )}
            >
              <input type="radio" name="ack-outcome" checked={outcome === o} onChange={() => setOutcome(o)} />
              {o === 'confirm' ? 'Confirm' : 'Raise a concern'}
            </label>
          ))}
          {outcome === 'concern' && (
            <Textarea aria-label="Your concern" placeholder="Describe your concern" value={concern} onChange={(e) => setConcern(e.target.value)} maxLength={2000} />
          )}
        </fieldset>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <Field label="Full name" htmlFor="signer-name">
          <Input id="signer-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
        </Field>
        <Field label="Job title" htmlFor="signer-title">
          <Input id="signer-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoComplete="organization-title" />
        </Field>
      </div>

      <div className="flex flex-col gap-3">
        <Checkbox data-testid="authorised" label={`I am authorised to sign for ${company}`} checked={authorised} onChange={(e) => setAuthorised(e.target.checked)} />
        <label className="flex cursor-pointer items-start gap-2 text-body text-fg">
          <span className="mt-0.5">
            <Checkbox data-testid="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          </span>
          <span>{CONSENT}</span>
        </label>
      </div>

      {isSign && <SignaturePad onChange={setSignature} defaultTyped={name} />}

      <div className="flex flex-col gap-2 rounded-md border border-line p-3">
        <p className="text-body-strong text-fg">Confirm with a code</p>
        <p className="text-small text-fg-secondary">We email a 6-digit code to {doc.emailMasked}.</p>
        <div className="flex gap-2">
          <Input aria-label="6-digit code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} mono />
          <Button variant="secondary" onClick={sendCode} disabled={cool > 0}>
            {cool > 0 ? `Again in ${cool} s` : 'Email code'}
          </Button>
        </div>
        {otpMsg && <p role="status" className="text-small text-fg-secondary">{otpMsg}</p>}
      </div>

      {error && <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-small text-danger-fg">{error}</p>}

      <div className="flex flex-col gap-2">
        <Button variant="brand" size="lg" onClick={submit} loading={busy} disabled={!ready} data-testid="submit-sign">
          {isSign ? 'Sign the document' : outcome === 'confirm' ? 'Confirm' : 'Send my concern'}
        </Button>
        <Button variant="ghost" onClick={() => setDeclining(true)}>
          Decline
        </Button>
      </div>
      {doc.expiresAt && <p className="text-caption text-fg-tertiary">This link works until {fmtManila(doc.expiresAt)} (Philippine time).</p>}
    </Card>
  );
}
