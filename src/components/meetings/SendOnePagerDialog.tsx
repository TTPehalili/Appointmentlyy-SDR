'use client';

import * as React from 'react';
import { AlertTriangle, Check, CheckCircle2, Copy, Download, Paperclip, Send, Sparkles, X } from 'lucide-react';
import { Button, Field, IconButton, InlineError, Input, Textarea, Dialog } from '@/components/ui';
import ColdEmailAssistant from '@/components/email/ColdEmailAssistant';
import type { AssistantCallContext } from '@/lib/coldEmailAssistant';
import TemplatePicker from '@/components/outreach/TemplatePicker';
import MergeFieldGaps, { unfilledMergeFields } from '@/components/outreach/MergeFieldGaps';
import { recordContactTouch } from '@/lib/leadStore';
import { useSession } from '@/lib/session';
import { useDemoWorkspace } from '@/lib/useDemoWorkspace';
import type { MeetingPlan } from '@/lib/meetingPlan';
import { onePagerFileName } from '@/lib/onePagerRender';
import { formatMeetingAt, meetingPlansApi } from './meetingPlanClient';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A plain starting draft (no AI call): the rep can rewrite it with the assistant or a template. */
function starterDraft(plan: MeetingPlan, senderFirst: string): { subject: string; body: string } {
  const first = (plan.lead.name || '').trim().split(/\s+/)[0] || 'there';
  const when = formatMeetingAt(plan.call.meetingAt);
  return {
    subject: `Recap ahead of our meeting${when ? ` on ${when}` : ''}`,
    body: [
      `Hi ${first},`,
      '',
      `Thanks again for your time. I've attached a one-page recap of what we heard and the agreed next steps${when ? ` before we meet on ${when}` : ''}.`,
      '',
      "If anything in it is off, just reply and we'll adjust before the meeting.",
      '',
      'Best,',
      senderFirst,
    ].join('\n'),
  };
}

/**
 * "Email to customer": the one-pager PDF goes out attached (the server renders the saved version).
 * Never sends on its own: only the Send click does. When the workspace's email isn't connected yet
 * (409 EMAIL_NOT_CONNECTED), it offers the PDF and the email text to send from their own mailbox.
 */
