'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ImagePlus, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, Checkbox, Dialog, Field, InlineError, Select, Textarea, buttonClasses } from '@/components/ui';
import { useServerAuth } from '@/lib/authClient';
import { snapshotSupportContext } from '@/lib/supportCapture';
import {
  SCREENSHOT_MIME,
  SUPPORT_AREAS,
  SUPPORT_LIMITS,
  URGENCY_OPTIONS,
  describeContextForPerson,
  guessArea,
  type SupportContext,
  type TicketUrgency,
} from '@/lib/supportReport';

/**
 * "Report a problem": one dialog for every user and role in every workspace, mounted once in the app shell. Open it
 * from anywhere with useReportProblem().open({ area, errorText }); inline links next to an error pass the error text.
 *
 * The page path, browser, recent errors and failed requests are captured by supportCapture.ts and shown to the person
 * in plain words before sending, with a box to leave them out. Screenshots can be pasted or attached (PNG, JPG,
 * WebP, up to 3, 5 MB each); they go up one by one after the report is filed.
 */

export interface ReportPrefill {
  /** SUPPORT_AREAS value; guessed from the page when left out. */
  area?: string;
  /** The error message next to the link the person clicked. */
  errorText?: string;
}

interface ReportApi {
  open: (prefill?: ReportPrefill) => void;
}

/** Fired after a report is filed, so lists (My reports) can refresh. */
export const REPORT_FILED_EVENT = 'appy:support-report-filed';

const ReportContext = React.createContext<ReportApi | null>(null);

export function useReportProblem(): ReportApi {
  const ctx = React.useContext(ReportContext);
  const router = useRouter();
  // Outside the app shell there is no dialog: fall back to the Help page.
  return ctx ?? { open: () => router.push('/help#my-reports') };
}

interface Shot {
  key: string;
  file: File;
  url: string;
}

interface Done {
  id: string;
  shotErrors: string[];
}

const ACCEPT = SCREENSHOT_MIME.join(',');
const MB = 1024 * 1024;

