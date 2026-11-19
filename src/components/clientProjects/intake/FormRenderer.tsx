'use client';

/**
 * Client Intake: the ONE renderer for an intake schema. The client fills it in on the shared board; the owner sees the
 * same fields read-only (preview and submitted versions). Validation messages come from the shared validator
 * (src/lib/clientProjects/intake.ts validateAnswers), which the server runs again on every save and submit.
 */
import * as React from 'react';
import { FileText, Plus, Trash2, Upload, X } from 'lucide-react';
import { Button, Checkbox, Field, IconButton, Input, Select, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  FILE_KIND_LABEL,
  FILE_KIND_MIME,
  INTAKE_LIMITS,
  acceptOf,
  answerText,
  type AnswerValue,
  type Answers,
  type IntakeField,
  type IntakeSchema,
  type PublicIntakeFile,
  type TableRow,
} from '@/lib/clientProjects/intake';

export type UploadResult = { ok: boolean; error?: string; file?: PublicIntakeFile; csv?: { rows: TableRow[]; unmatched: string[]; error?: string } };
export type Uploader = (field: string, file: File, onProgress: (pct: number) => void) => Promise<UploadResult>;

export const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const kindLabel = (mime: string) => (Object.entries(FILE_KIND_MIME).find(([, m]) => m === mime)?.[0] ?? 'file').toUpperCase();
const ACCEPT_ATTR: Record<string, string> = { pdf: '.pdf,application/pdf', docx: '.docx', xlsx: '.xlsx', csv: '.csv,text/csv', txt: '.txt,text/plain', png: '.png,image/png', jpg: '.jpg,.jpeg,image/jpeg', svg: '.svg,image/svg+xml' };

