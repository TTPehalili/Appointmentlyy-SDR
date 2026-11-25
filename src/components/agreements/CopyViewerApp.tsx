'use client';

/**
 * A copy (CC) recipient's page (/s/view/[token]): the document, view only. It has no sign or decline
 * controls, never asks for or sends a one-time code, and only ever calls its own view-only API
 * (/api/sign/view/[token]), so it can neither act as the signer nor learn the signer's link. Its
 * views are recorded as the copy's own (never the signer's opens, reading time or pages).
 */
import * as React from 'react';
import { CheckCircle2, Clock, Download, Eye, XCircle } from 'lucide-react';
import { Badge, Card, Skeleton } from '@/components/ui';
import { PdfViewer } from '@/components/agreements/PdfViewer';
import { Notice, Shell, ViewPayPanel, call, type Doc } from '@/components/agreements/SignerApp';
import { fmtManila } from '@/lib/agreements/envelope';

type CopyDoc = Omit<Doc, 'emailMasked'> & { signerName?: string; copyName?: string };

type State =
  | { s: 'loading' }
  | { s: 'error'; message: string }
  | { s: 'closed'; reason: string; contact: string }
  | { s: 'not_yet'; openFrom: string; contact: string }
  | { s: 'signed'; title: string; signerName: string; countersign: boolean; contact: string }
  | { s: 'completed'; title: string; signerName: string; action: string; finalSha256: string; downloadUntil: string; contact: string }
  | { s: 'open'; doc: CopyDoc; contact: string };

/** "View only: Casey Client signs this document." */
function bannerText(doc: CopyDoc): string {
  const who = doc.signerName || 'The recipient';
  if (doc.action === 'view') return `View only: a copy of the statement sent to ${who}.`;
  if (doc.action === 'acknowledge') return `View only: ${who} confirms this document.`;
  return `View only: ${who} signs this document.`;
}

function ViewOnlyBanner({ text }: { text: string }) {
  return (
    <div role="note" data-testid="view-only-banner" className="mb-4 flex items-start gap-2 rounded-md border border-selected/40 bg-selected-soft px-3 py-2.5 text-body text-selected-soft-fg">
      <Eye className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="font-medium">{text}</span>
    </div>
  );
}

