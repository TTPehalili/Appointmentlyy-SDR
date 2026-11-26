'use client';

/**
 * Custom proposal: "From my PDF" import and the section editor with a live branded preview.
 *
 * - Import: the owner picks a PDF (10 MB, 30 pages); the server reads it in memory, has the AI map it
 *   into the document and streams its progress. Nothing is stored until the owner saves the draft.
 *   On failure: a clear message, plus "Use the plain text" (no AI) and "Start from an empty document".
 * - Editor: cover fields, sections (add, delete, reorder), blocks (paragraph, lists, table, callout),
 *   one pricing section (rows with live totals) and one terms section. Items marked "Check" (the AI was
 *   unsure, or the value is not in the PDF) are listed at the top and must be cleared before sending.
 * - Preview: the real PDF from the server (/api/agreements/preview), redrawn a moment after each edit.
 *
 * Everything is plain text: React escapes it on screen and the PDF never turns it into links.
 */
import * as React from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Columns3,
  FileText,
  FileUp,
  List,
  ListOrdered,
  Loader2,
  MessageSquareQuote,
  Pilcrow,
  Plus,
  Receipt,
  Rows3,
  Scale,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { Badge, Button, Card, ConfirmDialog, Field, InlineError, Input, Meter, Switch, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import { PdfViewer } from '@/components/agreements/PdfViewer';
import { fetchPdf } from '@/components/agreements/ownerShared';
import {
  CLIENT_KEY,
  CUSTOM_PROPOSAL_ID,
  DOC_KEY,
  PROPOSAL_LIMITS,
  docProblem,
  emptyBlock,
  emptyDoc,
  emptyRow,
  emptySection,
  money2,
  normalizeDoc,
  openChecks,
  pricingTotals,
  rowTotal,
  serializeDoc,
  type Block,
  type BlockType,
  type CoverKey,
  type PriceRow,
  type ProposalDoc,
  type Section,
} from '@/lib/agreements/customProposal';

export { CUSTOM_PROPOSAL_ID, DOC_KEY };

/** The envelope values for a document. */
export const valuesOfDoc = (doc: ProposalDoc): Record<string, string> => ({ [DOC_KEY]: serializeDoc(doc), [CLIENT_KEY]: doc.cover.clientCompany });

// ------------------------------------------------------------------ import

type ImportOk = { ok: true; doc: ProposalDoc; pages: number; scannedPages: number[]; vision: boolean; notes: string[]; checks: number };
type ImportFail = { ok: false; code: string; message: string; pages: number; scannedPages: number[]; fallback: ProposalDoc | null };
type Progress = { stage: string; message: string; done?: number; total?: number };

const MB = PROPOSAL_LIMITS.uploadBytes / 1024 / 1024;

/** Upload a PDF and read the streamed progress lines until the result. */
async function runImport(file: File, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<ImportOk | ImportFail> {
  const res = await fetch('/api/agreements/proposal-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(file.name.slice(0, 180)) },
    body: file,
    cache: 'no-store',
    signal,
  });
  if (!res.ok || !res.body) {
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, code: 'rejected', message: d.error || 'The upload was not accepted.', pages: 0, scannedPages: [], fallback: null };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let result: ImportOk | ImportFail | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const o = JSON.parse(line) as { type?: string } & Record<string, unknown>;
        if (o.type === 'progress') onProgress(o as unknown as Progress);
        else if (o.type === 'result') result = o as unknown as ImportOk | ImportFail;
      } catch {
        /* ignore a partial line */
      }
    }
    if (done) break;
  }
  if (!result) return { ok: false, code: 'ai_failed', message: 'The import stopped before it finished. Try again, or start from an empty document.', pages: 0, scannedPages: [], fallback: null };
  if (result.ok) result = { ...result, doc: normalizeDoc(result.doc).doc };
  else if (result.fallback) result = { ...result, fallback: normalizeDoc(result.fallback).doc };
  return result;
}

