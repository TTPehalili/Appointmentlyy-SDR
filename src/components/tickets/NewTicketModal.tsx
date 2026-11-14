'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  LifeBuoy, 
  Loader2, 
  Sparkles, 
  Mail, 
  Building2, 
  User, 
  Compass, 
  ShieldAlert,
  ArrowRight,
  ChevronDown
} from 'lucide-react';
import { useSession } from '@/lib/session';
import { Button, IconButton, Dialog } from '@/components/ui';
import { TICKET_CATEGORIES, TicketCategory, TicketPriority, TroubleTicket } from '@/lib/ticketTypes';

interface NewTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTicketCreated: (ticket: TroubleTicket) => void;
  initialCategory?: TicketCategory;
}

export default function NewTicketModal({
  isOpen,
  onClose,
  onTicketCreated,
  initialCategory = 'bug_general'
}: NewTicketModalProps) {
  const { session, tenantName, repName, email, tenantCode } = useSession();

  const [requesterName, setRequesterName] = useState(repName || 'Customer User');
  const [requesterEmail, setRequesterEmail] = useState(email || '');
  const [tenant, setTenant] = useState(tenantName || 'Appointmentlyy Workspace');
  const [category, setCategory] = useState<TicketCategory>(initialCategory);
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [affectedUrl, setAffectedUrl] = useState('');
  const [sendEmailConfirmation, setSendEmailConfirmation] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdTicket, setCreatedTicket] = useState<TroubleTicket | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRequesterName(repName || 'Customer User');
      setRequesterEmail(email || 'customer@company.com');
      setTenant(tenantName || 'Appointmentlyy Workspace');
      setError(null);
      setCreatedTicket(null);
      if (typeof window !== 'undefined') {
        setAffectedUrl(window.location.pathname);
      }
    }
  }, [isOpen, repName, email, tenantName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) {
      setError('Please provide a subject line for your trouble ticket.');
      return;
    }
    if (!description.trim()) {
      setError('Please describe what issue or friction you experienced.');
      return;
    }
    if (!requesterEmail.trim() || !requesterEmail.includes('@')) {
      setError('A valid email address is required so we can notify you.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const systemInfo = typeof window !== 'undefined' ? {
      browser: navigator.userAgent.slice(0, 120),
      os: navigator.platform || 'Unknown OS',
      screenResolution: `${window.innerWidth}x${window.innerHeight}`,
    } : undefined;

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantName: tenant,
          tenantCode: tenantCode,
          requesterName,
          requesterEmail,
          subject,
          description,
          category,
          priority,
          affectedUrl,
          systemInfo,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit trouble ticket');
      }

      setCreatedTicket(data.ticket);
      onTicketCreated(data.ticket);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'focus-ring w-full h-9 rounded-sm border border-line-strong bg-surface text-body text-fg focus:outline-none placeholder:text-fg-disabled';
  const labelClass = 'mb-1.5 flex items-center gap-1.5 text-small font-medium text-fg';

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="New ticket"
      size="lg"
      className="overflow-hidden"
      dismissible={!submitting}
      bare
    >
      <div className="w-full overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)]">
        {/* Header */}
        <div className="px-6 py-4 flex items-start justify-between gap-4 shrink-0 border-b border-line">
          <div>
            <h3 id="new-ticket-title" className="text-h2 text-fg">New ticket</h3>
            <p className="text-body text-fg-secondary mt-0.5">
              Goes straight to Emil Halili and the engineering team.
            </p>
          </div>
          <IconButton label="Close" onClick={onClose} size="sm">
            <X />
          </IconButton>
        </div>

        {/* Content Area */}
        {createdTicket ? (
          // Success State
          <div className="p-8 text-center flex flex-col items-center justify-center space-y-4">
            <div className="size-12 rounded-full bg-success-bg text-success-fg flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6" aria-hidden />
            </div>
            <div className="space-y-2">
              <span className="inline-block px-2 py-0.5 rounded-sm text-caption font-mono bg-subtle text-fg border border-line">
                {createdTicket.id}
              </span>
              <h4 className="text-h2 text-fg">Ticket logged and assigned</h4>
              <p className="text-body text-fg-secondary max-w-md mx-auto">
                We have received your ticket regarding <strong className="font-medium text-fg">&ldquo;{createdTicket.subject}&rdquo;</strong>.
              </p>
            </div>

            <ul className="w-full max-w-md rounded-lg border border-line divide-y divide-line text-left text-body text-fg-secondary">
              <li className="flex items-center gap-2.5 px-4 py-2.5">
                <Mail className="h-4 w-4 text-fg-tertiary shrink-0" aria-hidden />
                <span>Confirmation email sent to <strong className="font-medium text-fg">{createdTicket.requesterEmail}</strong></span>
              </li>
              <li className="flex items-center gap-2.5 px-4 py-2.5">
                <ShieldAlert className="h-4 w-4 text-fg-tertiary shrink-0" aria-hidden />
                <span>Alert sent to <strong className="font-medium text-fg">Emil Halili (CEO/Founder)</strong></span>
              </li>
              <li className="flex items-center gap-2.5 px-4 py-2.5">
                <Sparkles className="h-4 w-4 text-fg-tertiary shrink-0" aria-hidden />
                <span>Status is <strong className="font-medium text-fg">In progress</strong>. Updates will appear in your dashboard.</span>
              </li>
            </ul>

            <div className="pt-2 flex items-center gap-3">
              <Button variant="primary" onClick={onClose}>
                View ticket
                <ArrowRight aria-hidden />
              </Button>
            </div>
          </div>
        ) : (
          // Form State
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-body">
            {error && (
              <div role="alert" className="px-4 py-3 rounded-md bg-danger-bg border border-danger-fg/30 text-danger-fg flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                <div>
                  <div className="font-medium">Couldn&apos;t submit</div>
                  <div className="text-small mt-0.5">{error}</div>
                </div>
              </div>
            )}

            {/* Tenant and Submitter Metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>
                  <Building2 className="h-3.5 w-3.5 text-fg-tertiary" aria-hidden />
                  <span>Workspace or company</span>
                </label>
                <input
                  type="text"
                  value={tenant}
                  onChange={(e) => setTenant(e.target.value)}
                  required
                  className={`${inputClass} px-3`}
                />
              </div>

              <div>
                <label className={labelClass}>
                  <User className="h-3.5 w-3.5 text-fg-tertiary" aria-hidden />
                  <span>Your name</span>
                </label>
                <input
                  type="text"
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                  required
                  className={`${inputClass} px-3`}
                />
              </div>

              <div>
                <label className={labelClass}>
                  <Mail className="h-3.5 w-3.5 text-fg-tertiary" aria-hidden />
                  <span>Email for updates</span>
                </label>
                <input
                  type="email"
                  value={requesterEmail}
                  onChange={(e) => setRequesterEmail(e.target.value)}
                  required
                  placeholder="your.email@company.com"
                  className={`${inputClass} px-3`}
                />
              </div>
            </div>

            {/* Category and Priority */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  Category
                </label>
                <div className="relative">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as TicketCategory)}
                    className={`${inputClass} appearance-none pl-3 pr-9`}
                  >
                    {TICKET_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-tertiary" aria-hidden />
                </div>
                <p className="text-small text-fg-tertiary mt-1.5">
                  {TICKET_CATEGORIES.find(c => c.value === category)?.description}
                </p>
              </div>

              <div>
                <label className={labelClass}>
                  Priority
                </label>
                <div className="grid grid-cols-4 gap-0.5 rounded-md border border-line bg-subtle p-0.5">
                  {(['low', 'medium', 'high', 'urgent'] as TicketPriority[]).map((p) => {
                    const isSelected = priority === p;
                    return (
                      <button
                        type="button"
                        key={p}
                        onClick={() => setPriority(p)}
                        aria-pressed={isSelected}
                        className={`focus-ring h-8 px-2 rounded-[6px] text-small font-medium capitalize transition-colors duration-150 text-center ${
                          isSelected ? 'bg-selected text-selected-fg shadow-xs' : 'text-fg-secondary hover:bg-surface hover:text-fg'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
                <p className="text-small text-fg-tertiary mt-1.5 flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={`size-2 shrink-0 rounded-full ${
                      priority === 'urgent' ? 'bg-danger-fg' : priority === 'high' ? 'bg-warning-400' : priority === 'medium' ? 'bg-fg-tertiary' : 'bg-fg-disabled'
                    }`}
                  />
                  <span>
                    {priority === 'urgent' && 'Critical: engineering and Emil Halili are notified right away.'}
                    {priority === 'high' && 'Major impact: answered within 30 minutes.'}
                    {priority === 'medium' && 'Standard: reviewed during business hours.'}
                    {priority === 'low' && 'Minor question or workflow suggestion.'}
                  </span>
                </p>
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className={labelClass}>
                Subject <span className="text-danger-fg">*</span>
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Telephony latency spike when calling Australian numbers"
                required
                className={`${inputClass} px-3`}
              />
            </div>

            {/* Description */}
            <div>
              <label className={labelClass}>
                What happened? <span className="text-danger-fg">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                required
                placeholder="What occurred? What steps lead up to the issue? Include any specific error codes or callers affected..."
                className="focus-ring w-full px-3 py-2 rounded-sm border border-line-strong bg-surface text-body text-fg focus:outline-none placeholder:text-fg-disabled resize-none"
              />
            </div>

            {/* Affected URL / Page */}
            <div>
              <label className={labelClass}>
                <Compass className="h-3.5 w-3.5 text-fg-tertiary" aria-hidden />
                <span>Affected page <span className="font-normal text-fg-tertiary">(optional)</span></span>
              </label>
              <input
                type="text"
                value={affectedUrl}
                onChange={(e) => setAffectedUrl(e.target.value)}
                placeholder="/cockpit, /email, /admin/frameworks..."
                className={`${inputClass} px-3 font-mono`}
              />
            </div>

            {/* Email Checkbox */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sendEmailConfirmation}
                  onChange={(e) => setSendEmailConfirmation(e.target.checked)}
                  className="focus-ring size-4 rounded-sm border-line-strong accent-ink-900"
                />
                <span className="text-small text-fg-secondary">
                  Email me a receipt and tracking link at <strong className="font-medium text-fg">{requesterEmail || 'my email'}</strong>
                </span>
              </label>
            </div>

            {/* Footer Buttons */}
            <div className="pt-4 border-t border-line flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>

              <Button
                type="submit"
                variant="brand"
                disabled={submitting}
                loading={submitting}
                icon={submitting ? undefined : <Send />}
              >
                {submitting ? 'Submitting...' : 'Submit ticket'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
