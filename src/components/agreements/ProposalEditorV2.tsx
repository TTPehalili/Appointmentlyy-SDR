'use client';

/**
 * Custom proposal v2 editor: the cover, sections built from the 14 design components, the Acceptance page and
 * the closing band, with design-safe controls only (variant, columns, highlight, spacing, new page, divider,
 * dark/light bands, page size). Every text field has a live character counter at its hard limit (visible
 * characters: **bold** and *italic* markers do not count). The live preview is the real template.
 *
 * Checks are shown inline where they belong and summarised at the top. "Mark all as checked" clears the stored
 * notes only: the acceptance line (signing is binding) and missing UAT terms are cleared one by one, and
 * [placeholders] only by filling them in.
 */
import * as React from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Copy, FileSignature, Loader2, Plus, Receipt, Scale, ShieldCheck, Trash2, X } from 'lucide-react';
import { Badge, Button, Card, ConfirmDialog, Field, InlineError, Input, Select, Switch, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import { PdfViewer } from '@/components/agreements/PdfViewer';
import { fetchPdf } from '@/components/agreements/ownerShared';
import { CLIENT_KEY, DOC_KEY } from '@/lib/agreements/customProposal';
import {
  ACCEPTANCE_CHECK,
  CHIP,
  COMPONENT_LABEL,
  COMPONENT_TYPES,
  CUSTOM_PROPOSAL_V2_ID,
  ICON_KEYS,
  LIST_BULLETS,
  PRICE_HEADER,
  PROCESS_BOX,
  TABLE,
  UAT_CHECK,
  V2_LIMITS,
  VARIANTS,
  acceptancePending,
  cellMax,
  clearAllChecksV2,
  docProblemV2,
  emptyPriceRow,
  emptySectionV2,
  estimatePagesV2,
  formSpec,
  hasUatTerms,
  mark,
  newComponent,
  newId,
  openChecksV2,
  sectionName,
  serializeDocV2,
  vlen,
  type Component,
  type ComponentType,
  type CoverField,
  type FSField,
  type ProposalDocV2,
  type SectionV2,
  type Space,
} from '@/lib/agreements/customProposalV2';

export const valuesOfDocV2 = (doc: ProposalDocV2): Record<string, string> => ({ [DOC_KEY]: serializeDocV2(doc), [CLIENT_KEY]: doc.cover.clientCompany });

type Patch<T> = (f: (x: T) => T) => void;

const COMPONENT_HELP: Record<ComponentType, string> = {
  'section-header': 'Eyebrow, title and text at four levels.',
  text: 'Paragraphs or a bullet or numbered list.',
  letter: 'A personal note with a salutation and your sign-off.',
  stats: 'Three figures in a ruled strip, or 3 to 4 stat cards.',
  'card-grid': 'Cards in 2 or 3 columns: icons, people, steps, lists.',
  'detail-card': 'A full-width card with a tag and up to 2 sub-cards.',
  roadmap: '3 to 4 phases with gates and two band labels.',
  'dark-band': 'One principle on ink, with a crimson phrase or number.',
  'data-table': 'A table with typed columns and margin bars.',
  'price-table': 'Items, rates and terms. Prices always come from you.',
  economics: 'A cost card beside a dark result card.',
  callout: 'A recommendation (green) or a neutral note.',
  process: 'A label and three timed boxes per row.',
  checklist: 'Open decisions as checkboxes.',
};

const SPACE_LABEL: Record<Space, string> = { tight: 'Compact', normal: 'Normal', loose: 'Loose' };
const TOTAL_CHECK = 'The total row is added up by the app: confirm it matches your pricing.';

const move = <T,>(list: T[], i: number, d: number): T[] => {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};

// ------------------------------------------------------------------ small parts

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

function CheckNote({ note, onClear, testId, clearLabel = 'Mark as checked' }: { note?: string; onClear?: () => void; testId?: string; clearLabel?: string }) {
  if (!note) return null;
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-warning-bg px-3 py-2 text-small text-warning-fg" data-testid={testId ?? 'check-note'}>
      <span className="flex min-w-0 items-start gap-1.5">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 break-words">
          <span className="font-semibold">Check:</span> {note}
        </span>
      </span>
      {onClear && (
        <button type="button" onClick={onClear} className="focus-ring shrink-0 rounded-sm font-medium underline underline-offset-2" data-testid="check-clear">
          {clearLabel}
        </button>
      )}
    </div>
  );
}

/** A text input with a live counter; the limit is hard (an edit past it is not taken). */
function LimitedField({ id, label, value, max, onChange, multi, hint, className, testId, rows }: { id: string; label: string; value: string; max: number; onChange: (v: string) => void; multi?: boolean; hint?: string; className?: string; testId?: string; rows?: number }) {
  const n = vlen(value);
  const set = (v: string) => {
    if (vlen(v) > max && vlen(v) > n) return;
    onChange(multi ? v : v.replace(/[\r\n]+/g, ' '));
  };
  const counter = (
    <span className={cn('tabular-nums', n >= max ? 'font-medium text-warning-fg' : 'text-fg-tertiary')} data-testid="char-count" aria-live="polite">
      {n}/{max}
    </span>
  );
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-body-strong text-fg">
          {label}
        </label>
        <span className="text-caption">{counter}</span>
      </div>
      {multi ? (
        <Textarea id={id} value={value} rows={rows ?? Math.min(8, Math.max(2, Math.ceil(n / 80)))} onChange={(e) => set(e.target.value)} maxLength={max + 24} data-testid={testId} data-max={max} />
      ) : (
        <Input id={id} value={value} onChange={(e) => set(e.target.value)} maxLength={max + 24} data-testid={testId} data-max={max} />
      )}
      {hint && <p className="text-small text-fg-tertiary">{hint}</p>}
    </div>
  );
}

