'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarCheck, CheckCircle2, Info, Sparkles, X } from 'lucide-react';
import { Button, Dialog, Field, IconButton, InlineError, Input, Select, Textarea, buttonClasses, useToast } from '@/components/ui';
import { useSession } from '@/lib/session';
import { MEETING_PLAN_LIMITS, type Assignee, type LeadSnapshot, type MeetingPlan } from '@/lib/meetingPlan';
import { meetingPlansApi, sameEmail } from './meetingPlanClient';

export interface BookingHandoffDialogProps {
  open: boolean;
  onClose: () => void;
  /** The prospect as the Dialer (or Pipeline card) knows them. */
  lead: LeadSnapshot;
  /** The outcome the rep picked, e.g. "Meeting Booked". */
  outcome: string;
  /** Prefill: agreed meeting time (free text). */
  meetingAt?: string;
  /** Prefill: the rep's call notes, already merged and de-duplicated. */
  notes?: string;
  /** Recent call transcript lines, when the call had one. Sent as-is; not shown. */
  transcript?: string;
  onCreated?: (plan: MeetingPlan) => void;
}

const ME = '__me__';

/** Default AE: the first Account Executive in the list, else "Me". */
function defaultAssignee(list: Assignee[], myEmail: string): string {
  const ae = list.find((a) => /account executive/i.test(a.role) && !sameEmail(a.email, myEmail));
  return ae ? ae.email : ME;
}

/**
 * Handoff after a booked call: the rep reviews what the AE needs, picks the AE, and creates the
 * meeting plan. Never blocking: "Skip for now", Esc and the backdrop always close it, and the call
 * outcome is already logged before this opens. It never writes to the contact's lead notes.
 * Prefills are read on mount: give it a new `key` for each booking to start fresh.
 */