/** Step "From my PDF": pick a file, watch the progress, then hand the document to the editor. */
export function ProposalImport({ onDone, onCancel }: { onDone: (doc: ProposalDoc, notes: string[]) => void; onCancel: () => void }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [steps, setSteps] = React.useState<Progress[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState<ImportFail | null>(null);
  const abort = React.useRef<AbortController | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Hidden in an <Activity> when the owner leaves the page: stop a running upload (it is not stored anyway).
  React.useEffect(() => () => abort.current?.abort(), []);

  const pick = (f: File | null) => {
    setFailed(null);
    setSteps([]);
    if (!f) return setFile(null);
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') {
      setFile(null);
      return setProblem('Choose a PDF file.');
    }
    if (f.size > PROPOSAL_LIMITS.uploadBytes) {
      setFile(null);
      return setProblem(`This file is ${(f.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MB} MB.`);
    }
    setProblem(null);
    setFile(f);
  };

  const start = async () => {
    if (!file) return;
    setBusy(true);
    setFailed(null);
    setSteps([{ stage: 'upload', message: `Uploading ${file.name}` }]);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const r = await runImport(file, (p) => setSteps((s) => (p.stage === 'ai' && s[s.length - 1]?.stage === 'ai' ? [...s.slice(0, -1), p] : [...s, p])), ctl.signal);
      if (r.ok) onDone(r.doc, [...r.notes, ...(r.checks ? [`${r.checks} ${r.checks === 1 ? 'item is' : 'items are'} marked “Check”: review ${r.checks === 1 ? 'it' : 'them'} before sending.`] : [])]);
      else setFailed(r);
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') setFailed({ ok: false, code: 'network', message: 'The upload did not finish (connection lost). Try again, or start from an empty document.', pages: 0, scannedPages: [], fallback: null });
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const last = steps[steps.length - 1];
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5" data-testid="proposal-import">
      <div>
        <h2 className="text-h2 text-fg">From my PDF</h2>
        <p className="mt-1 text-body text-fg-secondary">
          Upload your proposal. AI copies its text and tables into Appointmentlyy branding, keeping your wording. You review and edit every section before anything is sent. Images and charts are not carried over.
        </p>
      </div>
      <label
        htmlFor="proposal-pdf"
        className={cn('focus-within:ring-2 focus-within:ring-selected flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line-strong bg-subtle px-4 py-8 text-center', busy && 'pointer-events-none opacity-60')}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files?.[0] ?? null);
        }}
      >
        <FileUp className="size-6 text-fg-secondary" aria-hidden />
        <span className="text-body-strong text-fg">{file ? file.name : 'Choose a PDF or drop it here'}</span>
        <span className="text-small text-fg-tertiary">
          PDF only, up to {MB} MB and {PROPOSAL_LIMITS.uploadPages} pages. {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : ''}
        </span>
        <input ref={inputRef} id="proposal-pdf" type="file" accept="application/pdf,.pdf" className="sr-only" data-testid="proposal-file" onChange={(e) => pick(e.target.files?.[0] ?? null)} disabled={busy} />
      </label>
      {problem && <InlineError message={problem} />}

      {steps.length > 0 && (
        <Card className="flex flex-col gap-3 p-4" aria-live="polite" data-testid="import-progress">
          <ol className="flex flex-col gap-2">
            {steps.map((s, i) => {
              const current = busy && i === steps.length - 1;
              return (
                <li key={i} className="flex items-start gap-2 text-body text-fg">
                  {current ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-fg-secondary" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-fg" aria-hidden />}
                  <span>{s.message}</span>
                </li>
              );
            })}
          </ol>
          {busy && last?.stage === 'ai' && last.total ? <Meter value={(last.done ?? 0) / last.total} label="AI progress" /> : null}
          {busy && <p className="text-small text-fg-tertiary">This can take a minute or two for a long proposal. Keep this page open.</p>}
        </Card>
      )}

      {failed && (
        <Card className="flex flex-col gap-3 border-warning-400/50 p-4" role="alert" data-testid="import-failed">
          <p className="flex items-start gap-2 text-body text-fg">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-fg" aria-hidden />
            <span data-testid="import-message">{failed.message}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {failed.fallback && (
              <Button variant="secondary" icon={<FileText />} onClick={() => onDone(failed.fallback!, ['Imported without AI: headings and lists were guessed from the text layout, and prices are plain text. Check each section.'])} data-testid="import-plain">
                Use the plain text
              </Button>
            )}
            <Button variant="secondary" onClick={() => onDone(emptyDoc(), [])} data-testid="import-blank">
              Start from an empty document
            </Button>
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => (busy ? abort.current?.abort() : onCancel())}>
          {busy ? 'Stop' : 'Back'}
        </Button>
        <Button variant="primary" icon={<FileUp />} onClick={start} disabled={!file || busy} loading={busy} data-testid="import-start">
          Import
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ editor

type Patch<T> = (f: (x: T) => T) => void;

const BLOCK_TYPES: { type: BlockType; label: string; icon: React.ReactNode }[] = [
  { type: 'paragraph', label: 'Paragraph', icon: <Pilcrow /> },
  { type: 'bullets', label: 'Bullet list', icon: <List /> },
  { type: 'numbered', label: 'Numbered list', icon: <ListOrdered /> },
  { type: 'table', label: 'Table', icon: <Table2 /> },
  { type: 'callout', label: 'Callout', icon: <MessageSquareQuote /> },
];
const BLOCK_LABEL: Record<BlockType, string> = { paragraph: 'Paragraph', bullets: 'Bullet list', numbered: 'Numbered list', table: 'Table', callout: 'Callout' };

const move = <T,>(list: T[], i: number, d: number): T[] => {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};

function CheckNote({ note, onClear, testId }: { note?: string; onClear: () => void; testId?: string }) {
  if (!note) return null;
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-warning-bg px-3 py-2 text-small text-warning-fg" data-testid={testId ?? 'check-note'}>
      <span className="flex min-w-0 items-start gap-1.5">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 break-words">
          <span className="font-semibold">Check:</span> {note}
        </span>
      </span>
      <button type="button" onClick={onClear} className="focus-ring shrink-0 rounded-sm font-medium underline underline-offset-2" data-testid="check-clear">
        Mark as checked
      </button>
    </div>
  );
}

