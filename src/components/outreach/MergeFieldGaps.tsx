'use client';

import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';
import { MERGE_FIELDS, fillMergeFields, mergeFieldsIn, type MergeValues } from '@/lib/emailTemplates';

/** Merge fields still in the text (e.g. {{meeting_time}}). Send stays blocked while any remain. */
export function unfilledMergeFields(subject: string, body: string): string[] {
  return mergeFieldsIn(`${subject}\n${body}`);
}

const labelOf = (key: string) => MERGE_FIELDS.find((f) => f.key === key)?.label ?? key.replace(/_/g, ' ');

/**
 * Highlights every {{field}} a template left unfilled and lets the rep fill them in one go.
 * Inputs start from what is known now (e.g. a company typed after the template was picked).
 */
export default function MergeFieldGaps({
  subject,
  body,
  values,
  onFill,
  className,
}: {
  subject: string;
  body: string;
  values: MergeValues;
  onFill: (subject: string, body: string) => void;
  className?: string;
}) {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const gaps = unfilledMergeFields(subject, body);
  if (gaps.length === 0) return null;

  const valueOf = (k: string) => inputs[k] ?? values[k] ?? '';
  const ready = gaps.filter((k) => valueOf(k).trim());
  const fill = () => {
    const v = Object.fromEntries(ready.map((k) => [k, valueOf(k).trim()]));
    onFill(fillMergeFields(subject, v), fillMergeFields(body, v));
    setInputs({});
  };

  return (
    <div role="alert" className={`space-y-2 rounded-md border border-warning-fg/40 bg-warning-bg px-3 py-2.5 ${className ?? ''}`}>
      <p className="flex items-start gap-1.5 text-small text-warning-fg">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Fill {gaps.length === 1 ? 'this field' : `these ${gaps.length} fields`} before sending:{' '}
          {gaps.map((k) => (
            <mark key={k} className="mr-1 rounded-sm bg-warning-fg/15 px-1 font-mono text-caption text-warning-fg">
              {`{{${k}}}`}
            </mark>
          ))}
        </span>
      </p>
      <div className="flex flex-wrap items-end gap-2">
        {gaps.map((k) => (
          <label key={k} className="flex min-w-[10rem] flex-1 flex-col gap-1">
            <span className="text-caption text-fg-secondary">{labelOf(k)}</span>
            <input
              value={valueOf(k)}
              onChange={(e) => setInputs((m) => ({ ...m, [k]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (ready.length) fill();
                }
              }}
              placeholder={k === 'meeting_time' ? 'e.g. Thursday at 2pm' : k === 'callback_time' ? 'e.g. Friday at 10am' : labelOf(k)}
              aria-label={`Value for ${labelOf(k)}`}
              className="focus-ring h-8 rounded-sm border border-line-strong bg-surface px-2.5 text-small text-fg placeholder:text-fg-tertiary"
            />
          </label>
        ))}
        <Button variant="secondary" size="sm" onClick={fill} disabled={ready.length === 0}>
          Fill in
        </Button>
      </div>
    </div>
  );
}
