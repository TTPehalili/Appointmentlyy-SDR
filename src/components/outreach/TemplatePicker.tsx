'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, FileText, Undo2 } from 'lucide-react';
import { Button, Select } from '@/components/ui';
import { cn } from '@/lib/cn';
import { fillMergeFields, matchesOutcome, rankTemplatesForOutcome, type EmailTemplate, type MergeValues } from '@/lib/emailTemplates';
import { fetchTemplates } from '@/lib/emailTemplatesClient';

export interface TemplatePickerProps {
  /** Merge-field values known here (lead, call, sender). Unknown fields stay as {{tokens}}. */
  values: MergeValues;
  /** Call outcome: matching templates are listed first under "Suggested for this call". */
  outcome?: string;
  /** What is in the editor now (kept for Undo). */
  current: { subject: string; body: string };
  /** Put a subject and body into the editor (template = null on Undo). */
  onApply: (subject: string, body: string, template: EmailTemplate | null) => void;
  /** Accessible label and visible prefix. */
  label?: string;
  className?: string;
  id?: string;
}

/**
 * "Use a template" dropdown: the templates this person may use (assigned to them or everyone,
 * plus their own), read from /api/email-templates. Read-only: picking one never writes anything.
 */
export default function TemplatePicker({ values, outcome, current, onApply, label = 'Use a template', className, id = 'template-picker' }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState<{ name: string; prev: { subject: string; body: string } } | null>(null);

  // Runs again when the screen is shown (routes stay mounted in a hidden Activity), so new assignments appear.
  useEffect(() => {
    let live = true;
    void fetchTemplates().then((r) => {
      if (!live) return;
      if (r.ok) {
        setTemplates(r.templates.filter((t) => !t.archived));
        setError('');
      } else {
        setTemplates([]);
        setError(r.error);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  const groups = useMemo(() => {
    const list = rankTemplatesForOutcome(templates ?? [], outcome);
    const suggested = outcome ? list.filter((t) => matchesOutcome(t, outcome)) : [];
    const rest = list.filter((t) => !suggested.includes(t));
    const byCampaign = new Map<string, EmailTemplate[]>();
    for (const t of rest) byCampaign.set(t.campaign, [...(byCampaign.get(t.campaign) ?? []), t]);
    const ordered = [...byCampaign.entries()]
      .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
      .map(([c, ts]) => ({ label: c || 'Other templates', items: [...ts].sort((x, y) => (x.sequenceStep ?? 99) - (y.sequenceStep ?? 99) || x.name.localeCompare(y.name)) }));
    return [...(suggested.length ? [{ label: 'Suggested for this call', items: suggested }] : []), ...ordered];
  }, [templates, outcome]);

  const pick = (templateId: string) => {
    const t = templates?.find((x) => x.id === templateId);
    if (!t) return;
    setApplied({ name: t.name, prev: { subject: current.subject, body: current.body } });
    onApply(fillMergeFields(t.subject, values), fillMergeFields(t.body, values), t);
  };

  const undo = () => {
    if (!applied) return;
    onApply(applied.prev.subject, applied.prev.body, null);
    setApplied(null);
  };

  const loading = templates === null;
  const empty = !loading && templates.length === 0;

  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}>
      <label htmlFor={id} className="flex shrink-0 items-center gap-1.5 text-small text-fg-secondary">
        <FileText className="size-3.5" aria-hidden />
        <span>{label}</span>
      </label>
      <div className="w-56 min-w-0">
        <Select
          id={id}
          value=""
          disabled={loading || empty}
          onChange={(e) => pick(e.target.value)}
          className="h-8 text-small"
          title={error || undefined}
        >
          <option value="">{loading ? 'Loading templates...' : empty ? (error ? 'Templates unavailable' : 'No templates yet') : 'Pick a template'}</option>
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.sequenceStep ? `${t.sequenceStep}. ` : ''}
                  {t.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>
      {applied ? (
        <span className="inline-flex items-center gap-1 text-small text-fg-secondary" role="status">
          <Check className="size-3.5 text-success-fg" aria-hidden />
          <span className="max-w-[12rem] truncate">Used &ldquo;{applied.name}&rdquo;</span>
          <Button variant="ghost" size="sm" icon={<Undo2 />} onClick={undo}>
            Undo
          </Button>
        </span>
      ) : (
        empty && (
          <Link href="/outreach/templates" className="text-small text-fg-tertiary underline-offset-2 hover:text-fg hover:underline">
            Open Templates
          </Link>
        )
      )}
    </div>
  );
}