function MiniButton({ label, onClick, disabled, children, testId }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="focus-ring inline-flex size-8 items-center justify-center rounded-md text-fg-secondary hover:bg-subtle hover:text-fg disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

function ListEditor({ b, set, idp }: { b: Block; set: Patch<Block>; idp: string }) {
  return (
    <Field label={`${BLOCK_LABEL[b.type]} (one item per line)`} htmlFor={`${idp}-items`}>
      <Textarea
        id={`${idp}-items`}
        rows={Math.min(12, Math.max(3, b.items.length + 1))}
        value={b.items.join('\n')}
        onChange={(e) => set((x) => ({ ...x, items: e.target.value.split('\n').slice(0, PROPOSAL_LIMITS.items) }))}
        data-testid="block-items"
      />
    </Field>
  );
}

function TableEditor({ b, set, idp }: { b: Block; set: Patch<Block>; idp: string }) {
  const cols = b.header.length;
  const setCell = (r: number, c: number, v: string) => set((x) => ({ ...x, rows: x.rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? v : cell)) : row)) }));
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-separate border-spacing-1" data-testid="table-editor">
          <thead>
            <tr>
              {b.header.map((h, c) => (
                <th key={c} className="p-0 text-left">
                  <Input
                    aria-label={`Header ${c + 1}`}
                    value={h}
                    onChange={(e) => set((x) => ({ ...x, header: x.header.map((hh, i) => (i === c ? e.target.value : hh)) }))}
                    className="h-8 font-semibold"
                    maxLength={PROPOSAL_LIMITS.cell}
                  />
                </th>
              ))}
              <th className="w-8 p-0" aria-label="Row actions" />
            </tr>
          </thead>
          <tbody>
            {b.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className="p-0 align-top">
                    <Input aria-label={`Row ${r + 1}, column ${c + 1}`} value={cell} onChange={(e) => setCell(r, c, e.target.value)} className="h-8" maxLength={PROPOSAL_LIMITS.cell} data-testid={`cell-${r}-${c}`} />
                  </td>
                ))}
                <td className="p-0 align-top">
                  <MiniButton label={`Delete row ${r + 1}`} onClick={() => set((x) => ({ ...x, rows: x.rows.length > 1 ? x.rows.filter((_, i) => i !== r) : x.rows }))} disabled={b.rows.length <= 1}>
                    <X />
                  </MiniButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2" id={`${idp}-table-actions`}>
        <Button size="sm" variant="ghost" icon={<Rows3 />} onClick={() => set((x) => ({ ...x, rows: [...x.rows, Array.from({ length: cols }, () => '')].slice(0, PROPOSAL_LIMITS.tableRows) }))}>
          Add row
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Columns3 />}
          disabled={cols >= PROPOSAL_LIMITS.tableCols}
          onClick={() => set((x) => ({ ...x, header: [...x.header, `Column ${cols + 1}`], rows: x.rows.map((row) => [...row, '']) }))}
        >
          Add column
        </Button>
        <Button size="sm" variant="ghost" icon={<X />} disabled={cols <= 1} onClick={() => set((x) => ({ ...x, header: x.header.slice(0, -1), rows: x.rows.map((row) => row.slice(0, -1)) }))}>
          Remove last column
        </Button>
      </div>
    </div>
  );
}

