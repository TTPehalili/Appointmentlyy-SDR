'use client';

import React, { useState } from 'react';
import { Sparkles, Undo2, X } from 'lucide-react';
import { Button, IconButton, Input } from '@/components/ui';
import { INVOICE_TEXT_LIMITS, type InvoiceAiField } from '@/lib/invoiceText';

/**
 * "Rewrite with AI" for one invoice text block (Admin > Billing). Brainstorm gives 3 versions, Rewrite
 * gives 1. A version only reaches the textarea when the owner picks it, for them to review and edit;
 * nothing is saved or sent from here. Undo puts back the text from before the last pick.
 */
export default function InvoiceTextAi({
  field,
  value,
  onChange,
}: {
  field: InvoiceAiField;
  value: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState<'brainstorm' | 'rewrite' | null>(null);
  const [versions, setVersions] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [undoText, setUndoText] = useState<string | null>(null);

  const ask = async (mode: 'brainstorm' | 'rewrite') => {
    if (busy) return;
    setBusy(mode);
    setError('');
    setVersions([]);
    try {
      const res = await fetch('/api/ai/invoice-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, mode, text: value, instruction: instruction.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.versions)) {
        setError(typeof data.error === 'string' ? data.error : 'AI writing is unavailable right now. Your text was not changed.');
        return;
      }
      setVersions(data.versions.filter((v: unknown): v is string => typeof v === 'string'));
    } catch {
      setError('AI writing is unavailable right now. Your text was not changed.');
    } finally {
      setBusy(null);
    }
  };

  const pick = (v: string) => {
    setUndoText(value);
    onChange(v);
    setVersions([]);
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          icon={<Sparkles />}
          onClick={() => setOpen((o) => !o)}
          data-testid={`ai-open-${field}`}
          aria-expanded={open}
        >
          Rewrite with AI
        </Button>
        {undoText !== null && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Undo2 />}
            onClick={() => {
              onChange(undoText);
              setUndoText(null);
            }}
            data-testid={`ai-undo-${field}`}
          >
            Undo
          </Button>
        )}
      </div>

      {open && (
        <div data-testid={`ai-panel-${field}`} className="space-y-2.5 rounded-md border border-line bg-subtle p-3">
          <div className="flex items-start gap-2">
            <Input
              type="text"
              value={instruction}
              maxLength={INVOICE_TEXT_LIMITS.aiInstruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder='Optional, e.g. "shorter" or "friendlier"'
              aria-label="Instruction for AI (optional)"
              data-testid={`ai-instruction-${field}`}
              className="flex-1"
            />
            <IconButton label="Close" title="Close" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              <X />
            </IconButton>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              loading={busy === 'brainstorm'}
              disabled={!!busy}
              onClick={() => ask('brainstorm')}
              data-testid={`ai-brainstorm-${field}`}
            >
              Brainstorm 3 versions
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={busy === 'rewrite'}
              disabled={!!busy}
              onClick={() => ask('rewrite')}
              data-testid={`ai-rewrite-${field}`}
            >
              Rewrite
            </Button>
          </div>
          {error && (
            <p data-testid={`ai-error-${field}`} role="alert" className="text-small text-danger-fg">
              {error}
            </p>
          )}
          {versions.length > 0 && (
            <div className="space-y-2">
              <p className="text-caption text-fg-tertiary">Pick one to put it in the box. Review it before you send.</p>
              {versions.map((v, i) => (
                <div
                  key={i}
                  data-testid={`ai-version-${field}`}
                  className="space-y-2 rounded-md border border-line bg-surface p-2.5"
                >
                  <p className="whitespace-pre-line break-words text-small text-fg">{v}</p>
                  <Button size="sm" variant="primary" onClick={() => pick(v)} data-testid={`ai-use-${field}`}>
                    Use this
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