export default function SendOnePagerDialog({
  open,
  onClose,
  plan,
  onSent,
  onDownloadPdf,
}: {
  open: boolean;
  onClose: () => void;
  plan: MeetingPlan;
  onSent: (plan: MeetingPlan) => void;
  onDownloadPdf: () => Promise<void> | void;
}) {
  const { session, repName, tenantName } = useSession();
  const isDemo = useDemoWorkspace();
  // Demo workspace mail goes out through the platform's verified domain; anything else is rejected.
  const ownEmail = session?.email || '';
  const senderEmail = !isDemo
    ? ownEmail || 'emil@appointmentlyy.com'
    : ownEmail.toLowerCase().endsWith('@appointmentlyy.com')
      ? ownEmail
      : 'emil@appointmentlyy.com';
  const senderFirst = (repName || '').trim().split(/\s+/)[0] || repName || '';
  const [initial] = React.useState(() => starterDraft(plan, senderFirst));
  const [to, setTo] = React.useState(plan.lead.email || '');
  const [subject, setSubject] = React.useState(initial.subject);
  const [body, setBody] = React.useState(initial.body);
  const [framework, setFramework] = React.useState('auto');
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notConnected, setNotConnected] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  const fileName = onePagerFileName(plan.lead.company);
  const when = formatMeetingAt(plan.call.meetingAt);
  const gaps = unfilledMergeFields(subject, body);
  const toValid = EMAIL_RE.test(to.trim());

  const callContext: AssistantCallContext = React.useMemo(
    () => ({
      outcome: plan.call.outcome || 'Meeting Booked',
      agreedTime: plan.call.meetingAt || '',
      notes: [
        'Email to send with the attached one-page meeting recap (PDF).',
        plan.plan?.callSummary.recap,
        plan.plan?.callSummary.agreedNextStep ? `Agreed next step: ${plan.plan.callSummary.agreedNextStep}` : '',
        plan.onePager?.whatWeHeard.length ? `What we heard: ${plan.onePager.whatWeHeard.join('; ')}` : '',
        plan.call.notes,
      ]
        .map((s) => (s || '').trim())
        .filter(Boolean)
        .join(' | ')
        .slice(0, 4000),
      transcript: plan.call.transcript,
    }),
    [plan],
  );

  const values = {
    first_name: (plan.lead.name || '').trim().split(/\s+/)[0] || '',
    company: plan.lead.company || '',
    title: plan.lead.title || '',
    sender_name: senderFirst,
    sender_company: tenantName || '',
    meeting_time: when,
  };

  const send = async () => {
    if (sending || sent || gaps.length > 0 || !toValid || !body.trim() || !subject.trim()) return;
    setSending(true);
    setError('');
    setNotConnected('');
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: to.trim(),
          from: `${repName} <${senderEmail}>`,
          subject: subject.trim(),
          body,
          prospectName: plan.lead.name,
          companyName: plan.lead.company,
          leadName: plan.lead.name,
          leadCompany: plan.lead.company,
          leadTitle: plan.lead.title,
          meetingPlanId: plan.id,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; status?: string; code?: string; error?: string; message?: string };
      if (res.status === 409 && data.code === 'EMAIL_NOT_CONNECTED') {
        setNotConnected(data.message || data.error || 'Sending is paused for this workspace until your email is connected.');
        return;
      }
      if (!res.ok || !(data.success || data.status === 'success')) {
        const raw = data.error || data.message || '';
        // Server configuration messages (e.g. a missing mail key) aren't meaningful to a rep.
        setError(
          /API_KEY|not configured|Live dispatch/i.test(raw)
            ? 'Email sending isn’t set up yet. Download the PDF and send it from your own email for now.'
            : raw || 'The email couldn’t be sent. Please try again.',
        );
        return;
      }
      setSent(true);
      // Footprint on the contact (browser store), like the Dialer's follow-up.
      try {
        const target = plan.lead.contactId || plan.lead.email;
        if (target) recordContactTouch(target, { type: 'email', title: `Email Dispatched: ${subject.trim()}`, summary: `${body}\n\n[Attached: ${fileName}]`, repName });
      } catch {
        /* the send already succeeded */
      }
      const r = await meetingPlansApi.update(plan.id, { status: 'sent' });
      if (r.ok) onSent(r.plan);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(`To: ${to}\nSubject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Couldn’t copy. Select the text and copy it instead.');
    }
  };

  const sendBlockedReason =
    !toValid ? 'Add a valid recipient email' : gaps.length > 0 ? `Fill ${gaps.map((k) => `{{${k}}}`).join(', ')} first` : !subject.trim() || !body.trim() ? 'Add a subject and message' : undefined;

  return (
    <Dialog open={open} onClose={onClose} title={`Email the recap to ${plan.lead.name || 'the customer'}`} size="xl" bare dismissible={!sending}>
      <div className="flex flex-col" data-testid="send-onepager-dialog">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-h3 text-fg">Email the recap to {plan.lead.name || 'the customer'}</h2>
            <p className="mt-0.5 text-small text-fg-secondary">Review the email, then click Send. Nothing goes out until you do.</p>
          </div>
          <IconButton label="Close" size="sm" onClick={onClose} disabled={sending}>
            <X />
          </IconButton>
        </div>

        {sent ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center" role="status" data-testid="send-onepager-success">
            <CheckCircle2 className="size-10 text-success-fg" aria-hidden />
            <p className="text-h3 text-fg">Sent to {to}</p>
            <p className="text-body text-fg-secondary">The recap PDF was attached. The plan is marked as sent.</p>
            <Button variant="primary" onClick={onClose} className="mt-2">
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-4 p-5">
              <section aria-labelledby="onepager-ai-title" className="overflow-hidden rounded-md border border-line bg-surface">
                <div className="flex items-center gap-1.5 px-4 pt-3">
                  <Sparkles className="size-4 text-fg-secondary" aria-hidden />
                  <h3 id="onepager-ai-title" className="text-body-strong text-fg">
                    Write or polish it with AI
                  </h3>
                </div>
                <ColdEmailAssistant
                  hideHeading
                  purpose="followup"
                  callContext={callContext}
                  recipient={{ name: plan.lead.name, company: plan.lead.company, title: plan.lead.title || '' }}
                  sender={{ name: repName, company: tenantName || '' }}
                  draft={{ subject, body }}
                  onApply={(s, b) => {
                    setSubject(s);
                    setBody(b);
                  }}
                  frameworkId={framework}
                  onFrameworkChange={setFramework}
                  enableLinkedInMirror={false}
                  placeholder='e.g. "a short, warm note to go with the recap" or "mention their CFO joins"'
                  logClassName="max-h-[280px]"
                />
              </section>

              <TemplatePicker
                id="onepager-template-picker"
                label="Or use a template"
                values={values}
                outcome={plan.call.outcome || ''}
                current={{ subject, body }}
                onApply={(s, b) => {
                  setSubject(s);
                  setBody(b);
                }}
              />

              <Field label="To" htmlFor="onepager-to" error={to && !toValid ? 'That email doesn’t look right.' : undefined}>
                <Input id="onepager-to" type="email" mono value={to} onChange={(e) => setTo(e.target.value)} data-testid="send-onepager-to" />
              </Field>
              <Field label="Subject" htmlFor="onepager-subject">
                <Input id="onepager-subject" value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="send-onepager-subject" />
              </Field>
              <Field label="Message" htmlFor="onepager-body">
                <Textarea id="onepager-body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} className="resize-y" data-testid="send-onepager-body" />
              </Field>

              <MergeFieldGaps
                subject={subject}
                body={body}
                values={values}
                onFill={(s, b) => {
                  setSubject(s);
                  setBody(b);
                }}
              />

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-line bg-subtle px-2.5 text-small text-fg"
                  data-testid="send-onepager-attachment"
                >
                  <Paperclip className="size-3.5 shrink-0 text-fg-tertiary" aria-hidden />
                  <span className="truncate">Attached: {fileName}</span>
                </span>
                <Button variant="ghost" size="sm" icon={<Download />} onClick={() => void onDownloadPdf()}>
                  Preview PDF
                </Button>
              </div>

              {notConnected && (
                <div role="alert" className="flex flex-col gap-3 rounded-md border border-warning-400/60 bg-warning-bg p-4" data-testid="send-onepager-not-connected">
                  <p className="flex items-start gap-2 text-body text-warning-fg">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      {notConnected} For now, download the PDF and send this email from your own inbox.
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" icon={<Download />} onClick={() => void onDownloadPdf()} data-testid="send-onepager-fallback-download">
                      Download PDF
                    </Button>
                    <Button variant="secondary" size="sm" icon={copied ? <Check /> : <Copy />} onClick={copyEmail} data-testid="send-onepager-copy-email">
                      {copied ? 'Copied' : 'Copy email text'}
                    </Button>
                  </div>
                </div>
              )}
              {error && <InlineError message={error} />}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
              <Button variant="secondary" onClick={onClose} disabled={sending}>
                Cancel
              </Button>
              <Button
                variant="primary"
                icon={<Send />}
                loading={sending}
                disabled={!!sendBlockedReason}
                title={sendBlockedReason}
                onClick={send}
                data-testid="send-onepager-send"
              >
                {sending ? 'Sending…' : 'Send with recap'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