function BlockEditor({ b, i, count, set, remove, moveBy, idp }: { b: Block; i: number; count: number; set: Patch<Block>; remove: () => void; moveBy: (d: number) => void; idp: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line p-3" data-testid="block" data-block-type={b.type}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption font-semibold uppercase tracking-wide text-fg-tertiary">{BLOCK_LABEL[b.type]}</span>
        <div className="flex items-center">
          <MiniButton label="Move block up" onClick={() => moveBy(-1)} disabled={i === 0}>
            <ArrowUp />
          </MiniButton>
          <MiniButton label="Move block down" onClick={() => moveBy(1)} disabled={i === count - 1}>
            <ArrowDown />
          </MiniButton>
          <MiniButton label="Delete block" onClick={remove} testId="block-delete">
            <Trash2 />
          </MiniButton>
        </div>
      </div>
      <CheckNote note={b.check} onClear={() => set((x) => ({ ...x, check: undefined }))} />
      {b.type === 'paragraph' || b.type === 'callout' ? (
        <Textarea
          aria-label={BLOCK_LABEL[b.type]}
          rows={Math.min(14, Math.max(3, Math.ceil(b.text.length / 90)))}
          value={b.text}
          maxLength={PROPOSAL_LIMITS.text}
          onChange={(e) => set((x) => ({ ...x, text: e.target.value }))}
          data-testid="block-text"
        />
      ) : b.type === 'table' ? (
        <TableEditor b={b} set={set} idp={idp} />
      ) : (
        <ListEditor b={b} set={set} idp={idp} />
      )}
    </div>
  );
}

