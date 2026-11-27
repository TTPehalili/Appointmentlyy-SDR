'use client';

/**
 * Admin › Do Not Contact: the workspace's list (admins only; the server refuses everyone else), removing one entry
 * with a note, and "Undo entries added by a teammate" between two times with a note (for a mistaken or malicious
 * mass "Do not call"). Every removal is kept on the server with who, when and the note.
 */
import { useMemo, useState } from 'react';
import { ShieldAlert, Undo2 } from 'lucide-react';
import { Badge, Button, Dialog, EmptyState, Field, Input, PageHeader, Select, Textarea } from '@/components/ui';
import { useSession } from '@/lib/session';
import { SUPPRESSION_REASON_LABEL } from '@/lib/suppression';
import { removeSuppression, undoSuppressionsBy, useSuppressionList, type AdminListItem } from '@/lib/suppressionClient';

const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function DoNotContactManager() {
  const { session } = useSession();
  const key = session.tenantCode ? `${session.tenantCode}|${(session.email || '').toLowerCase()}` : null;
  const list = useSuppressionList(key);

  const [removing, setRemoving] = useState<AdminListItem | null>(null);
  const [removeNote, setRemoveNote] = useState('');
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const authors = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of list.entries) if (e.createdByEmail && !m.has(e.createdByEmail)) m.set(e.createdByEmail, e.createdByName || e.createdByEmail);
    return [...m.entries()].map(([email, name]) => ({ email, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [list.entries]);
  const [undoBy, setUndoBy] = useState('');
  const [undoFrom, setUndoFrom] = useState(() => toLocalInput(new Date(Date.now() - 24 * 3600_000)));
  const [undoTo, setUndoTo] = useState(() => toLocalInput(new Date(Date.now() + 5 * 60_000)));
  const [undoNote, setUndoNote] = useState('');
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoResult, setUndoResult] = useState<{ ok: boolean; text: string } | null>(null);
  const undoAuthor = undoBy || authors[0]?.email || '';
  const fromMs = Date.parse(undoFrom);
  const toMs = Date.parse(undoTo);
  const undoPreview = list.entries.filter((e) => {
    const t = Date.parse(e.createdAt);
    return e.createdByEmail === undoAuthor && t >= fromMs && t <= toMs;
  }).length;

  if (list.status === 'forbidden') {
    return <EmptyState icon={<ShieldAlert />} title="Admins only" description="Only workspace admins can see and change the Do Not Contact list." />;
  }

  const submitUndo = async () => {
    if (undoBusy || !undoAuthor || undoNote.trim().length < 3) return;
    setUndoBusy(true);
    setUndoResult(null);
    const r = await undoSuppressionsBy({ addedBy: undoAuthor, from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), note: undoNote.trim() });
    setUndoBusy(false);
    if (r.ok) {
      setUndoNote('');
      setUndoResult({ ok: true, text: `Removed ${r.removed} ${r.removed === 1 ? 'entry' : 'entries'}. Your note was saved with each removal.` });
    } else {
      setUndoResult({ ok: false, text: r.message });
    }
  };

  const submitRemove = async () => {
    if (!removing || removeBusy) return;
    setRemoveBusy(true);
    setRemoveError(null);
    const r = await removeSuppression([removing.id], removeNote.trim());
    setRemoveBusy(false);
    if (r.ok) {
      setRemoving(null);
      setRemoveNote('');
    } else {
      setRemoveError(r.message);
    }
  };

  return (
    <div className="space-y-6" data-testid="dnc-admin">
      <PageHeader
        title="Do Not Contact"
        count={list.status === 'ready' ? list.entries.length : undefined}
        description="Phone numbers and emails nobody in this workspace may call or email. Reps add them with a Do not call outcome in the Dialer."
      />
      {list.status === 'unavailable' && (
        <p className="text-small text-warning-fg">{list.message || 'The Do Not Contact list is not set up on this server yet.'}</p>
      )}
      {list.status === 'error' && <p role="alert" className="text-small text-danger-fg">{list.message}</p>}

      {/* Undo a teammate's additions */}
      <section className="rounded-lg border border-line bg-surface p-4 space-y-3" data-testid="dnc-undo">
        <div className="flex items-center gap-2">
          <Undo2 className="size-4 text-fg-secondary" aria-hidden />
          <h2 className="text-h3 text-fg">Undo entries added by a teammate</h2>
        </div>
        <p className="text-small text-fg-secondary">
          Takes off every entry one person added in a period, for example after a mistaken or deliberate mass &ldquo;Do not call&rdquo;. Each entry is kept with your note.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Added by" htmlFor="dnc-undo-by">
            <Select id="dnc-undo-by" data-testid="dnc-undo-by" value={undoAuthor} onChange={(e) => setUndoBy(e.target.value)} disabled={authors.length === 0}>
              {authors.length === 0 && <option value="">Nobody yet</option>}
              {authors.map((a) => (
                <option key={a.email} value={a.email}>
                  {a.name} ({a.email})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From" htmlFor="dnc-undo-from">
            <Input id="dnc-undo-from" data-testid="dnc-undo-from" type="datetime-local" value={undoFrom} onChange={(e) => setUndoFrom(e.target.value)} />
          </Field>
          <Field label="To" htmlFor="dnc-undo-to">
            <Input id="dnc-undo-to" data-testid="dnc-undo-to" type="datetime-local" value={undoTo} onChange={(e) => setUndoTo(e.target.value)} />
          </Field>
        </div>
        <Field label="Why may these contacts be contacted again? (required)" htmlFor="dnc-undo-note">
          <Textarea id="dnc-undo-note" data-testid="dnc-undo-note" rows={2} maxLength={300} value={undoNote} onChange={(e) => setUndoNote(e.target.value)} placeholder="e.g. Added by mistake from a bulk outcome; checked with the rep." />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="danger"
            data-testid="dnc-undo-submit"
            loading={undoBusy}
            disabled={!undoAuthor || undoNote.trim().length < 3 || !Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs}
            onClick={submitUndo}
          >
            Undo entries
          </Button>
          {undoAuthor && Number.isFinite(fromMs) && Number.isFinite(toMs) && (
            <span className="text-small text-fg-secondary" data-testid="dnc-undo-preview">
              {undoPreview} {undoPreview === 1 ? 'entry' : 'entries'} in the list below match.
            </span>
          )}
        </div>
        {undoResult && (
          <p data-testid="dnc-undo-result" role={undoResult.ok ? 'status' : 'alert'} className={`text-small ${undoResult.ok ? 'text-success-fg' : 'text-danger-fg'}`}>
            {undoResult.text}
          </p>
        )}
      </section>

      {/* The list */}
      {list.status === 'ready' && list.entries.length === 0 ? (
        <EmptyState icon={<ShieldAlert />} title="Nobody on the list" description="Contacts marked Do not call in the Dialer appear here." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[640px] text-left text-small" data-testid="dnc-admin-table">
            <thead className="border-b border-line text-caption text-fg-tertiary">
              <tr>
                <th className="px-3 py-2 font-medium">Contact</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Added by</th>
                <th className="px-3 py-2 font-medium">Added</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.entries.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">
                    <Badge tone="neutral" className="mr-2">{e.kind === 'phone' ? 'Phone' : 'Email'}</Badge>
                    <span className="font-mono text-fg">{e.value}</span>
                  </td>
                  <td className="px-3 py-2 text-fg-secondary">{SUPPRESSION_REASON_LABEL[e.reason] ?? e.reason}</td>
                  <td className="px-3 py-2 text-fg-secondary">{e.createdByName || e.createdByEmail}</td>
                  <td className="px-3 py-2 text-fg-secondary tabular-nums">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="secondary" size="sm" onClick={() => { setRemoving(e); setRemoveNote(''); setRemoveError(null); }}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Remove from the Do Not Contact list?"
        description="Only do this if the contact has asked to be contacted again, or the entry was a mistake."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" loading={removeBusy} disabled={removeNote.trim().length < 3} onClick={submitRemove}>Remove</Button>
          </>
        }
      >
        <Field label="Why may this contact be contacted again? (required)" htmlFor="dnc-admin-remove-note">
          <Textarea id="dnc-admin-remove-note" rows={3} maxLength={300} value={removeNote} onChange={(e) => setRemoveNote(e.target.value)} />
        </Field>
        {removeError && <p role="alert" className="mt-2 text-small text-danger-fg">{removeError}</p>}
      </Dialog>
    </div>
  );
}