export function FormFields({
  schema,
  fields,
  values,
  errors = {},
  files,
  readOnly,
  onChange,
  upload,
  onRemoveFile,
  localPreview,
  idPrefix = 'cpi',
}: {
  schema: IntakeSchema;
  /** Only these fields (one step); default all. */
  fields?: IntakeField[];
  values: Answers;
  errors?: Record<string, string>;
  files: PublicIntakeFile[];
  readOnly?: boolean;
  onChange?: (key: string, v: AnswerValue | undefined) => void;
  upload?: Uploader;
  onRemoveFile?: (fileId: string) => void;
  /** Object URLs of logo files picked in this session (the board never serves uploads back). */
  localPreview?: Record<string, string>;
  idPrefix?: string;
}) {
  const list = fields ?? schema.fields;
  const set = (k: string, v: AnswerValue | undefined) => onChange?.(k, v);
  return (
    <div className="flex flex-col gap-4">
      {list.map((f) => {
        const id = `${idPrefix}-${f.key}`;
        const v = values[f.key];
        const err = errors[f.key];
        const label = `${f.label}${f.required ? '' : ' (optional)'}`;
        if (readOnly) {
          return (
            <div key={f.key} className="flex flex-col gap-1" data-testid="cpi-ro-field" data-key={f.key}>
              <span className="text-caption text-fg-tertiary">{f.label}</span>
              {f.type === 'table' ? (
                <ReadTable field={f} rows={Array.isArray(v) ? (v as TableRow[]) : []} />
              ) : f.type === 'file' ? (
                <ul className="flex flex-col gap-0.5">
                  {(Array.isArray(v) ? (v as string[]) : []).map((fid) => {
                    const file = files.find((x) => x.id === fid);
                    return (
                      <li key={fid} className="text-body text-fg">
                        <FileText className="mr-1 inline size-3.5 text-fg-tertiary" aria-hidden />
                        {file?.name ?? 'file'} <span className="cp-mono text-caption text-fg-tertiary">{file ? `${kindLabel(file.mime)} · ${fmtSize(file.size)}` : ''}</span>
                      </li>
                    );
                  })}
                  {!(Array.isArray(v) && v.length) && <li className="text-body text-fg-tertiary">None</li>}
                </ul>
              ) : f.type === 'color' && typeof v === 'string' ? (
                <span className="inline-flex items-center gap-2 text-body text-fg">
                  <span aria-hidden className="inline-block size-4 rounded-sm border border-line" style={{ background: v }} />
                  <span className="cp-mono">{v}</span>
                </span>
              ) : (
                <span className="whitespace-pre-wrap break-words text-body text-fg">{answerText(f, v) || <span className="text-fg-tertiary">Not answered</span>}</span>
              )}
            </div>
          );
        }
        switch (f.type) {
          case 'text':
          case 'email':
          case 'phone':
          case 'url':
          case 'date':
            return (
              <Field key={f.key} label={label} htmlFor={id} hint={f.help} error={err}>
                <Input
                  id={id}
                  type={f.type === 'phone' ? 'tel' : f.type === 'text' ? 'text' : f.type}
                  value={typeof v === 'string' ? v : ''}
                  maxLength={f.type === 'text' ? Math.min(f.max ?? INTAKE_LIMITS.text, INTAKE_LIMITS.text) : 300}
                  onChange={(e) => set(f.key, e.target.value)}
                  autoComplete="off"
                  data-testid="cpi-input"
                  data-key={f.key}
                  inputMode={f.type === 'phone' ? 'tel' : f.type === 'email' ? 'email' : f.type === 'url' ? 'url' : undefined}
                />
              </Field>
            );
          case 'textarea':
            return (
              <Field key={f.key} label={label} htmlFor={id} hint={f.help} error={err}>
                <Textarea id={id} rows={4} value={typeof v === 'string' ? v : ''} maxLength={Math.min(f.max ?? INTAKE_LIMITS.textarea, INTAKE_LIMITS.textarea)} onChange={(e) => set(f.key, e.target.value)} data-testid="cpi-input" data-key={f.key} />
              </Field>
            );
          case 'select':
            return (
              <Field key={f.key} label={label} htmlFor={id} hint={f.help} error={err}>
                <Select id={id} value={typeof v === 'string' ? v : ''} onChange={(e) => set(f.key, e.target.value || undefined)} data-testid="cpi-input" data-key={f.key}>
                  <option value="">Choose…</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              </Field>
            );
          case 'multiselect': {
            const cur = Array.isArray(v) ? (v as string[]) : [];
            return (
              <fieldset key={f.key} className="flex flex-col gap-1.5" data-testid="cpi-multi" data-key={f.key}>
                <legend className="mb-1 text-body-strong text-fg">{label}</legend>
                {f.help && <p className="text-caption text-fg-tertiary">{f.help}</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {(f.options ?? []).map((o) => (
                    <Checkbox key={o} checked={cur.includes(o)} label={o} onChange={(e) => set(f.key, e.target.checked ? [...cur, o] : cur.filter((x) => x !== o))} />
                  ))}
                </div>
                {err && <p className="text-caption text-danger-fg">{err}</p>}
              </fieldset>
            );
          }
          case 'color':
            return (
              <Field key={f.key} label={label} htmlFor={id} hint={f.help} error={err}>
                <div className="flex items-center gap-2">
                  <input type="color" aria-label={`${f.label} picker`} value={typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '#111827'} onChange={(e) => set(f.key, e.target.value.toUpperCase())} className="h-9 w-12 cursor-pointer rounded-md border border-line bg-surface p-0.5" data-testid="cpi-color" data-key={f.key} />
                  <Input id={id} value={typeof v === 'string' ? v : ''} placeholder="#RRGGBB" maxLength={7} onChange={(e) => set(f.key, e.target.value.trim())} className="cp-mono w-32" data-testid="cpi-input" data-key={f.key} />
                </div>
              </Field>
            );
          case 'confirm':
            return (
              <div key={f.key} className="flex flex-col gap-1">
                <Checkbox checked={v === true} label={f.label} onChange={(e) => set(f.key, e.target.checked ? true : undefined)} data-testid="cpi-confirm" data-key={f.key} />
                {err && <p className="text-caption text-danger-fg">{err}</p>}
              </div>
            );
          case 'table':
            return <TableField key={f.key} field={f} rows={Array.isArray(v) ? (v as TableRow[]) : []} errors={errors} onRows={(rows) => set(f.key, rows)} upload={upload} />;
          case 'file':
            return <FileField key={f.key} field={f} ids={Array.isArray(v) ? (v as string[]) : []} files={files} error={err} upload={upload} onIds={(ids) => set(f.key, ids)} onRemoveFile={onRemoveFile} />;
          default:
            return null;
        }
      })}
      {list.some((f) => f.type === 'color' && f.preview === 'brand') && <BrandPreview values={values} files={files} localPreview={localPreview} />}
    </div>
  );
}

function ReadTable({ field, rows }: { field: IntakeField; rows: TableRow[] }) {
  if (!rows.length) return <span className="text-body text-fg-tertiary">No rows</span>;
  return (
    <div className="overflow-x-auto">
      <table className="cpi-table" data-testid="cpi-ro-table">
        <thead>
          <tr>
            {(field.columns ?? []).map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {(field.columns ?? []).map((c) => (
                <td key={c.key} className="text-fg">
                  {r[c.key] || <span className="text-fg-tertiary">-</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableField({ field, rows, errors, onRows, upload }: { field: IntakeField; rows: TableRow[]; errors: Record<string, string>; onRows: (rows: TableRow[]) => void; upload?: Uploader }) {
  const cols = field.columns ?? [];
  const max = Math.min(field.max ?? INTAKE_LIMITS.tableRows, INTAKE_LIMITS.tableRows);
  const [csvNote, setCsvNote] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const shown = rows.length ? rows : [];
  const blank = (): TableRow => Object.fromEntries(cols.map((c) => [c.key, '']));
  const setCell = (i: number, k: string, v: string) => onRows(shown.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const importCsv = async (file: File | undefined) => {
    if (!file || !upload) return;
    setBusy(true);
    setCsvNote(null);
    const r = await upload(field.key, file, () => undefined);
    setBusy(false);
    if (input.current) input.current.value = '';
    if (!r.ok || !r.csv) return setCsvNote(r.error || 'The CSV could not be read.');
    if (r.csv.error) return setCsvNote(r.csv.error);
    if (rows.length && !window.confirm(`Replace the ${rows.length} row(s) in the table with the ${r.csv.rows.length} row(s) from the CSV?`)) return;
    onRows(r.csv.rows.slice(0, max));
    setCsvNote(`${Math.min(r.csv.rows.length, max)} row(s) imported${r.csv.unmatched.length ? `; ignored columns: ${r.csv.unmatched.slice(0, 5).join(', ')}` : ''}. Check them, then save.`);
  };
  return (
    <fieldset className="flex flex-col gap-2" data-testid="cpi-table" data-key={field.key}>
      <legend className="mb-1 text-body-strong text-fg">
        {field.label}
        {field.required ? '' : ' (optional)'}
      </legend>
      {field.help && <p className="text-caption text-fg-tertiary">{field.help}</p>}
      <div className="overflow-x-auto">
        <table className="cpi-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} data-testid="cpi-row">
                {cols.map((c) => {
                  const bad = errors[`${field.key}.${i}.${c.key}`];
                  return (
                    <td key={c.key} data-bad={bad ? '1' : '0'} title={bad}>
                      {c.type === 'select' ? (
                        <Select aria-label={`${c.label}, row ${i + 1}`} value={r[c.key] ?? ''} onChange={(e) => setCell(i, c.key, e.target.value)} data-col={c.key}>
                          <option value="">Choose…</option>
                          {(c.options ?? []).map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input aria-label={`${c.label}, row ${i + 1}`} type={c.type === 'email' ? 'email' : c.type === 'date' ? 'date' : c.type === 'phone' ? 'tel' : 'text'} value={r[c.key] ?? ''} maxLength={160} onChange={(e) => setCell(i, c.key, e.target.value)} data-col={c.key} />
                      )}
                      {bad && <span className="sr-only">{bad}</span>}
                    </td>
                  );
                })}
                <td>
                  <IconButton label={`Remove row ${i + 1}`} size="sm" variant="ghost" onClick={() => onRows(shown.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" icon={<Plus />} disabled={shown.length >= max} onClick={() => onRows([...shown, blank()])} data-testid="cpi-add-row">
          Add a row
        </Button>
        {field.csv && upload && (
          <>
            <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void importCsv(e.target.files?.[0])} data-testid="cpi-csv-input" aria-label="Import a CSV file" />
            <Button size="sm" variant="ghost" icon={<Upload />} loading={busy} onClick={() => input.current?.click()} data-testid="cpi-csv">
              Import CSV
            </Button>
          </>
        )}
        <span className="cp-mono text-caption text-fg-tertiary">
          {shown.length}/{max}
        </span>
      </div>
      {csvNote && <p className="text-caption text-fg-secondary" data-testid="cpi-csv-note">{csvNote}</p>}
      {errors[field.key] && <p className="text-caption text-danger-fg">{errors[field.key]}</p>}
      {Object.entries(errors)
        .filter(([k]) => k.startsWith(`${field.key}.`))
        .slice(0, 4)
        .map(([k, m]) => (
          <p key={k} className="text-caption text-danger-fg">
            Row {Number(k.split('.')[1]) + 1}: {m}
          </p>
        ))}
    </fieldset>
  );
}

function FileField({ field, ids, files, error, upload, onIds, onRemoveFile }: { field: IntakeField; ids: string[]; files: PublicIntakeFile[]; error?: string; upload?: Uploader; onIds: (ids: string[]) => void; onRemoveFile?: (fileId: string) => void }) {
  const accept = acceptOf(field);
  const max = Math.min(field.max ?? 10, INTAKE_LIMITS.filesPerRequest);
  const [over, setOver] = React.useState(false);
  const [progress, setProgress] = React.useState<{ name: string; pct: number; error?: string }[]>([]);
  const input = React.useRef<HTMLInputElement>(null);
  const mine = files.filter((f) => f.field === field.key && ids.includes(f.id));
  const add = async (list: FileList | File[] | null) => {
    if (!list || !upload) return;
    let next = [...ids];
    for (const file of Array.from(list).slice(0, max - mine.length)) {
      if (file.size > INTAKE_LIMITS.fileBytes) {
        setProgress((p) => [...p, { name: file.name, pct: 0, error: `Larger than ${Math.round(INTAKE_LIMITS.fileBytes / 1024 / 1024)} MB` }]);
        continue;
      }
      setProgress((p) => [...p.filter((x) => x.name !== file.name), { name: file.name, pct: 0 }]);
      const r = await upload(field.key, file, (pct) => setProgress((p) => p.map((x) => (x.name === file.name ? { ...x, pct } : x))));
      if (r.ok && r.file) {
        next = [...next, r.file.id];
        onIds(next);
        setProgress((p) => p.filter((x) => x.name !== file.name));
      } else setProgress((p) => p.map((x) => (x.name === file.name ? { ...x, error: r.error || 'Upload failed' } : x)));
    }
    if (input.current) input.current.value = '';
  };
  return (
    <div className="flex flex-col gap-2" data-testid="cpi-file" data-key={field.key}>
      <span className="text-body-strong text-fg">
        {field.label}
        {field.required ? '' : ' (optional)'}
      </span>
      {field.help && <p className="-mt-1 text-caption text-fg-tertiary">{field.help}</p>}
      {mine.length < max && upload && (
        <label
          className="cpi-drop focus-ring"
          data-over={over ? '1' : '0'}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void add(e.dataTransfer.files);
          }}
          data-testid="cpi-drop"
        >
          <Upload className="size-4 text-fg-tertiary" aria-hidden />
          <span className="text-small text-fg">Drop files here or choose</span>
          <span className="text-caption text-fg-tertiary">
            {accept.map((k) => FILE_KIND_LABEL[k]).join(', ')} · up to {Math.round(INTAKE_LIMITS.fileBytes / 1024 / 1024)} MB each · {max} at most
          </span>
          <input ref={input} type="file" multiple={max > 1} accept={accept.map((k) => ACCEPT_ATTR[k]).join(',')} className="sr-only" onChange={(e) => void add(e.target.files)} data-testid="cpi-file-input" />
        </label>
      )}
      {progress.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-live="polite">
          {progress.map((x) => (
            <li key={x.name} className="flex flex-col gap-1" data-testid="cpi-progress">
              <span className={cn('text-caption', x.error ? 'text-danger-fg' : 'text-fg-secondary')}>
                {x.name}: {x.error ?? `${x.pct}%`}
              </span>
              {!x.error && (
                <span className="cpi-bar">
                  <span style={{ width: `${x.pct}%` }} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {mine.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {mine.map((f) => (
            <li key={f.id} className="flex items-center gap-2 px-2.5 py-1.5" data-testid="cpi-file-row">
              <FileText className="size-4 shrink-0 text-fg-tertiary" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-small text-fg">{f.name}</span>
              <span className="cp-mono shrink-0 text-caption text-fg-tertiary">
                {kindLabel(f.mime)} · {fmtSize(f.size)}
              </span>
              {onRemoveFile && (
                <IconButton
                  label={`Remove ${f.name}`}
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onIds(ids.filter((x) => x !== f.id));
                    onRemoveFile(f.id);
                  }}
                  data-testid="cpi-file-remove"
                >
                  <X />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-caption text-danger-fg">{error}</p>}
    </div>
  );
}

/** The live preview of the client's workspace header with their colours (and the logo they picked in this session). */
export function BrandPreview({ values, files, localPreview }: { values: Answers; files: PublicIntakeFile[]; localPreview?: Record<string, string> }) {
  const primary = typeof values.primary === 'string' && /^#[0-9a-f]{6}$/i.test(values.primary) ? values.primary : '#111827';
  const secondary = typeof values.secondary === 'string' && /^#[0-9a-f]{6}$/i.test(values.secondary) ? values.secondary : null;
  const name = (typeof values.displayName === 'string' && values.displayName.trim()) || 'Your workspace';
  const logoId = Array.isArray(values.logo) ? (values.logo as string[])[0] : undefined;
  const url = logoId ? localPreview?.[logoId] : undefined;
  void files;
  return (
    <div className="flex flex-col gap-1.5" data-testid="cpi-brand-preview">
      <span className="text-caption text-fg-tertiary">Preview of your workspace header</span>
      <div className="cpi-brand">
        <div className="cpi-brand-head" style={{ background: primary }}>
          <span className="cpi-brand-mark">{url ? <img src={url} alt="" /> : name.slice(0, 2).toUpperCase()}</span>
          <span className="text-body-strong">{name}</span>
          <span className="ml-auto text-caption opacity-80">Dialer · Inbox · Reports</span>
        </div>
        <div className="flex items-center gap-2 bg-surface px-3 py-2">
          <span className="rounded-md px-2.5 py-1 text-caption font-medium text-white" style={{ background: primary }}>
            Primary button
          </span>
          {secondary && (
            <span className="rounded-md px-2.5 py-1 text-caption font-medium" style={{ background: secondary, color: '#fff' }}>
              Secondary
            </span>
          )}
          <span className="text-caption text-fg-tertiary">{url ? 'Logo from your file' : logoId ? 'Logo uploaded (shown after we apply it)' : 'No logo yet'}</span>
        </div>
      </div>
    </div>
  );
}
