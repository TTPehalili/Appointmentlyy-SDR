'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Megaphone } from 'lucide-react';
import { Button, Input, buttonClasses } from '@/components/ui';
import { cn } from '@/lib/cn';
import { isCampaignEmpty, saveCampaignMessage, useCampaignMessage, type CampaignMessage } from '@/lib/campaignMessage';

const FIELDS: { key: 'angle' | 'pain' | 'proof' | 'offer'; label: string; placeholder: string }[] = [
  { key: 'angle', label: 'Angle', placeholder: 'e.g. New reps call-ready in 72 hours' },
  { key: 'pain', label: 'Core pain', placeholder: 'e.g. New hires learn on live leads for weeks' },
  { key: 'proof', label: 'Proof point(s)', placeholder: 'Only facts you can back up. Leave empty if none.' },
  { key: 'offer', label: 'Offer / CTA', placeholder: 'e.g. Open to a 2-minute video?' },
];

/**
 * The shared campaign message, shown in both Outreach tabs so the cold email and the LinkedIn
 * post tell one story. Editable; "Use for ..." hands it to the current tool or the other tab.
 */
export default function CampaignMessageCard({
  current,
  onUse,
}: {
  current: 'email' | 'linkedin';
  onUse: (campaign: CampaignMessage) => void;
}) {
  const campaign = useCampaignMessage();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => ({ angle: '', pain: '', proof: '', offer: '' }));
  const empty = isCampaignEmpty(campaign);

  const startEdit = () => {
    setForm({ angle: campaign.angle, pain: campaign.pain, proof: campaign.proof, offer: campaign.offer });
    setOpen(true);
  };

  const save = () => {
    saveCampaignMessage({
      angle: form.angle.trim(),
      pain: form.pain.trim(),
      proof: form.proof.trim(),
      offer: form.offer.trim(),
    });
    setOpen(false);
  };

  const summary = empty
    ? 'Not set yet. Add one so your cold emails and LinkedIn posts tell the same story.'
    : [campaign.angle, campaign.pain && `Pain: ${campaign.pain}`, campaign.offer && `Offer: ${campaign.offer}`].filter(Boolean).join(' · ');

  const otherHref = current === 'email' ? '/outreach/linkedin?campaign=1' : '/outreach/email?campaign=1';

  return (
    <section aria-labelledby="campaign-message-title" className="rounded-lg border border-line bg-surface shadow-xs">
      <div className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <Megaphone className="mt-0.5 size-4 shrink-0 text-fg-secondary" aria-hidden />
          <div className="min-w-0">
            <h2 id="campaign-message-title" className="text-body-strong text-fg">Campaign message</h2>
            <p className={cn('line-clamp-2 text-small', empty ? 'text-fg-tertiary' : 'text-fg-secondary')}>{summary}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={open ? () => setOpen(false) : startEdit} aria-expanded={open}>
            <span>{open ? 'Close' : empty ? 'Set it' : 'Edit'}</span>
            {open ? <ChevronUp /> : <ChevronDown />}
          </Button>
          {current === 'email' ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => onUse(campaign)} disabled={empty}>
                Use for email
              </Button>
              <Link href={otherHref} className={cn(buttonClasses('secondary', 'sm'), empty && 'pointer-events-none opacity-50')} aria-disabled={empty}>
                Use for LinkedIn
              </Link>
            </>
          ) : (
            <>
              <Link href={otherHref} className={cn(buttonClasses('secondary', 'sm'), empty && 'pointer-events-none opacity-50')} aria-disabled={empty}>
                Use for email
              </Link>
              <Button variant="secondary" size="sm" onClick={() => onUse(campaign)} disabled={empty}>
                Use for LinkedIn
              </Button>
            </>
          )}
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t border-line px-4 py-4">
          <p className="text-small text-fg-tertiary">
            Shared by Cold email and LinkedIn, so a prospect who sees both hears one consistent story. The AI keeps the same terms and only uses numbers you put here.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="block space-y-1.5">
                <span className="block text-small font-medium text-fg">{f.label}</span>
                <Input
                  value={form[f.key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  maxLength={300}
                />
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={save}>
              Save campaign message
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