function PricingEditor({ s, set }: { s: Section; set: Patch<Section> }) {
  const { totals, unpriced } = pricingTotals(s);
  const setRow = (id: string, f: (r: PriceRow) => PriceRow) => set((x) => ({ ...x, rows: x.rows.map((r) => (r.id === id ? f(r) : r)) }));
  return (
    <div className="flex flex-col gap-3" data-testid="pricing-editor">
      <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-end">
        <Field label="Currency" htmlFor={`${s.id}-cur`} hint="3-letter code, e.g. USD, PHP, NZD.">
          <Input id={`${s.id}-cur`} value={s.currency} maxLength={3} onChange={(e) => set((x) => ({ ...x, currency: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) }))} data-testid="pricing-currency" />
        </Field>
        <div className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
          <span className="text-body text-fg">Show the total</span>
          <Switch checked={s.showTotal} onCheckedChange={(v) => set((x) => ({ ...x, showTotal: v }))} label="Show the total" />
        </div>
      </div>
      <ul className="flex flex-col gap-2" data-testid="price-rows" aria-label="Price rows">
        {s.rows.map((r, i) => {
          const t = rowTotal(r);
          const upper = (v: string) => v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
          return (
            <li key={r.id} className="flex flex-col gap-2 rounded-md border border-line p-2" data-testid="price-row">
              {/* Item, then its description, then the numbers (a stable layout from 390 px up). */}
              <div className="flex items-end gap-2">
                <label className="flex min-w-0 grow flex-col gap-1 text-caption text-fg-tertiary">
                  Item
                  <Input aria-label={`Item, row ${i + 1}`} value={r.item} maxLength={PROPOSAL_LIMITS.short} onChange={(e) => setRow(r.id, (x) => ({ ...x, item: e.target.value }))} className="h-8" data-testid="row-item" />
                </label>
                <MiniButton label={`Delete price row ${i + 1}`} onClick={() => set((x) => ({ ...x, rows: x.rows.filter((y) => y.id !== r.id) }))} testId="row-delete">
                  <X />
                </MiniButton>
              </div>
              <Input aria-label={`Description, row ${i + 1}`} placeholder="Description (optional)" value={r.description} maxLength={PROPOSAL_LIMITS.cell} onChange={(e) => setRow(r.id, (x) => ({ ...x, description: e.target.value }))} className="h-8" data-testid="row-desc" />
              <div className="grid grid-cols-[4rem_minmax(0,7rem)_4rem_minmax(0,1fr)] items-end gap-2">
                <label className="flex flex-col gap-1 text-caption text-fg-tertiary">
                  Qty
                  <Input aria-label={`Quantity, row ${i + 1}`} value={r.qty} inputMode="decimal" maxLength={20} onChange={(e) => setRow(r.id, (x) => ({ ...x, qty: e.target.value }))} className="h-8 text-right" data-testid="row-qty" />
                </label>
                <label className="flex flex-col gap-1 text-caption text-fg-tertiary">
                  Unit price
                  <Input aria-label={`Unit price, row ${i + 1}`} value={r.unitPrice} inputMode="decimal" maxLength={40} onChange={(e) => setRow(r.id, (x) => ({ ...x, unitPrice: e.target.value }))} className="h-8 text-right" data-testid="row-unit" />
                </label>
                <label className="flex flex-col gap-1 text-caption text-fg-tertiary">
                  Currency
                  <Input aria-label={`Currency, row ${i + 1}`} value={r.currency} placeholder={s.currency || 'USD'} maxLength={3} onChange={(e) => setRow(r.id, (x) => ({ ...x, currency: upper(e.target.value) }))} className="h-8" />
                </label>
                <div className="flex flex-col gap-1 text-right text-caption text-fg-tertiary">
                  Total
                  <span className="flex h-8 items-center justify-end tabular-nums text-body-strong text-fg" data-testid="row-total">
                    {t === null ? '-' : money2(t)}
                  </span>
                </div>
              </div>
              <CheckNote note={r.check} onClear={() => setRow(r.id, (x) => ({ ...x, check: undefined }))} />
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button size="sm" variant="secondary" icon={<Plus />} onClick={() => set((x) => ({ ...x, rows: [...x.rows, emptyRow()].slice(0, PROPOSAL_LIMITS.priceRows) }))} data-testid="row-add" disabled={s.rows.length >= PROPOSAL_LIMITS.priceRows}>
          Add price row
        </Button>
        <div className="text-right" data-testid="pricing-totals">
          {totals.length === 0 ? (
            <p className="text-small text-fg-tertiary">No numeric prices yet.</p>
          ) : (
            totals.map((x) => (
              <p key={x.currency} className="text-body-strong tabular-nums text-fg">
                Total {x.currency} {money2(x.amount)}
              </p>
            ))
          )}
          {unpriced > 0 && <p className="text-caption text-fg-tertiary">{unpriced} without a numeric price (not in the total)</p>}
        </div>
      </div>
    </div>
  );
}

function SectionEditor({
  s,
  i,
  count,
  set,
  remove,
  moveBy,
}: {
  s: Section;
  i: number;
  count: number;
  set: Patch<Section>;
  remove: () => void;
  moveBy: (d: number) => void;
}) {
  const [adding, setAdding] = React.useState(false);
  const setBlock = (id: string): Patch<Block> => (f) => set((x) => ({ ...x, blocks: x.blocks.map((b) => (b.id === id ? f(b) : b)) }));
  const kindBadge = s.kind === 'pricing' ? <Badge tone="brand"><Receipt className="size-3" aria-hidden /> Pricing</Badge> : s.kind === 'terms' ? <Badge tone="neutral"><Scale className="size-3" aria-hidden /> Terms</Badge> : null;
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="section" data-section-kind={s.kind} id={`sec-${s.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-caption font-bold tabular-nums text-brand-600">{String(i + 1).padStart(2, '0')}</span>
          {kindBadge}
        </div>
        <div className="flex items-center">
          <MiniButton label="Move section up" onClick={() => moveBy(-1)} disabled={i === 0} testId="section-up">
            <ArrowUp />
          </MiniButton>
          <MiniButton label="Move section down" onClick={() => moveBy(1)} disabled={i === count - 1} testId="section-down">
            <ArrowDown />
          </MiniButton>
          <MiniButton label="Delete section" onClick={remove} testId="section-delete">
            <Trash2 />
          </MiniButton>
        </div>
      </div>
      <Field label="Heading" htmlFor={`${s.id}-h`}>
        <Input id={`${s.id}-h`} value={s.heading} maxLength={PROPOSAL_LIMITS.heading} onChange={(e) => set((x) => ({ ...x, heading: e.target.value }))} data-testid="section-heading" />
      </Field>
      <CheckNote note={s.check} onClear={() => set((x) => ({ ...x, check: undefined }))} />
      {s.blocks.map((b, bi) => (
        <BlockEditor
          key={b.id}
          b={b}
          i={bi}
          count={s.blocks.length}
          idp={`${s.id}-${b.id}`}
          set={setBlock(b.id)}
          remove={() => set((x) => ({ ...x, blocks: x.blocks.filter((y) => y.id !== b.id) }))}
          moveBy={(d) => set((x) => ({ ...x, blocks: move(x.blocks, bi, d) }))}
        />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {adding ? (
          <>
            {BLOCK_TYPES.map((t) => (
              <Button
                key={t.type}
                size="sm"
                variant="secondary"
                icon={t.icon}
                onClick={() => {
                  set((x) => ({ ...x, blocks: [...x.blocks, emptyBlock(t.type)].slice(0, PROPOSAL_LIMITS.blocks) }));
                  setAdding(false);
                }}
                data-testid={`add-${t.type}`}
              >
                {t.label}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setAdding(true)} disabled={s.blocks.length >= PROPOSAL_LIMITS.blocks} data-testid="block-add">
            {s.kind === 'pricing' ? 'Add text' : 'Add block'}
          </Button>
        )}
      </div>
      {s.kind === 'pricing' && <PricingEditor s={s} set={set} />}
    </Card>
  );
}

const COVER_FIELDS: { key: CoverKey; label: string; hint?: string; wide?: boolean; area?: boolean }[] = [
  { key: 'title', label: 'Title *', wide: true },
  { key: 'subtitle', label: 'Subtitle', wide: true, area: true },
  { key: 'clientCompany', label: 'Client company *' },
  { key: 'contactName', label: 'Contact name' },
  { key: 'contactTitle', label: 'Contact title' },
  { key: 'date', label: 'Date', hint: 'YYYY-MM-DD prints as “16 November 2026”; anything else prints as typed.' },
  { key: 'preparedBy', label: 'Prepared by', hint: 'Name, then role after a comma.', wide: true },
];

/** The section editor with the live preview beside it (stacked on small screens). */
export function ProposalEditor({ doc, update, notes, onDismissNotes }: { doc: ProposalDoc; update: (f: (d: ProposalDoc) => ProposalDoc) => void; notes: string[]; onDismissNotes: () => void }) {
  const [removing, setRemoving] = React.useState<Section | null>(null);
  const [pdf, setPdf] = React.useState<ArrayBuffer | null>(null);
  const [pdfError, setPdfError] = React.useState<string | null>(null);
  const [drawing, setDrawing] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState(true);
  const set = update;
  const setSection = (id: string): Patch<Section> => (f) => set((d) => ({ ...d, sections: d.sections.map((s) => (s.id === id ? f(s) : s)) }));
  const has = (k: Section['kind']) => doc.sections.some((s) => s.kind === k);
  const add = (k: Section['kind']) => set((d) => ({ ...d, sections: [...d.sections, emptySection(k)].slice(0, PROPOSAL_LIMITS.sections) }));
  const checks = openChecks(doc);
  const problem = docProblem(doc);

  // Live preview: redraw a moment after the last edit (the server renders the real PDF; nothing is saved).
  const json = serializeDoc(doc);
  React.useEffect(() => {
    let alive = true;
    const t = window.setTimeout(async () => {
      setDrawing(true);
      const r = await fetchPdf('/api/agreements/preview', { body: { templateId: CUSTOM_PROPOSAL_ID, values: { [DOC_KEY]: json } } });
      if (!alive) return;
      setDrawing(false);
      if (r instanceof ArrayBuffer) {
        setPdf(r);
        setPdfError(null);
      } else setPdfError(r.error);
    }, 900);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [json]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]" data-testid="proposal-editor">
      <div className="flex min-w-0 flex-col gap-4">
        {notes.length > 0 && (
          <Card className="flex items-start justify-between gap-3 p-4" data-testid="import-notes">
            <ul className="flex list-disc flex-col gap-1 pl-5 text-small text-fg-secondary">
              {notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
            <MiniButton label="Dismiss" onClick={onDismissNotes}>
              <X />
            </MiniButton>
          </Card>
        )}
        {checks.length > 0 && (
          <Card className="flex flex-col gap-2 border-warning-400/50 p-4" data-testid="checks-summary">
            <p className="flex items-center gap-2 text-body-strong text-fg">
              <AlertTriangle className="size-4 text-warning-fg" aria-hidden />
              {checks.length} {checks.length === 1 ? 'item to check' : 'items to check'} before sending
            </p>
            <ul className="flex flex-col gap-1 text-small text-fg-secondary">
              {checks.slice(0, 8).map((c, i) => (
                <li key={i}>
                  <span className="font-medium text-fg">{c.where}:</span> {c.note}
                </li>
              ))}
              {checks.length > 8 && <li>and {checks.length - 8} more below.</li>}
            </ul>
          </Card>
        )}

        <Card className="flex flex-col gap-3 p-4" data-testid="cover-editor">
          <h3 className="text-h3 text-fg">Cover</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {COVER_FIELDS.map((f) => {
              const id = `cover-${f.key}`;
              const val = doc.cover[f.key];
              const onV = (v: string) => set((d) => ({ ...d, cover: { ...d.cover, [f.key]: v } }));
              return (
                <div key={f.key} className={cn('flex flex-col gap-1.5', f.wide && 'md:col-span-2')}>
                  <Field label={f.label} htmlFor={id} hint={f.hint}>
                    {f.area ? (
                      <Textarea id={id} rows={2} value={val} maxLength={600} onChange={(e) => onV(e.target.value)} data-testid={id} />
                    ) : (
                      <Input id={id} value={val} maxLength={f.key === 'title' ? PROPOSAL_LIMITS.heading : f.key === 'date' ? 60 : PROPOSAL_LIMITS.short} onChange={(e) => onV(e.target.value)} data-testid={id} />
                    )}
                  </Field>
                  <CheckNote
                    note={doc.coverChecks[f.key]}
                    onClear={() =>
                      set((d) => {
                        const cc = { ...d.coverChecks };
                        delete cc[f.key];
                        return { ...d, coverChecks: cc };
                      })
                    }
                  />
                </div>
              );
            })}
          </div>
        </Card>

        {doc.sections.map((s, i) => (
          <SectionEditor
            key={s.id}
            s={s}
            i={i}
            count={doc.sections.length}
            set={setSection(s.id)}
            remove={() => setRemoving(s)}
            moveBy={(d) => set((x) => ({ ...x, sections: move(x.sections, i, d) }))}
          />
        ))}
        {doc.sections.length === 0 && <p className="rounded-md border border-dashed border-line-strong p-4 text-body text-fg-secondary">No sections yet. Add one below.</p>}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Plus />} onClick={() => add('content')} disabled={doc.sections.length >= PROPOSAL_LIMITS.sections} data-testid="section-add">
            Add section
          </Button>
          <Button variant="secondary" icon={<Receipt />} onClick={() => add('pricing')} disabled={has('pricing')} data-testid="section-add-pricing">
            Add pricing
          </Button>
          <Button variant="secondary" icon={<Scale />} onClick={() => add('terms')} disabled={has('terms')} data-testid="section-add-terms">
            Add terms
          </Button>
        </div>
        {problem && (
          <p className="rounded-md bg-subtle px-3 py-2 text-small text-fg-secondary" data-testid="doc-problem">
            Before sending: {problem}
          </p>
        )}
      </div>

      <aside className="min-w-0 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto" aria-label="Preview">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-small text-fg-secondary">
            Live preview {drawing && <Loader2 className="size-3.5 animate-spin" aria-label="Updating" />}
          </p>
          <Button size="sm" variant="ghost" className="xl:hidden" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? 'Hide preview' : 'Show preview'}
          </Button>
        </div>
        <div className={cn('rounded-lg border border-line bg-subtle p-2 md:p-3', !showPreview && 'hidden xl:block')} data-testid="proposal-preview">
          {pdfError ? <InlineError message={pdfError} /> : <PdfViewer data={pdf} label="Proposal preview" />}
        </div>
      </aside>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          const id = removing?.id;
          if (id) set((d) => ({ ...d, sections: d.sections.filter((s) => s.id !== id) }));
        }}
        title="Delete this section?"
        description={`“${removing?.heading || 'Untitled section'}” and everything in it will be removed from the proposal.`}
        confirmLabel="Delete section"
        icon={<Trash2 />}
      />
    </div>
  );
}