export default function BookingHandoffDialog({
  open,
  onClose,
  lead,
  outcome,
  meetingAt = '',
  notes = '',
  transcript,
  onCreated,
}: BookingHandoffDialogProps) {
  const { session, repName } = useSession();
  const router = useRouter();
  const toast = useToast();
  const myEmail = session.email || '';

  // Prospect basics the server needs; asked for only when the Dialer / card didn't have them.
  const [missing] = React.useState(() => ({ name: !lead.name.trim(), company: !lead.company.trim(), email: !lead.email.trim() && !lead.contactId }));
  const [name, setName] = React.useState(lead.name);
  const [company, setCompany] = React.useState(lead.company);
  const [email, setEmail] = React.useState(lead.email);
  const [when, setWhen] = React.useState(meetingAt);
  const [callNotes, setCallNotes] = React.useState(notes);
  const [website, setWebsite] = React.useState(lead.website || '');
  const [companyLinkedin, setCompanyLinkedin] = React.useState(lead.companyLinkedinUrl || '');
  const [extra, setExtra] = React.useState('');
  const [assignees, setAssignees] = React.useState<Assignee[] | null>(null);
  const [assigneeError, setAssigneeError] = React.useState('');
  const [ae, setAe] = React.useState<string>(ME);
  const [aeTouched, setAeTouched] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; field?: string } | null>(null);
  const [created, setCreated] = React.useState<MeetingPlan | null>(null);
  const openRef = React.useRef(open);
  React.useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Assignees load once per open (AEs first, then everyone else).
  React.useEffect(() => {
    if (!open || assignees) return;
    let live = true;
    void meetingPlansApi.assignees().then((r) => {
      if (!live) return;
      if (r.ok) {
        setAssignees(r.assignees);
        setAssigneeError('');
      } else {
        setAssignees([]);
        setAssigneeError(r.error);
      }
    });
    return () => {
      live = false;
    };
  }, [open, assignees]);

  const effectiveAe = aeTouched ? ae : assignees ? defaultAssignee(assignees, myEmail) : ME;
  const others = (assignees ?? []).filter((a) => !sameEmail(a.email, myEmail));
  const aes = others.filter((a) => /account executive/i.test(a.role));
  const rest = others.filter((a) => !/account executive/i.test(a.role));
  const aeName =
    effectiveAe === ME ? 'you' : (assignees ?? []).find((a) => a.email === effectiveAe)?.name || effectiveAe;

  const notesTooLong = callNotes.length > MEETING_PLAN_LIMITS.notes;
  const leadReady = !!name.trim() && !!company.trim() && (!!email.trim() || !!lead.contactId);
  const canSubmit = !busy && !notesTooLong && leadReady;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const r = await meetingPlansApi.create({
      lead: {
        ...lead,
        name: name.trim(),
        company: company.trim(),
        email: email.trim(),
        website: website.trim() || undefined,
        companyLinkedinUrl: companyLinkedin.trim() || undefined,
      },
      call: {
        outcome,
        meetingAt: when.trim() || undefined,
        notes: callNotes.trim(),
        transcript: transcript ? transcript.slice(-MEETING_PLAN_LIMITS.transcript) : undefined,
        extraContext: extra.trim() || undefined,
      },
      assignedAe: effectiveAe === ME ? undefined : effectiveAe,
    });
    setBusy(false);
    if (!r.ok) {
      setError({ message: r.error, field: r.field });
      return;
    }
    setCreated(r.plan);
    onCreated?.(r.plan);
    // Closed while saving: confirm with a toast instead.
    if (!openRef.current) {
      toast({ message: `Meeting plan started for ${lead.name || lead.company}.`, action: { label: 'View plan', onClick: () => router.push(`/meetings/${r.plan.id}`) } });
    }
  };

  // Server field names (e.g. "call.notes", "lead.website") mapped to the inputs shown here.
  const FIELD_KEYS = ['lead.name', 'lead.company', 'lead.email', 'meetingat', 'assigned', 'notes', 'website', 'linkedin', 'extra'];
  const fieldMatches = (f: string) => !!error?.field && error.field.toLowerCase().includes(f);
  const fieldError = (f: string) => (fieldMatches(f) ? error?.message : undefined);
  const visibleField = (f: string) => !f.startsWith('lead.') || missing[f.slice(5) as keyof typeof missing];
  const errorShownInline = !!error?.field && FIELD_KEYS.some((f) => fieldMatches(f) && visibleField(f));
  const who = [lead.name, lead.company].filter(Boolean).join(' · ');

  return (
    <Dialog open={open} onClose={onClose} title="Hand off to the Account Executive" size="lg" bare>
      <div className="flex flex-col" data-testid="booking-handoff-dialog">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-h2 text-fg">
              <CalendarCheck className="size-5 text-success-fg" aria-hidden />
              Meeting booked. Hand it off?
            </h2>
            <p className="mt-1 text-body text-fg-secondary">
              {who ? <span className="text-fg">{who}</span> : 'This prospect'}. The call is already logged. Create a plan and the AI
              researches the company and writes the AE&apos;s meeting plan and a one-page recap.
            </p>
          </div>
          <IconButton label="Close" size="sm" onClick={onClose} className="-mr-2">
            <X className="size-4" />
          </IconButton>
        </div>

        {created ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center" data-testid="booking-handoff-success" role="status">
            <CheckCircle2 className="size-10 text-success-fg" aria-hidden />
            <div>
              <p className="text-h3 text-fg">Meeting plan is being prepared</p>
              <p className="mt-1 max-w-md text-body text-fg-secondary">
                It takes about a minute. {effectiveAe === ME ? 'You’ll' : `${aeName} will`} find it under Meetings. Nothing is sent to the
                customer until someone reviews it and clicks Send.
              </p>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button variant="secondary" onClick={onClose} data-testid="booking-handoff-done">
                Back to work
              </Button>
              <Link
                href={`/meetings/${created.id}`}
                onClick={onClose}
                className={buttonClasses('primary')}
                data-testid="booking-handoff-view-plan"
              >
                View plan
                <ArrowRight aria-hidden />
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 px-6 py-5">
              {(missing.name || missing.company || missing.email) && (
                <div className="grid gap-4 rounded-md border border-warning-400/50 bg-warning-bg/40 p-3 sm:grid-cols-3">
                  <p className="text-small text-fg sm:col-span-3">A few prospect details are missing. Add them so the AI can research the right company.</p>
                  {missing.name && (
                    <Field label="Prospect name" htmlFor="handoff-name" error={fieldError('lead.name')}>
                      <Input id="handoff-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} data-testid="handoff-lead-name" />
                    </Field>
                  )}
                  {missing.company && (
                    <Field label="Company" htmlFor="handoff-company" error={fieldError('lead.company')}>
                      <Input id="handoff-company" value={company} maxLength={160} onChange={(e) => setCompany(e.target.value)} data-testid="handoff-lead-company" />
                    </Field>
                  )}
                  {missing.email && (
                    <Field label="Prospect email" htmlFor="handoff-email" error={fieldError('lead.email')}>
                      <Input id="handoff-email" type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} data-testid="handoff-lead-email" />
                    </Field>
                  )}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Meeting time" htmlFor="handoff-when" hint="As agreed on the call, e.g. “Thu 14 Nov, 2pm NZT”." error={fieldError('meetingat')}>
                  <Input
                    id="handoff-when"
                    value={when}
                    maxLength={MEETING_PLAN_LIMITS.shortText}
                    onChange={(e) => setWhen(e.target.value)}
                    placeholder="When is the meeting?"
                    data-testid="handoff-meeting-time"
                  />
                </Field>
                <Field
                  label="Account Executive"
                  htmlFor="handoff-ae"
                  hint={assigneeError ? 'Couldn’t load your team, so the plan will be yours.' : 'Who runs the meeting.'}
                  error={fieldError('assigned')}
                >
                  <Select
                    id="handoff-ae"
                    value={effectiveAe}
                    disabled={!assignees}
                    onChange={(e) => {
                      setAe(e.target.value);
                      setAeTouched(true);
                    }}
                    data-testid="handoff-ae-select"
                  >
                    {!assignees && <option value={effectiveAe}>Loading team…</option>}
                    {aes.length > 0 && (
                      <optgroup label="Account Executives">
                        {aes.map((a) => (
                          <option key={a.email} value={a.email}>
                            {a.name || a.email}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <option value={ME}>Me{repName ? ` (${repName})` : ''}</option>
                    {rest.length > 0 && (
                      <optgroup label="Everyone else">
                        {rest.map((a) => (
                          <option key={a.email} value={a.email}>
                            {a.name || a.email}
                            {a.role ? ` · ${a.role}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </Select>
                </Field>
              </div>

              <Field
                label="Call notes · Review before sending to the AE"
                htmlFor="handoff-notes"
                hint={
                  notesTooLong
                    ? undefined
                    : 'Pulled from your saved notes, the note you were typing and the CRM summary. Edit freely: this does not change the contact’s notes.'
                }
                error={notesTooLong ? `Please shorten to ${MEETING_PLAN_LIMITS.notes.toLocaleString()} characters (now ${callNotes.length.toLocaleString()}).` : fieldError('notes')}
              >
                <Textarea
                  id="handoff-notes"
                  value={callNotes}
                  rows={7}
                  onChange={(e) => setCallNotes(e.target.value)}
                  placeholder="What did the prospect say? Their situation, what they care about, why they agreed to meet."
                  className="resize-y text-small"
                  data-testid="handoff-notes"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Prospect website" htmlFor="handoff-website" hint="The AI reads it to research the company." error={fieldError('website')}>
                  <Input
                    id="handoff-website"
                    value={website}
                    maxLength={MEETING_PLAN_LIMITS.shortText}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="acme.com"
                    inputMode="url"
                    data-testid="handoff-website"
                  />
                </Field>
                <Field label="Company LinkedIn (optional)" htmlFor="handoff-linkedin" hint="Used only as a search hint." error={fieldError('linkedin')}>
                  <Input
                    id="handoff-linkedin"
                    value={companyLinkedin}
                    maxLength={MEETING_PLAN_LIMITS.shortText}
                    onChange={(e) => setCompanyLinkedin(e.target.value)}
                    placeholder="linkedin.com/company/acme"
                    inputMode="url"
                    data-testid="handoff-company-linkedin"
                  />
                </Field>
              </div>

              <Field label="Anything else the AE should know?" htmlFor="handoff-extra" hint="Optional: decision makers, timing, competitors, tone." error={fieldError('extra')}>
                <Textarea
                  id="handoff-extra"
                  value={extra}
                  rows={2}
                  maxLength={MEETING_PLAN_LIMITS.extraContext}
                  onChange={(e) => setExtra(e.target.value)}
                  placeholder="e.g. Their CFO joins too. They're reviewing vendors in Q1."
                  className="min-h-0 resize-y"
                  data-testid="handoff-extra"
                />
              </Field>

              {transcript && (
                <p className="flex items-center gap-1.5 text-small text-fg-tertiary">
                  <Info className="size-3.5" aria-hidden />
                  The call transcript is included so the AI can quote the prospect accurately.
                </p>
              )}

              {error && !errorShownInline && <InlineError message={error.message} onRetry={error.field ? undefined : submit} />}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-6 py-4">
              <p className="text-small text-fg-tertiary">Nothing is sent to the customer automatically.</p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose} data-testid="handoff-skip">
                  Skip for now
                </Button>
                <Button
                  variant="brand"
                  icon={<Sparkles />}
                  loading={busy}
                  disabled={!canSubmit}
                  onClick={submit}
                  title={!leadReady ? 'Add the prospect’s name, company and email first' : undefined}
                  data-testid="handoff-create-plan"
                >
                  {busy ? 'Creating…' : 'Create meeting plan'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