export function ReportProblemProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [ctx, setCtx] = React.useState<SupportContext | null>(null);
  const [what, setWhat] = React.useState('');
  const [tried, setTried] = React.useState('');
  const [urgency, setUrgency] = React.useState<TicketUrgency>('annoying');
  const [area, setArea] = React.useState('other');
  const [shots, setShots] = React.useState<Shot[]>([]);
  const [shotNote, setShotNote] = React.useState<string | null>(null);
  const [omit, setOmit] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [whatError, setWhatError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<Done | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const shotsRef = React.useRef<Shot[]>([]);
  React.useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);
  const { identity } = useServerAuth();
  const ids = React.useId();

  const reset = React.useCallback(() => {
    for (const s of shotsRef.current) URL.revokeObjectURL(s.url);
    setShots([]);
    setCtx(null);
    setWhat('');
    setTried('');
    setUrgency('annoying');
    setArea('other');
    setShotNote(null);
    setOmit(false);
    setSubmitting(false);
    setError(null);
    setWhatError(null);
    setDone(null);
  }, []);

  // Nothing typed here survives the dialog closing, and nothing leaks to the next report.
  React.useLayoutEffect(() => () => reset(), [reset]);

  const openReport = React.useCallback(
    (prefill: ReportPrefill = {}) => {
      reset();
      const errorText = (prefill.errorText || '').replace(/\s+/g, ' ').trim().slice(0, SUPPORT_LIMITS.errorText);
      let c: SupportContext | null = null;
      try {
        c = snapshotSupportContext({ errorText });
      } catch {
        c = null;
      }
      setCtx(c);
      setArea(prefill.area && SUPPORT_AREAS.some((a) => a.value === prefill.area) ? prefill.area : guessArea(window.location.pathname));
      if (errorText) setWhat(`I saw this error: "${c?.errorText || errorText}"\n`);
      setOpen(true);
    },
    [reset],
  );

  const close = React.useCallback(() => {
    if (submitting) return;
    setOpen(false);
    reset();
  }, [submitting, reset]);

  const addFiles = React.useCallback((files: File[]) => {
    const notes: string[] = [];
    setShots((cur) => {
      const next = [...cur];
      for (const f of files) {
        if (next.length >= SUPPORT_LIMITS.screenshots) {
          notes.push(`You can add up to ${SUPPORT_LIMITS.screenshots} screenshots.`);
          break;
        }
        if (!(SCREENSHOT_MIME as readonly string[]).includes(f.type)) {
          notes.push(`${f.name || 'That file'} is not a PNG, JPG or WebP picture.`);
          continue;
        }
        if (f.size > SUPPORT_LIMITS.screenshotBytes) {
          notes.push(`${f.name || 'That picture'} is ${(f.size / MB).toFixed(1)} MB. Use one under 5 MB.`);
          continue;
        }
        next.push({ key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file: f, url: URL.createObjectURL(f) });
      }
      return next;
    });
    setShotNote(notes.length ? [...new Set(notes)].join(' ') : null);
  }, []);

  const removeShot = (key: string) =>
    setShots((cur) => {
      const s = cur.find((x) => x.key === key);
      if (s) URL.revokeObjectURL(s.url);
      return cur.filter((x) => x.key !== key);
    });

  const onPaste = (e: React.ClipboardEvent) => {
    const items = [...(e.clipboardData?.items ?? [])];
    const files = items.filter((i) => i.kind === 'file' && i.type.startsWith('image/')).map((i) => i.getAsFile()).filter((f): f is File => !!f);
    if (!files.length) return;
    // A picture on its own is a screenshot; text pasted alongside still goes into the field.
    if (!items.some((i) => i.kind === 'string' && i.type === 'text/plain')) e.preventDefault();
    addFiles(files.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `pasted-${i + 1}.${f.type.split('/')[1] || 'png'}`, { type: f.type }))));
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (submitting) return;
    if (!what.trim()) {
      setWhatError('Please tell us what happened.');
      return;
    }
    setWhatError(null);
    setError(null);
    setSubmitting(true);
    const base = ctx ?? snapshotSupportContext();
    const context: SupportContext = omit ? { v: 1, omitted: true, page: base.page, app: base.app, time: base.time } : base;
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatHappened: what, tried, urgency, area, context, screenshots: shots.length }),
      });
      const data = (await res.json().catch(() => ({}))) as { ticket?: { id: string }; uploadUrl?: string; error?: string };
      if (!res.ok || !data.ticket) {
        setError(data.error || 'Your report could not be sent. Please try again.');
        setSubmitting(false);
        return;
      }
      const shotErrors: string[] = [];
      for (const [i, s] of shots.entries()) {
        try {
          const up = await fetch(data.uploadUrl || `/api/tickets/${data.ticket.id}/attachments`, { method: 'POST', headers: { 'Content-Type': s.file.type }, body: s.file });
          if (!up.ok) {
            const j = (await up.json().catch(() => ({}))) as { error?: string };
            shotErrors.push(`Screenshot ${i + 1}: ${j.error || 'could not be added'}`);
          }
        } catch {
          shotErrors.push(`Screenshot ${i + 1}: could not be added (network)`);
        }
      }
      for (const s of shotsRef.current) URL.revokeObjectURL(s.url);
      setShots([]);
      setDone({ id: data.ticket.id, shotErrors });
      setSubmitting(false);
      window.dispatchEvent(new CustomEvent(REPORT_FILED_EVENT, { detail: { id: data.ticket.id } }));
    } catch {
      setError('Your report could not be sent. Check your connection and try again.');
      setSubmitting(false);
    }
  };

  const api = React.useMemo(() => ({ open: openReport }), [openReport]);
  const lines = ctx ? describeContextForPerson(ctx) : [];

  return (
    <ReportContext.Provider value={api}>
      {children}
      <Dialog
        open={open}
        onClose={close}
        dismissible={!submitting}
        title={done ? 'Report sent' : 'Report a problem'}
        description={done ? undefined : 'Tell us what went wrong. We reply in My reports on the Help page and by email.'}
        size="lg"
        footer={
          done ? (
            <>
              <Link href={`/help?report=${encodeURIComponent(done.id)}#my-reports`} onClick={close} className={buttonClasses('secondary', 'md')}>
                View my reports
              </Link>
              <Button variant="primary" onClick={close}>
                Done
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={close} disabled={submitting}>
                Cancel
              </Button>
              <Button variant="brand" type="submit" form={`${ids}-form`} loading={submitting} data-testid="report-send">
                {submitting ? 'Sending' : 'Send report'}
              </Button>
            </>
          )
        }
      >
        {done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center" data-testid="report-done">
            <CheckCircle2 className="size-10 text-success-fg" aria-hidden />
            <p className="text-h3 text-fg">Thanks, we got it.</p>
            <p className="text-body text-fg-secondary">
              Your report number is{' '}
              <span className="font-mono text-fg" data-testid="report-id">
                {done.id}
              </span>
              . We will reply in My reports on the Help page and by email.
            </p>
            {done.shotErrors.length > 0 && (
              <div className="w-full text-left">
                <InlineError message={`The report was sent, but ${done.shotErrors.length === 1 ? 'a screenshot was' : 'some screenshots were'} not added. ${done.shotErrors.join(' ')}`} />
              </div>
            )}
          </div>
        ) : (
          <form id={`${ids}-form`} onSubmit={submit} onPaste={onPaste} className="flex flex-col gap-4" data-testid="report-form" noValidate>
            <Field label="What happened?" htmlFor={`${ids}-what`} error={whatError ?? undefined}>
              <Textarea
                id={`${ids}-what`}
                value={what}
                onChange={(e) => setWhat(e.target.value)}
                maxLength={SUPPORT_LIMITS.whatHappened}
                rows={4}
                required
                aria-required
                aria-invalid={whatError ? true : undefined}
                placeholder="For example: I clicked Send and got an error."
                autoFocus
              />
            </Field>
            <Field label="What were you trying to do? (optional)" htmlFor={`${ids}-tried`}>
              <Textarea
                id={`${ids}-tried`}
                value={tried}
                onChange={(e) => setTried(e.target.value)}
                maxLength={SUPPORT_LIMITS.tried}
                rows={2}
                className="min-h-16"
                placeholder="For example: send a follow-up email to a lead."
              />
            </Field>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-body-strong text-fg">How much is this affecting you?</legend>
              <div className="flex flex-wrap gap-2" data-testid="report-urgency">
                {URGENCY_OPTIONS.map((o) => (
                  <label key={o.value} className="relative inline-flex" title={o.hint}>
                    <input
                      type="radio"
                      name={`${ids}-urgency`}
                      value={o.value}
                      checked={urgency === o.value}
                      onChange={() => setUrgency(o.value)}
                      className="peer sr-only"
                    />
                    <span
                      className={cn(
                        'inline-flex h-9 cursor-pointer items-center rounded-full border px-3.5 text-body transition-colors duration-150',
                        'peer-focus-visible:ring-2 peer-focus-visible:ring-selected peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface',
                        urgency === o.value ? 'border-selected bg-selected text-selected-fg' : 'border-line-strong bg-surface text-fg-secondary hover:text-fg',
                      )}
                    >
                      {o.label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Field label="Area" htmlFor={`${ids}-area`} hint="We guessed this from the page you were on.">
              <Select id={`${ids}-area`} value={area} onChange={(e) => setArea(e.target.value)}>
                {SUPPORT_AREAS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-body-strong text-fg">Screenshots (optional)</span>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<ImagePlus />}
                  onClick={() => fileRef.current?.click()}
                  disabled={shots.length >= SUPPORT_LIMITS.screenshots}
                >
                  Attach a picture
                </Button>
              </div>
              <p className="text-small text-fg-tertiary">Paste a screenshot here (Ctrl+V) or attach one. PNG, JPG or WebP, up to 3, 5 MB each.</p>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                data-testid="report-file"
                onChange={(e) => {
                  addFiles([...(e.target.files ?? [])]);
                  e.target.value = '';
                }}
              />
              {shots.length > 0 && (
                <ul className="flex flex-wrap gap-2" data-testid="report-shots">
                  {shots.map((s, i) => (
                    <li key={s.key} className="relative size-20 overflow-hidden rounded-md border border-line bg-subtle">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.url} alt={`Screenshot ${i + 1}`} className="size-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeShot(s.key)}
                        aria-label={`Remove screenshot ${i + 1}`}
                        className="focus-ring absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full bg-inverse/80 text-fg-inverse"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {shotNote && (
                <p className="text-small text-danger-fg" role="alert">
                  {shotNote}
                </p>
              )}
            </div>

            <div className="rounded-md border border-line bg-subtle px-4 py-3" data-testid="report-auto">
              <p className="text-body-strong text-fg">Attached automatically</p>
              {omit ? (
                <p className="mt-1 text-small text-fg-secondary">Only the page and the time will be sent.</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-0.5 text-small text-fg-secondary">
                  {lines.map((l) => (
                    <li key={l} className="break-words">
                      {l}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-caption text-fg-tertiary">Never included: your notes, emails, lead details, passwords or anything you typed elsewhere.</p>
              <div className="mt-2">
                <Checkbox label="Leave out the technical details" checked={omit} onChange={(e) => setOmit(e.target.checked)} data-testid="report-omit" />
              </div>
            </div>
            <p className="sr-only" aria-live="polite">
              {identity ? `Reporting as ${identity.repName} in ${identity.tenantName}` : ''}
            </p>
            {error && <InlineError message={error} />}
          </form>
        )}
      </Dialog>
    </ReportContext.Provider>
  );
}

/** Small "Report this problem" link for inline error messages (Cold email, Inbox...). */
export function ReportThisProblem({ area, errorText, className }: { area: string; errorText: string; className?: string }) {
  const { open } = useReportProblem();
  return (
    <button
      type="button"
      onClick={() => open({ area, errorText })}
      data-testid="report-inline"
      className={cn('focus-ring shrink-0 rounded-sm font-medium text-fg-secondary underline underline-offset-2 hover:text-fg', className)}
    >
      Report this problem
    </button>
  );
}