function SelectField({ id, label, value, onChange, options, testId }: { id: string; label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; testId?: string }) {
  return (
    <Field label={label} htmlFor={id}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function SwitchRow({ label, checked, onChange, disabled, testId }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; testId?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2" data-testid={testId}>
      <span className="text-body text-fg">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} label={label} disabled={disabled} />
    </div>
  );
}

// ------------------------------------------------------------------ component forms

const highlightOptions = (n: number, label: (i: number) => string) => [{ value: '', label: 'None' }, ...Array.from({ length: n }, (_, i) => ({ value: String(i), label: label(i) }))];

function fieldInput(idp: string, fs: FSField, value: string, onChange: (v: string) => void, className?: string) {
  return <LimitedField key={fs.key} id={`${idp}-${fs.key}`} label={fs.label} value={value} max={fs.max} multi={fs.multi} onChange={onChange} className={className ?? (fs.multi ? 'md:col-span-2' : undefined)} testId={`f-${fs.key}`} />;
}

function ComponentForm({ c, set, idp }: { c: Component; set: Patch<Component>; idp: string }) {
  const spec = formSpec(c);
  const o = c as unknown as Record<string, unknown>;
  const setKey = (k: string, v: unknown) => set((x) => ({ ...x, [k]: v }) as Component);
  return (
    <div className="flex flex-col gap-3">
      {spec.fields.length > 0 && <div className="grid gap-3 md:grid-cols-2">{spec.fields.map((fs) => fieldInput(idp, fs, String(o[fs.key] ?? ''), (v) => setKey(fs.key, v)))}</div>}
      {spec.strings.map((st) => {
        const list = (o[st.key] as string[]) ?? [];
        return (
          <div key={st.key} className="flex flex-col gap-2">
            {list.map((v, i) => (
              <div key={i} className="flex items-start gap-1">
                <LimitedField
                  id={`${idp}-${st.key}-${i}`}
                  label={`${st.label.replace(/s$/, '')} ${i + 1}`}
                  value={v}
                  max={st.itemMax}
                  multi={st.multi}
                  className="grow"
                  testId={`f-${st.key}`}
                  onChange={(nv) => setKey(st.key, list.map((x, j) => (j === i ? nv : x)))}
                />
                <MiniButton label={`Remove ${st.label.toLowerCase().replace(/s$/, '')} ${i + 1}`} onClick={() => setKey(st.key, list.filter((_, j) => j !== i))} disabled={list.length <= st.min}>
                  <X />
                </MiniButton>
              </div>
            ))}
            <div>
              <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setKey(st.key, [...list, ''])} disabled={list.length >= st.max}>
                Add {st.label.toLowerCase().replace(/s$/, '')} ({list.length}/{st.max})
              </Button>
            </div>
            {st.totalMax && <p className="text-caption text-fg-tertiary">Total {list.reduce((a, x) => a + vlen(x), 0)}/{st.totalMax} characters.</p>}
          </div>
        );
      })}
      {spec.lists.map((ls) => {
        const list = (o[ls.key] as Record<string, unknown>[]) ?? [];
        const setItem = (i: number, k: string, v: unknown) => setKey(ls.key, list.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
        return (
          <div key={ls.key} className="flex flex-col gap-2">
            {list.map((it, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-md border border-line p-3" data-testid={`item-${ls.key}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-caption font-semibold text-fg-tertiary">
                    {ls.item} {i + 1}
                  </span>
                  <div className="flex items-center">
                    <MiniButton label={`Move ${ls.item.toLowerCase()} ${i + 1} up`} onClick={() => setKey(ls.key, move(list, i, -1))} disabled={i === 0}>
                      <ArrowUp />
                    </MiniButton>
                    <MiniButton label={`Move ${ls.item.toLowerCase()} ${i + 1} down`} onClick={() => setKey(ls.key, move(list, i, 1))} disabled={i === list.length - 1}>
                      <ArrowDown />
                    </MiniButton>
                    <MiniButton label={`Remove ${ls.item.toLowerCase()} ${i + 1}`} onClick={() => setKey(ls.key, list.filter((_, j) => j !== i))} disabled={list.length <= ls.min}>
                      <Trash2 />
                    </MiniButton>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">{ls.fields.map((fs) => fieldInput(`${idp}-${ls.key}${i}`, fs, String(it[fs.key] ?? ''), (v) => setItem(i, fs.key, v)))}</div>
                <ItemExtras c={c} listKey={ls.key} i={i} it={it} setItem={(k, v) => setItem(i, k, v)} idp={`${idp}-${ls.key}${i}`} />
                {typeof it.check === 'string' && it.check ? <CheckNote note={it.check} onClear={() => setItem(i, 'check', undefined)} /> : null}
              </div>
            ))}
            <div>
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus />}
                disabled={list.length >= ls.max}
                onClick={() => setKey(ls.key, [...list, c.type === 'price-table' ? emptyPriceRow() : c.type === 'process' ? { label: '', boxes: [0, 1, 2].map(() => ({ label: '', value: '' })) } : c.type === 'card-grid' ? { title: '', initials: '', subtitle: '', text: '', icon: 'target', chips: [], bullets: c.variant === 'list' ? ['', ''] : [] } : Object.fromEntries(ls.fields.map((fs) => [fs.key, '']))])}
                data-testid={`add-${ls.key}`}
              >
                Add {ls.item.toLowerCase()} ({list.length}/{ls.max})
              </Button>
            </div>
          </div>
        );
      })}
      {c.type === 'data-table' && <DataTableForm c={c} set={set} idp={idp} />}
      {c.type === 'price-table' && (
        <div className="grid gap-3 md:grid-cols-4">
          {c.headers.map((h, j) => (
            <LimitedField key={j} id={`${idp}-h${j}`} label={`Column ${j + 1} header`} value={h} max={PRICE_HEADER} onChange={(v) => set((x) => ({ ...x, headers: (x as typeof c).headers.map((y, k) => (k === j ? v : y)) }) as Component)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Per-item extras: icon, chips, bullets, process boxes. */
function ItemExtras({ c, listKey, it, setItem, idp }: { c: Component; listKey: string; i: number; it: Record<string, unknown>; setItem: (k: string, v: unknown) => void; idp: string }) {
  if (c.type === 'card-grid' && listKey === 'items') {
    const chips = (it.chips as { text: string; tone: 'neutral' | 'positive' }[]) ?? [];
    const bullets = (it.bullets as string[]) ?? [];
    return (
      <>
        {c.variant === 'icon' && <SelectField id={`${idp}-icon`} label="Icon" value={String(it.icon ?? 'target')} onChange={(v) => setItem('icon', v)} options={ICON_KEYS.map((k) => ({ value: k, label: k.replace(/-/g, ' ') }))} />}
        {c.variant === 'list' && (
          <div className="flex flex-col gap-2">
            {bullets.map((b, k) => (
              <div key={k} className="flex items-start gap-1">
                <LimitedField id={`${idp}-b${k}`} label={`Bullet ${k + 1}`} value={b} max={LIST_BULLETS.text} className="grow" onChange={(v) => setItem('bullets', bullets.map((x, j) => (j === k ? v : x)))} />
                <MiniButton label={`Remove bullet ${k + 1}`} onClick={() => setItem('bullets', bullets.filter((_, j) => j !== k))} disabled={bullets.length <= LIST_BULLETS.min}>
                  <X />
                </MiniButton>
              </div>
            ))}
            <div>
              <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setItem('bullets', [...bullets, ''])} disabled={bullets.length >= LIST_BULLETS.max}>
                Add bullet
              </Button>
            </div>
          </div>
        )}
        {c.variant === 'card' && (
          <div className="flex flex-col gap-2">
            {chips.map((ch, k) => (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_9rem_auto] items-end gap-2">
                <LimitedField id={`${idp}-chip${k}`} label={`Chip ${k + 1}`} value={ch.text} max={CHIP.text} onChange={(v) => setItem('chips', chips.map((x, j) => (j === k ? { ...x, text: v } : x)))} />
                <SelectField id={`${idp}-chipt${k}`} label="Tone" value={ch.tone} onChange={(v) => setItem('chips', chips.map((x, j) => (j === k ? { ...x, tone: v as 'neutral' | 'positive' } : x)))} options={[{ value: 'neutral', label: 'Neutral' }, { value: 'positive', label: 'Positive (green)' }]} />
                <MiniButton label={`Remove chip ${k + 1}`} onClick={() => setItem('chips', chips.filter((_, j) => j !== k))}>
                  <X />
                </MiniButton>
              </div>
            ))}
            {chips.length < CHIP.max && (
              <div>
                <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setItem('chips', [...chips, { text: '', tone: 'neutral' }])}>
                  Add a target chip
                </Button>
              </div>
            )}
          </div>
        )}
      </>
    );
  }
  if (c.type === 'process' && listKey === 'rows') {
    const boxes = (it.boxes as { label: string; value: string }[]) ?? [];
    return (
      <div className="grid gap-3 md:grid-cols-3">
        {boxes.map((b, k) => (
          <div key={k} className="flex flex-col gap-2">
            <LimitedField id={`${idp}-bl${k}`} label={`Box ${k + 1} label`} value={b.label} max={PROCESS_BOX.label} onChange={(v) => setItem('boxes', boxes.map((x, j) => (j === k ? { ...x, label: v } : x)))} />
            <LimitedField id={`${idp}-bv${k}`} label={`Box ${k + 1} value`} value={b.value} max={PROCESS_BOX.value} onChange={(v) => setItem('boxes', boxes.map((x, j) => (j === k ? { ...x, value: v } : x)))} />
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function DataTableForm({ c, set, idp }: { c: Extract<Component, { type: 'data-table' }>; set: Patch<Component>; idp: string }) {
  const up = (f: (x: typeof c) => typeof c) => set((x) => f(x as typeof c));
  return (
    <div className="flex flex-col gap-3" data-testid="table-editor">
      <div className="grid gap-3 md:grid-cols-3">
        {c.columns.map((col, j) => (
          <div key={j} className="flex flex-col gap-2 rounded-md border border-line p-2">
            <LimitedField id={`${idp}-ch${j}`} label={`Column ${j + 1} header`} value={col.header} max={TABLE.header} onChange={(v) => up((x) => ({ ...x, columns: x.columns.map((y, k) => (k === j ? { ...y, header: v } : y)) }))} />
            {j > 0 && (
              <SelectField id={`${idp}-ck${j}`} label="Kind" value={col.kind} onChange={(v) => up((x) => ({ ...x, columns: x.columns.map((y, k) => (k === j ? { ...y, kind: v as typeof col.kind } : y)), rows: x.rows.map((r) => ({ ...r, cells: r.cells.map((cell, k) => (k === j ? cell.slice(0, cellMax(v as typeof col.kind)) : cell)) })) }))} options={[{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number (right)' }, { value: 'bar', label: 'Percent with bar' }]} />
            )}
            {col.kind === 'number' && (
              <SelectField id={`${idp}-ct${j}`} label="Tone" value={col.tone} onChange={(v) => up((x) => ({ ...x, columns: x.columns.map((y, k) => (k === j ? { ...y, tone: v as typeof col.tone } : y)) }))} options={[{ value: 'default', label: 'Default' }, { value: 'strong', label: 'Strong' }, { value: 'muted', label: 'Muted' }, { value: 'positive', label: 'Positive (green)' }]} />
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" icon={<Plus />} disabled={c.columns.length >= TABLE.maxCols} onClick={() => up((x) => ({ ...x, columns: [...x.columns, { header: '', kind: 'text', tone: 'default' }], rows: x.rows.map((r) => ({ cells: [...r.cells, ''], subs: [...r.subs, ''] })) }))}>
          Add column
        </Button>
        <Button size="sm" variant="ghost" icon={<X />} disabled={c.columns.length <= TABLE.minCols} onClick={() => up((x) => ({ ...x, columns: x.columns.slice(0, -1), rows: x.rows.map((r) => ({ cells: r.cells.slice(0, -1), subs: r.subs.slice(0, -1) })), highlightCol: x.highlightCol !== null && x.highlightCol >= x.columns.length - 1 ? null : x.highlightCol }))}>
          Remove last column
        </Button>
      </div>
      {c.rows.map((r, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-md border border-line p-2" data-testid="table-row">
          <div className="flex items-center justify-between">
            <span className="text-caption font-semibold text-fg-tertiary">Row {i + 1}</span>
            <div className="flex">
              <MiniButton label={`Move row ${i + 1} up`} onClick={() => up((x) => ({ ...x, rows: move(x.rows, i, -1) }))} disabled={i === 0}>
                <ArrowUp />
              </MiniButton>
              <MiniButton label={`Move row ${i + 1} down`} onClick={() => up((x) => ({ ...x, rows: move(x.rows, i, 1) }))} disabled={i === c.rows.length - 1}>
                <ArrowDown />
              </MiniButton>
              <MiniButton label={`Delete row ${i + 1}`} onClick={() => up((x) => ({ ...x, rows: x.rows.filter((_, k) => k !== i) }))} disabled={c.rows.length <= 1}>
                <Trash2 />
              </MiniButton>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {r.cells.map((cell, j) => (
              <div key={j} className="flex flex-col gap-1">
                <LimitedField id={`${idp}-r${i}c${j}`} label={c.columns[j]?.header || `Column ${j + 1}`} value={cell} max={cellMax(c.columns[j]?.kind ?? 'text')} onChange={(v) => up((x) => ({ ...x, rows: x.rows.map((y, k) => (k === i ? { ...y, cells: y.cells.map((z, m) => (m === j ? v : z)) } : y)) }))} testId={`cell-${i}-${j}`} />
                <Input aria-label={`Sub-label, row ${i + 1}, column ${j + 1}`} placeholder="Sub-label (optional)" value={r.subs[j] ?? ''} maxLength={TABLE.sub} onChange={(e) => up((x) => ({ ...x, rows: x.rows.map((y, k) => (k === i ? { ...y, subs: y.subs.map((z, m) => (m === j ? e.target.value : z)) } : y)) }))} className="h-8" />
              </div>
            ))}
          </div>
        </div>
      ))}
      <div>
        <Button size="sm" variant="ghost" icon={<Plus />} disabled={c.rows.length >= TABLE.maxRows} onClick={() => up((x) => ({ ...x, rows: [...x.rows, { cells: x.columns.map(() => ''), subs: x.columns.map(() => '') }] }))}>
          Add row ({c.rows.length}/{TABLE.maxRows})
        </Button>
      </div>
    </div>
  );
}

/** The design-safe controls for one component. */
function ComponentControls({ c, set, idp, first }: { c: Component; set: Patch<Component>; idp: string; first: boolean }) {
  const setKey = (k: string, v: unknown) => set((x) => ({ ...x, [k]: v }) as Component);
  const variants = VARIANTS[c.type];
  const changeVariant = (v: string) =>
    set((x) => {
      // A new variant starts from that variant's sample when the shape differs (strip vs cards, table kinds).
      if (x.type === 'stats' && v !== x.variant) return { ...newComponent('stats', v), id: x.id, space: x.space, newPage: x.newPage };
      if (x.type === 'price-table' && v !== x.variant) return { ...x, variant: v as '3col' | '4col', headers: (newComponent('price-table', v) as typeof x).headers };
      if (x.type === 'card-grid' && v !== x.variant) {
        const cols = v === 'list' || v === 'plain' || v === 'plain-ruled' || v === 'person' ? 2 : x.columns;
        return { ...x, variant: v as typeof x.variant, columns: cols, items: x.items.map((it) => ({ ...it, bullets: v === 'list' && !it.bullets.length ? ['', ''] : it.bullets })) };
      }
      return { ...x, variant: v } as Component;
    });
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="component-controls">
      {variants && <SelectField id={`${idp}-variant`} label="Style" value={c.variant} onChange={changeVariant} options={variants} testId="ctl-variant" />}
      {c.type === 'card-grid' && !['list', 'plain', 'plain-ruled', 'person'].includes(c.variant) && (
        <SelectField id={`${idp}-cols`} label="Columns" value={String(c.columns)} onChange={(v) => setKey('columns', Number(v))} options={[{ value: '2', label: '2 columns' }, { value: '3', label: '3 columns' }]} testId="ctl-columns" />
      )}
      {c.type === 'stats' && c.variant === 'cards' && (
        <SelectField
          id={`${idp}-cols`}
          label="Cards"
          value={String(c.columns)}
          onChange={(v) => set((x) => {
            const s = x as typeof c;
            const n = Number(v) as 3 | 4;
            const items = n > s.items.length ? [...s.items, { label: '', value: '', description: '' }] : s.items.slice(0, n);
            return { ...s, columns: n, items, highlight: s.highlight !== null && s.highlight >= n ? null : s.highlight };
          })}
          options={[{ value: '3', label: '3 cards' }, { value: '4', label: '4 cards' }]}
          testId="ctl-columns"
        />
      )}
      {(c.type === 'stats' || c.type === 'roadmap') && (
        <SelectField
          id={`${idp}-hl`}
          label="Highlight"
          value={c.highlight === null ? '' : String(c.highlight)}
          onChange={(v) => setKey('highlight', v === '' ? null : Number(v))}
          options={highlightOptions(c.type === 'stats' ? c.items.length : c.phases.length, (i) => (c.type === 'stats' ? `Stat ${i + 1}` : `Phase ${i + 1}`))}
          testId="ctl-highlight"
        />
      )}
      {c.type === 'data-table' && (
        <SelectField id={`${idp}-hc`} label="Highlighted column" value={c.highlightCol === null ? '' : String(c.highlightCol)} onChange={(v) => setKey('highlightCol', v === '' ? null : Number(v))} options={[{ value: '', label: 'None' }, ...c.columns.slice(1).map((col, j) => ({ value: String(j + 1), label: col.header || `Column ${j + 2}` }))]} testId="ctl-highlight" />
      )}
      {c.type === 'roadmap' && (
        <>
          <SelectField id={`${idp}-split`} label="Left band covers" value={String(c.bandSplit)} onChange={(v) => setKey('bandSplit', Number(v))} options={Array.from({ length: c.phases.length - 1 }, (_, i) => ({ value: String(i + 1), label: `Phases 1 to ${i + 1}` }))} />
          <SwitchRow label="Right band dark" checked={c.bandDark} onChange={(v) => setKey('bandDark', v)} testId="ctl-dark" />
        </>
      )}
      {c.type === 'process' && <SwitchRow label="Last box dark" checked={c.lastDark} onChange={(v) => setKey('lastDark', v)} testId="ctl-dark" />}
      {c.type === 'card-grid' && c.variant === 'card' && <SwitchRow label="Compact titles" checked={c.compact} onChange={(v) => setKey('compact', v)} />}
      {c.type === 'callout' && c.variant === 'neutral' && <SelectField id={`${idp}-icon`} label="Icon" value={c.icon} onChange={(v) => setKey('icon', v)} options={ICON_KEYS.map((k) => ({ value: k, label: k.replace(/-/g, ' ') }))} />}
      {c.type === 'section-header' && c.variant === 'sub' && (
        <SelectField id={`${idp}-div`} label="Rule above" value={c.divider} onChange={(v) => setKey('divider', v)} options={[{ value: 'none', label: 'None' }, { value: 'thin', label: 'Thin rule' }, { value: 'strong', label: 'Strong rule' }]} testId="ctl-divider" />
      )}
      {c.type === 'price-table' && (
        <SwitchRow
          label="Show a total row"
          checked={c.showTotal}
          testId="ctl-total"
          onChange={(v) =>
            // The app adds up the rates: switching the total on asks the owner to confirm it against the pricing.
            set((x) => ({ ...x, showTotal: v, ...(v ? { check: mark(x.check, TOTAL_CHECK) } : {}) }) as Component)
          }
        />
      )}
      <SelectField id={`${idp}-space`} label="Space above" value={c.space} onChange={(v) => setKey('space', v as Space)} options={(['tight', 'normal', 'loose'] as Space[]).map((s) => ({ value: s, label: SPACE_LABEL[s] }))} testId="ctl-space" />
      <SwitchRow label="Start on a new page" checked={c.newPage} onChange={(v) => setKey('newPage', v)} disabled={first} testId="ctl-newpage" />
    </div>
  );
}

function ComponentEditor({ c, i, count, set, remove, moveBy, duplicate, idp }: { c: Component; i: number; count: number; set: Patch<Component>; remove: () => void; moveBy: (d: number) => void; duplicate: () => void; idp: string }) {
  const [open, setOpen] = React.useState(true);
  return (
    <div className="flex flex-col gap-3 rounded-md border border-line p-3" data-testid="component" data-component-type={c.type} id={`comp-${c.id}`}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="focus-ring flex min-w-0 items-center gap-2 rounded-sm text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="text-body-strong text-fg">{COMPONENT_LABEL[c.type]}</span>
          {c.check && <Badge tone="warning">Check</Badge>}
        </button>
        <div className="flex items-center">
          <MiniButton label="Move component up" onClick={() => moveBy(-1)} disabled={i === 0} testId="component-up">
            <ArrowUp />
          </MiniButton>
          <MiniButton label="Move component down" onClick={() => moveBy(1)} disabled={i === count - 1} testId="component-down">
            <ArrowDown />
          </MiniButton>
          <MiniButton label="Duplicate component" onClick={duplicate} testId="component-duplicate">
            <Copy />
          </MiniButton>
          <MiniButton label="Delete component" onClick={remove} testId="component-delete">
            <Trash2 />
          </MiniButton>
        </div>
      </div>
      <CheckNote note={c.check} onClear={() => set((x) => ({ ...x, check: undefined }) as Component)} />
      {open && (
        <>
          <ComponentControls c={c} set={set} idp={idp} first={i === 0} />
          <ComponentForm c={c} set={set} idp={idp} />
        </>
      )}
    </div>
  );
}

/** The component picker: the 14 types, each inserted with sample content within its limits. */
function Picker({ onPick, onCancel, pricing }: { onPick: (t: ComponentType) => void; onCancel: () => void; pricing: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-line-strong p-3" data-testid="component-picker">
      <p className="text-body-strong text-fg">Add a component</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {COMPONENT_TYPES.map((t) => (
          <button key={t} type="button" onClick={() => onPick(t)} className={cn('focus-ring flex flex-col gap-0.5 rounded-md border border-line p-2 text-left hover:bg-subtle', pricing && t === 'price-table' && 'border-selected')} data-testid={`pick-${t}`}>
            <span className="text-body-strong text-fg">{COMPONENT_LABEL[t]}</span>
            <span className="text-small text-fg-secondary">{COMPONENT_HELP[t]}</span>
          </button>
        ))}
      </div>
      <div>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function SectionEditor({ s, i, count, set, remove, moveBy }: { s: SectionV2; i: number; count: number; set: Patch<SectionV2>; remove: () => void; moveBy: (d: number) => void }) {
  const [adding, setAdding] = React.useState(false);
  const setComp = (id: string): Patch<Component> => (f) => set((x) => ({ ...x, blocks: x.blocks.map((b) => (b.id === id ? f(b) : b)) }));
  const kindBadge = s.kind === 'pricing' ? <Badge tone="brand"><Receipt className="size-3" aria-hidden /> Pricing</Badge> : s.kind === 'terms' ? <Badge tone="neutral"><Scale className="size-3" aria-hidden /> Terms</Badge> : null;
  const L = V2_LIMITS.section;
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="section" data-section-kind={s.kind} id={`sec-${s.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-caption font-bold tabular-nums text-brand-600">{String(i + 1).padStart(2, '0')}</span>
          {kindBadge}
          <span className="text-small text-fg-secondary">{sectionName(s, i)}</span>
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
      <div className="grid gap-3 md:grid-cols-2">
        <LimitedField id={`${s.id}-eb`} label="Eyebrow" value={s.eyebrow} max={L.eyebrow} onChange={(v) => set((x) => ({ ...x, eyebrow: v }))} testId="section-eyebrow" />
        <LimitedField id={`${s.id}-h`} label="Heading" value={s.heading} max={L.heading} onChange={(v) => set((x) => ({ ...x, heading: v }))} testId="section-heading" />
        <LimitedField id={`${s.id}-lead`} label="Lead" value={s.lead} max={L.lead} multi className="md:col-span-2" onChange={(v) => set((x) => ({ ...x, lead: v }))} testId="section-lead" />
        <SwitchRow label={s.kind === 'content' ? 'Start on a new page' : 'Starts on a new page (always)'} checked={s.kind !== 'content' || s.newPage} onChange={(v) => set((x) => ({ ...x, newPage: v }))} disabled={s.kind !== 'content' || i === 0} testId="section-newpage" />
        <LimitedField id={`${s.id}-cont`} label="Continued note (optional)" value={s.continuedNote} max={V2_LIMITS.continuedNote} onChange={(v) => set((x) => ({ ...x, continuedNote: v }))} hint="Shown at the bottom of a page when this section runs on." />
      </div>
      <CheckNote note={s.check} onClear={() => set((x) => ({ ...x, check: undefined }))} />
      {s.blocks.map((c, bi) => (
        <ComponentEditor
          key={c.id}
          c={c}
          i={bi}
          count={s.blocks.length}
          idp={`${s.id}-${c.id}`}
          set={setComp(c.id)}
          remove={() => set((x) => ({ ...x, blocks: x.blocks.filter((y) => y.id !== c.id) }))}
          moveBy={(d) => set((x) => ({ ...x, blocks: move(x.blocks, bi, d) }))}
          duplicate={() => set((x) => ({ ...x, blocks: [...x.blocks.slice(0, bi + 1), { ...JSON.parse(JSON.stringify(c)), id: newId('c') }, ...x.blocks.slice(bi + 1)].slice(0, V2_LIMITS.blocks) }))}
        />
      ))}
      {adding ? (
        <Picker
          pricing={s.kind === 'pricing'}
          onCancel={() => setAdding(false)}
          onPick={(t) => {
            set((x) => ({ ...x, blocks: [...x.blocks, newComponent(t)].slice(0, V2_LIMITS.blocks) }));
            setAdding(false);
          }}
        />
      ) : (
        <div>
          <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setAdding(true)} disabled={s.blocks.length >= V2_LIMITS.blocks} data-testid="component-add">
            Add component
          </Button>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ the editor

const COVER_REF: Partial<Record<CoverField, string>> = {};
void COVER_REF;

export function ProposalEditorV2({ doc, update, notes, onDismissNotes }: { doc: ProposalDocV2; update: (f: (d: ProposalDocV2) => ProposalDocV2) => void; notes: string[]; onDismissNotes: () => void }) {
  const [removing, setRemoving] = React.useState<SectionV2 | null>(null);
  const [pdf, setPdf] = React.useState<ArrayBuffer | null>(null);
  const [pdfError, setPdfError] = React.useState<string | null>(null);
  const [drawing, setDrawing] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState(true);
  const set = update;
  const setSection = (id: string): Patch<SectionV2> => (f) => set((d) => ({ ...d, sections: d.sections.map((s) => (s.id === id ? f(s) : s)) }));
  const checks = openChecksV2(doc);
  const clearable = checks.filter((c) => c.kind === 'note').length;
  const problem = docProblemV2(doc);
  const lengthPct = Math.round((estimatePagesV2(doc) / V2_LIMITS.maxPages) * 100);
  const L = V2_LIMITS.cover;
  const cover = doc.cover;
  const setCover = (patch: Partial<typeof cover>) => set((d) => ({ ...d, cover: { ...d.cover, ...patch } }));
  const coverCheck = (k: CoverField) => (
    <CheckNote
      note={doc.coverChecks[k]}
      onClear={() =>
        set((d) => {
          const cc = { ...d.coverChecks };
          delete cc[k];
          return { ...d, coverChecks: cc };
        })
      }
    />
  );

  // Live preview: redraw a moment after the last edit (the server renders the real PDF; nothing is saved).
  const json = serializeDocV2(doc);
  React.useEffect(() => {
    let alive = true;
    const ctl = new AbortController();
    const t = window.setTimeout(async () => {
      setDrawing(true);
      try {
        const r = await fetchPdf('/api/agreements/preview', { body: { templateId: CUSTOM_PROPOSAL_V2_ID, values: { [DOC_KEY]: json } }, signal: ctl.signal });
        if (!alive) return;
        if (r instanceof ArrayBuffer) {
          setPdf(r);
          setPdfError(null);
        } else setPdfError(r.error);
      } catch {
        /* aborted: a newer edit asked for its own preview */
      } finally {
        if (alive) setDrawing(false);
      }
    }, 900);
    return () => {
      alive = false;
      window.clearTimeout(t);
      // A newer edit replaces this preview: stop waiting for it (the server allows one render per owner at a time).
      ctl.abort();
    };
  }, [json]);

  const jump = (ref: string) => {
    const [kind, id] = ref.split(':');
    const el = document.getElementById(kind === 'comp' ? `comp-${id}` : kind === 'section' ? `sec-${id}` : kind === 'row' ? `comp-${doc.sections.flatMap((s) => s.blocks).find((b) => b.type === 'price-table' && b.rows.some((r) => r.id === id))?.id}` : kind === 'acceptance' || kind === 'uat' ? 'proposal-acceptance' : 'proposal-cover');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]" data-testid="proposal-editor-v2">
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-body-strong text-fg">
                <AlertTriangle className="size-4 text-warning-fg" aria-hidden />
                {checks.length} {checks.length === 1 ? 'item to check' : 'items to check'} before sending
              </p>
              {clearable > 1 && (
                <Button size="sm" variant="secondary" onClick={() => set((d) => clearAllChecksV2(d))} data-testid="checks-clear-all">
                  Mark all {clearable} as checked
                </Button>
              )}
            </div>
            <ul className="flex flex-col gap-1 text-small text-fg-secondary">
              {checks.slice(0, 10).map((c, i) => (
                <li key={i}>
                  <button type="button" className="focus-ring rounded-sm text-left hover:underline" onClick={() => jump(c.ref)}>
                    <span className="font-medium text-fg">{c.where}:</span> {c.note}
                  </button>
                </li>
              ))}
              {checks.length > 10 && <li>and {checks.length - 10} more below.</li>}
            </ul>
            {checks.some((c) => c.kind !== 'note') && <p className="text-caption text-fg-tertiary">The acceptance line is confirmed on its own; the UAT check clears when you add UAT sign-off terms; [placeholders] clear when you fill them in.</p>}
          </Card>
        )}

        <Card className="flex flex-col gap-3 p-4" data-testid="document-settings">
          <h3 className="text-h3 text-fg">Document</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <SelectField id="doc-size" label="Page size" value={doc.settings.pageSize} onChange={(v) => set((d) => ({ ...d, settings: { ...d.settings, pageSize: v === 'a4' ? 'a4' : 'letter' } }))} options={[{ value: 'letter', label: 'US Letter' }, { value: 'a4', label: 'A4' }]} testId="doc-page-size" />
            <LimitedField id="doc-label" label="Header label (optional)" value={doc.settings.docLabel} max={V2_LIMITS.docLabel} onChange={(v) => set((d) => ({ ...d, settings: { ...d.settings, docLabel: v } }))} hint="Shown at the top right of every page. Empty: the title, shortened." />
          </div>
          {lengthPct >= 85 && (
            <p className={cn('rounded-md px-3 py-2 text-small', lengthPct > 100 ? 'bg-danger-bg text-danger-fg' : 'bg-warning-bg text-warning-fg')} data-testid="length-warning">
              {lengthPct > 100
                ? 'This proposal is over the length limit: the components past the limit are left out when it is saved. Shorten it or split it into two documents.'
                : `This proposal is close to the length limit (${lengthPct}% used). Keep it focused, or split it into two documents.`}
            </p>
          )}
        </Card>

        <Card className="flex flex-col gap-3 p-4" data-testid="cover-editor" id="proposal-cover">
          <h3 className="text-h3 text-fg">Cover</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <LimitedField id="cover-title" label="Title *" value={cover.title} max={L.title} onChange={(v) => setCover({ title: v })} testId="cover-title" hint="The client’s outcome, with their name in it." />
              {coverCheck('title')}
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <LimitedField id="cover-lead" label="Lead" value={cover.lead} max={L.lead} multi onChange={(v) => setCover({ lead: v })} testId="cover-lead" />
              {coverCheck('lead')}
            </div>
            <div className="flex flex-col gap-1.5">
              <LimitedField id="cover-client" label="Client company *" value={cover.clientCompany} max={L.clientCompany} onChange={(v) => setCover({ clientCompany: v })} testId="cover-client" />
              {coverCheck('clientCompany')}
            </div>
            <div className="flex flex-col gap-1.5">
              <LimitedField id="cover-doctype" label="Document label" value={cover.docType} max={L.docType} onChange={(v) => setCover({ docType: v })} />
              {coverCheck('docType')}
            </div>
            <div className="flex flex-col gap-1.5">
              <LimitedField id="cover-date" label="Date (optional)" value={cover.date} max={L.date} onChange={(v) => setCover({ date: v })} />
              {coverCheck('date')}
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-md border border-line p-3" data-testid="cover-stats">
            <SwitchRow label="Stat strip (3 figures)" checked={cover.stats.length === 3} onChange={(v) => setCover({ stats: v ? [0, 1, 2].map(() => ({ value: '', label: '' })) : [], highlight: v ? 2 : null })} testId="cover-stats-switch" />
            {cover.stats.length === 3 && (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  {cover.stats.map((st, i) => (
                    <div key={i} className="flex flex-col gap-2">
                      <LimitedField id={`cover-stat-v${i}`} label={`Value ${i + 1}`} value={st.value} max={L.statValue} onChange={(v) => setCover({ stats: cover.stats.map((x, j) => (j === i ? { ...x, value: v } : x)) })} />
                      <LimitedField id={`cover-stat-l${i}`} label={`Label ${i + 1}`} value={st.label} max={L.statLabel} onChange={(v) => setCover({ stats: cover.stats.map((x, j) => (j === i ? { ...x, label: v } : x)) })} />
                    </div>
                  ))}
                </div>
                <SelectField id="cover-hl" label="Crimson figure" value={cover.highlight === null ? '' : String(cover.highlight)} onChange={(v) => setCover({ highlight: v === '' ? null : Number(v) })} options={highlightOptions(3, (i) => `Figure ${i + 1}`)} testId="cover-highlight" />
              </>
            )}
            {coverCheck('stats')}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-md border border-line p-3">
              <p className="text-body-strong text-fg">Prepared for (signs for the client)</p>
              <LimitedField id="pf-name" label="Name" value={cover.preparedFor.name} max={L.name} onChange={(v) => setCover({ preparedFor: { ...cover.preparedFor, name: v } })} testId="cover-contact" />
              <LimitedField id="pf-title" label="Job title" value={cover.preparedFor.title} max={L.forTitle} onChange={(v) => setCover({ preparedFor: { ...cover.preparedFor, title: v } })} />
              <LimitedField id="pf-url" label="Website (optional)" value={cover.preparedFor.url} max={L.url} onChange={(v) => setCover({ preparedFor: { ...cover.preparedFor, url: v } })} />
              {coverCheck('preparedFor')}
            </div>
            <div className="flex flex-col gap-2 rounded-md border border-line p-3">
              <p className="text-body-strong text-fg">Prepared by (your sign-off)</p>
              <LimitedField id="pb-name" label="Name" value={cover.preparedBy.name} max={L.name} onChange={(v) => setCover({ preparedBy: { ...cover.preparedBy, name: v } })} />
              <LimitedField id="pb-title" label="Title line" value={cover.preparedBy.title} max={L.byTitle} onChange={(v) => setCover({ preparedBy: { ...cover.preparedBy, title: v } })} />
              <LimitedField id="pb-cred" label="Credential (optional)" value={cover.preparedBy.credential} max={L.credential} onChange={(v) => setCover({ preparedBy: { ...cover.preparedBy, credential: v } })} />
              <LimitedField id="pb-url" label="Website (optional)" value={cover.preparedBy.url} max={L.url} onChange={(v) => setCover({ preparedBy: { ...cover.preparedBy, url: v } })} />
              <p className="text-caption text-fg-tertiary">From Agreements settings. The client-logo slot stays empty for now.</p>
            </div>
          </div>
        </Card>

        {doc.sections.map((s, i) => (
          <SectionEditor key={s.id} s={s} i={i} count={doc.sections.length} set={setSection(s.id)} remove={() => setRemoving(s)} moveBy={(d) => set((x) => ({ ...x, sections: move(x.sections, i, d) }))} />
        ))}
        {doc.sections.length === 0 && <p className="rounded-md border border-dashed border-line-strong p-4 text-body text-fg-secondary">No sections yet. Add one below.</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Plus />} onClick={() => set((d) => ({ ...d, sections: [...d.sections, emptySectionV2('content')].slice(0, V2_LIMITS.sections) }))} disabled={doc.sections.length >= V2_LIMITS.sections} data-testid="section-add">
            Add section
          </Button>
          <Button variant="secondary" icon={<Receipt />} onClick={() => set((d) => ({ ...d, sections: [...d.sections, emptySectionV2('pricing')].slice(0, V2_LIMITS.sections) }))} data-testid="section-add-pricing">
            Add pricing section
          </Button>
          <Button variant="secondary" icon={<Scale />} onClick={() => set((d) => ({ ...d, sections: [...d.sections, emptySectionV2('terms')].slice(0, V2_LIMITS.sections) }))} data-testid="section-add-terms">
            Add terms section
          </Button>
        </div>

        <Card className="flex flex-col gap-3 p-4" data-testid="acceptance-editor" id="proposal-acceptance">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-h3 text-fg">
              <FileSignature className="size-4" aria-hidden /> Acceptance page
            </h3>
            <Badge tone={doc.settings.signable ? 'brand' : 'neutral'}>{doc.settings.signable ? 'Signable' : 'View only: no Acceptance page'}</Badge>
          </div>
          <p className="text-small text-fg-secondary">Always the last page. The client signs, then you countersign; at completion both signatures are placed here too. You choose signable or view-only when you send.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <LimitedField id="acc-eyebrow" label="Eyebrow" value={doc.acceptance.eyebrow} max={V2_LIMITS.acceptance.eyebrow} onChange={(v) => set((d) => ({ ...d, acceptance: { ...d.acceptance, eyebrow: v } }))} />
            <LimitedField id="acc-title" label="Heading" value={doc.acceptance.title} max={V2_LIMITS.acceptance.title} onChange={(v) => set((d) => ({ ...d, acceptance: { ...d.acceptance, title: v } }))} />
            <LimitedField id="acc-lead" label="Acceptance line" value={doc.acceptance.lead} max={V2_LIMITS.acceptance.lead} multi className="md:col-span-2" onChange={(v) => set((d) => ({ ...d, acceptance: { ...d.acceptance, lead: v } }))} testId="acceptance-line" hint="Only what signing commits the client to, word for word from your terms. Bold the amount with **…**." />
          </div>
          <CheckNote note={doc.acceptance.check} onClear={() => set((d) => ({ ...d, acceptance: { ...d.acceptance, check: undefined } }))} />
          {doc.settings.signable && acceptancePending(doc) && (
            <div className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-warning-400/60 bg-warning-bg px-3 py-2 text-small text-warning-fg" data-testid="acceptance-check">
              <span className="flex items-start gap-1.5">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  <span className="font-semibold">Check:</span> {ACCEPTANCE_CHECK}
                </span>
              </span>
              <Button size="sm" variant="secondary" onClick={() => set((d) => ({ ...d, acceptance: { ...d.acceptance, confirmedLine: d.acceptance.lead } }))} disabled={!doc.acceptance.lead.trim()} data-testid="acceptance-confirm">
                I confirm this line
              </Button>
            </div>
          )}
          {doc.settings.signable && !hasUatTerms(doc) && (
            // No override: the check clears only when UAT sign-off terms are in the terms, pricing, gates or acceptance line.
            <CheckNote note={UAT_CHECK} testId="uat-check" />
          )}
        </Card>

        <Card className="flex flex-col gap-3 p-4" data-testid="closing-editor">
          <h3 className="text-h3 text-fg">Closing band</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <LimitedField id="cl-label" label="Label" value={doc.closing.label} max={V2_LIMITS.closing.label} onChange={(v) => set((d) => ({ ...d, closing: { ...d.closing, label: v } }))} />
            <LimitedField id="cl-head" label="Headline" value={doc.closing.headline} max={V2_LIMITS.closing.headline} onChange={(v) => set((d) => ({ ...d, closing: { ...d.closing, headline: v } }))} hint="The brand promise. Your contact details come from the cover." />
          </div>
        </Card>

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
        description={`“${removing ? sectionName(removing, 0) : ''}” and everything in it will be removed from the proposal.`}
        confirmLabel="Delete section"
        icon={<Trash2 />}
      />
    </div>
  );
}