export function CopyViewerApp({ token }: { token: string }) {
  const base = `/api/sign/view/${encodeURIComponent(token)}`;
  const visitKey = `agr:cv:${token.slice(0, 12)}`;
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
        return setState({ s: 'signed', title: String(d.title), signerName: String(d.signerName || ''), countersign: d.countersign === true, contact });
      case 'completed':
        return setState({ s: 'completed', title: String(d.title), signerName: String(d.signerName || ''), action: String(d.action || 'sign'), finalSha256: String(d.finalSha256 || ''), downloadUntil: String(d.downloadUntil), contact });
    }
    if (d.visitValid && stored) {
      setVisit(stored);
      return setState({ s: 'open', doc: d.doc as CopyDoc, contact });
    }
    // Start a visit (the view is recorded once the PDF has rendered in a visible tab).
    const o = await call(`${base}/open`, { body: {} });
    if (!o.ok) {
      if (o.data.state === 'closed') return setState({ s: 'closed', reason: String(o.data.reason || 'expired'), contact });
      return setState({ s: 'error', message: String(o.data.error || 'This page could not be loaded.') });
    }
    const v = String(o.data.visit);
    sessionStorage.setItem(visitKey, v);
    setVisit(v);
    const again = await call(base, { visit: v });
    if (again.ok && again.data.state === 'open') return setState({ s: 'open', doc: again.data.doc as CopyDoc, contact });
    return load();
  }, [base, visitKey]);

  React.useEffect(() => {
    void load();
  }, [load]);

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

  // One copy view per visit, after the PDF has rendered in a visible tab for 1.5 s (as for the signer).
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

  const payClicked = (provider: 'wise' | 'paypal') => {
    void fetch(`${base}/paylink`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visit, provider }), keepalive: true });
  };

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
          {state.reason === 'not_found' ? <>This link is not valid. Please check the link in your email, or contact {state.contact}.</> : <>This link is no longer available. Please contact {state.contact}.</>}
        </Notice>
      );
    case 'not_yet':
      return (
        <Notice icon={<Clock />} title="This document is not open yet">
          It opens on {fmtManila(state.openFrom)} (Philippine time). Please come back then, or contact {state.contact}.
        </Notice>
      );
    case 'signed':
      return (
        <Notice icon={<CheckCircle2 />} title={`${state.signerName || 'The recipient'} has signed`}>
          {state.countersign ? `${state.contact} will countersign “${state.title}”. You will then get the final copy by email.` : 'You will get the final copy by email.'}
        </Notice>
      );
    case 'completed':
      return (
        <Notice icon={<CheckCircle2 />} title={state.action === 'view' ? 'Paid' : 'This document is complete'}>
          <p data-testid="view-only-banner">View only: your copy, for your information.</p>
          <p className="mt-2">
            {state.action === 'view'
              ? `“${state.title}” is paid in full. Download the copy stamped PAID.`
              : `“${state.title}” is signed by everyone. Download the copy, with its Execution page and Certificate of Completion.`}
          </p>
          <a
            href={`${base}/download`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="download-final"
            className="focus-ring mx-auto mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-action px-5 text-body font-medium text-action-fg hover:bg-action-hover"
          >
            <Download className="size-4" aria-hidden /> Download the {state.action === 'view' ? 'PDF' : 'signed PDF'}
          </a>
          <p className="mt-4 break-all text-caption text-fg-tertiary">SHA-256: {state.finalSha256}</p>
          <p className="mt-1 text-caption text-fg-tertiary">This download works until {fmtManila(state.downloadUntil)}.</p>
        </Notice>
      );
    case 'open':
      return (
        <Shell title={state.doc.title}>
          <main className="mx-auto grid w-full max-w-[1440px] flex-1 gap-6 px-4 py-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_400px]">
            <section aria-label="Document" className="min-w-0">
              <ViewOnlyBanner text={bannerText(state.doc)} />
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <h1 className="text-h2 text-fg">{state.doc.title}</h1>
                <Badge tone="neutral">View only</Badge>
                {state.doc.pageCount ? <Badge>{state.doc.pageCount} {state.doc.pageCount === 1 ? 'page' : 'pages'}</Badge> : null}
              </div>
              <div className="rounded-lg border border-line bg-subtle p-3 md:p-5">
                <PdfViewer data={pdf} label={state.doc.title} onRendered={onRendered} />
              </div>
            </section>
            <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto" aria-label="About this copy">
              {state.doc.action === 'view' ? (
                <ViewPayPanel base={base} visit={visit} doc={state.doc} contact={state.contact} onPay={payClicked} />
              ) : (
                <Card className="flex flex-col gap-3 p-5" data-testid="copy-panel">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-subtle text-fg-secondary">
                      <Eye className="size-5" aria-hidden />
                    </span>
                    <div>
                      <h2 className="text-h3 text-fg">For your information</h2>
                      <p className="text-small text-fg-secondary">{state.contact} copied you on this document.</p>
                    </div>
                  </div>
                  <p className="text-body text-fg">
                    Only {state.doc.signerName || 'the recipient'} can {state.doc.action === 'acknowledge' ? 'confirm' : 'sign'} it, from their own link. You can read it here.
                  </p>
                  <p className="text-body text-fg-secondary">When it is complete, you will get the final copy by email.</p>
                  {state.doc.expiresAt && <p className="text-caption text-fg-tertiary">This link works until {fmtManila(state.doc.expiresAt)} (Philippine time).</p>}
                </Card>
              )}
            </aside>
          </main>
        </Shell>
      );
  }
}
