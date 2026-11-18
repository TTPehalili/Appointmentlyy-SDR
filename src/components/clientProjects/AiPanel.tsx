'use client';

/**
 * Documents & AI: upload or attach the signed PDFs (the plan drafts itself), review the draft, and
 * approve it with one click. Also the status-update drafts. Nothing here reaches the client until
 * the owner approves it.
 */
import * as React from 'react';
import { Check, Copy, FileText, Pencil, Sparkles, Trash2, Upload } from 'lucide-react';
import { Badge, Button, Card, Checkbox, EmptyState, IconButton, Input, Select, Skeleton, Textarea, useToast } from '@/components/ui';
import { apiJson } from '@/lib/authClient';
import { copyText } from '@/components/agreements/ownerShared';
import { PHASES, PHASE_LABEL, PRIORITIES, PRIORITY_LABEL, PROPOSAL_KIND_LABEL, addBusinessDays, fmtAt, fmtDate, type CpFileMeta, type OwnerProjectView, type Priority, type Proposal, type ProposalTask, type StatusDraft } from '@/lib/clientProjects/types';
import { Note, PriorityMark, SideChip, type AiResponse } from '@/components/clientProjects/shared';
import { AiStage, useAiProgress } from '@/components/clientProjects/AiStage';

interface FilesResponse {
  files: CpFileMeta[];
  agreements: { id: string; title: string; completedAt: string | null; attached: boolean }[];
  limits: { bytes: number; files: number };
}

type Edit = { title?: string; ownerSide?: 'us' | 'client'; dueOffsetBd?: number; priority?: Priority | null };

export function AiPanel({ project, onChanged }: { project: OwnerProjectView; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const id = project.id;
  const [files, setFiles] = React.useState<FilesResponse | null>(null);
  const [ai, setAi] = React.useState<AiResponse | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [busy, setBusy] = React.useState('');
  const [agreementId, setAgreementId] = React.useState('');
  const [filesError, setFilesError] = React.useState<string | null>(null);
  const [watched, setWatched] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const reviewRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    const [f, a] = await Promise.all([apiJson<FilesResponse>(`/api/client-projects/${id}/files`), apiJson<AiResponse>(`/api/client-projects/${id}/ai`)]);
    // A failed document list is said out loud: it must never look like "no documents".
    if (f.success) {
      setFiles(f);
      setFilesError(null);
    } else setFilesError(f.error || 'The document list could not be loaded.');
    if (a.success) setAi(a);
  }, [id]);
  React.useEffect(() => {
    void load();
  }, [load]);
  // While a draft is being written, the stage polls its own progress (1 query every 1.5 s).
  const running = ai?.run?.status === 'running';
  React.useEffect(() => {
    if (running) setWatched(true);
  }, [running]);
  const live = useAiProgress(id, running, () => void load().then(() => onChanged()));

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    for (const file of Array.from(list)) {
      const res = await fetch(`/api/client-projects/${id}/files`, { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(file.name) }, body: file });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      toast({ message: res.ok && data.success ? `${file.name} added${ai?.ai === 'off' ? '' : '. Drafting the plan…'}` : data.error || `Could not add ${file.name}.` });
    }
    setUploading(false);
    if (input.current) input.current.value = '';
    await load();
    await onChanged();
  };
  const attach = async () => {
    if (!agreementId) return;
    setUploading(true);
    const r = await apiJson(`/api/client-projects/${id}/files`, { body: { agreementId } });
    setUploading(false);
    toast({ message: r.success ? 'Signed agreement attached' : r.error || 'Could not attach it.' });
    setAgreementId('');
    await load();
    await onChanged();
  };
  const removeFile = async (f: CpFileMeta) => {
    const r = await apiJson(`/api/client-projects/${id}/files?fileId=${f.id}`, { method: 'DELETE' });
    toast({ message: r.success ? `${f.name} removed` : r.error || 'Could not remove it.' });
    await load();
  };
  const act = async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(action);
    const r = await apiJson<{ created?: number; updated?: number }>(`/api/client-projects/${id}/ai`, { body: { action, ...body } });
    setBusy('');
    if (!r.success) toast({ message: r.error || 'That did not work. Try again.' });
    else if (action === 'approve') toast({ message: `Plan approved: ${r.created} cards created, ${r.updated} updated` });
    else if (action === 'discard') toast({ message: 'Draft discarded' });
    await load();
    await onChanged();
    return r.success;
  };

  const attachable = (files?.agreements ?? []).filter((a) => !a.attached);
  const run = ai?.run ?? null;

  return (
    <div className="flex flex-col gap-6" data-testid="cp-ai-panel">
      {ai?.ai === 'off' && <Note>{ai.message}</Note>}
      {ai?.ai === 'stub' && <Note>Test server: the AI planner returns a canned draft (no AI key is used).</Note>}

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-h3 text-fg">Signed documents</h2>
            <p className="mt-0.5 text-small text-fg-secondary">
              PDF only, up to {files ? Math.floor(files.limits.bytes / 1024 / 1024) : 9} MB each. Stored privately; never shown on the client board.
              {ai?.ai !== 'off' && ' The plan is drafted as soon as a document is added.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {attachable.length > 0 && (
              <>
                <div className="w-60">
                <Select aria-label="Attach a completed agreement" value={agreementId} onChange={(e) => setAgreementId(e.target.value)}>
                  <option value="">Attach a signed agreement…</option>
                  {attachable.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </Select>
                </div>
                <Button variant="secondary" onClick={() => void attach()} disabled={!agreementId || uploading}>
                  Attach
                </Button>
              </>
            )}
            <input ref={input} type="file" accept="application/pdf,.pdf" multiple className="sr-only" aria-label="Upload PDFs" data-testid="cp-upload-input" onChange={(e) => void upload(e.target.files)} />
            <Button variant="primary" icon={<Upload />} loading={uploading} onClick={() => input.current?.click()}>
              Upload PDFs
            </Button>
          </div>
        </div>
        {!files ? (
          <Skeleton className="mt-4 h-10 w-full" />
        ) : files.files.length === 0 ? (
          <p className="mt-4 text-small text-fg-tertiary">No documents yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-md border border-line">
            {files.files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="size-4 shrink-0 text-fg-tertiary" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-body text-fg">{f.name}</p>
                    <p className="truncate text-caption text-fg-tertiary">
                      {f.pages} pages · {(f.size / 1024).toFixed(0)} KB · {f.source === 'upload' ? 'Uploaded' : 'From Agreements'} {fmtAt(f.createdAt)} · SHA-256 {f.sha256.slice(0, 12)}…
                    </p>
                  </div>
                </div>
                <IconButton label={`Remove ${f.name}`} size="sm" variant="ghost" onClick={() => void removeFile(f)}>
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {filesError && (
        <Note tone="warning">
          <span data-testid="cp-files-error">{filesError}</span>
        </Note>
      )}
      {run && (run.status === 'draft' || run.status === 'approved') && files && files.files.length === 0 && run.fileIds.length > 0 && (
        <Note tone="warning">
          <span data-testid="cp-files-missing">
            This plan was drafted from {run.fileIds.length} document{run.fileIds.length === 1 ? '' : 's'} that {run.fileIds.length === 1 ? 'is' : 'are'} no longer listed here. Approving or re-running a plan never removes documents: if you did not remove them, report this (the run id is {run.id.slice(0, 8)}).
          </span>
        </Note>
      )}
      {run?.status === 'running' && (
        <div data-testid="cp-ai-running">
          <AiStage run={live ?? run} onReview={() => undefined} onDiscard={() => void act('discard')} onRetry={() => void act('retry')} onUseSop={() => undefined} />
        </div>
      )}
      {run?.status === 'draft' && watched && (
        <AiStage run={live && live.id === run.id ? live : run} onReview={() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} onDiscard={() => void act('discard')} onRetry={() => void act('retry')} onUseSop={() => undefined} />
      )}
      {/* A run watched in this session ends on the stage itself (the robot's puzzled pose and the reason); otherwise the plain card. */}
      {run?.status === 'failed' && watched && (
        <AiStage run={live && live.id === run.id ? live : run} onReview={() => undefined} onDiscard={() => void act('discard')} onRetry={() => void act('retry')} onUseSop={() => undefined} />
      )}
      {run?.status === 'failed' && !watched && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-warning-400/50 p-4" data-testid="cp-ai-failed">
          <p className="text-body text-fg">{run.error || 'The draft failed.'}</p>
          {ai?.ai !== 'off' && (files?.files.length ?? 0) > 0 && (
            <Button variant="secondary" onClick={() => void act('retry')} loading={busy === 'retry'}>
              Try again
            </Button>
          )}
        </Card>
      )}
      {run?.status === 'approved' && (
        <Note>
          Plan approved {fmtAt(run.updatedAt)}. The cards are on the board. Add another document to draft an updated plan.
        </Note>
      )}
      {run?.status === 'draft' && run.proposal && (
        <div ref={reviewRef}>
          <Review key={run.id} project={project} proposal={run.proposal} busy={busy} onApprove={(edits) => act('approve', { edits })} onDiscard={() => act('discard')} />
        </div>
      )}

      {ai && !run && files && files.files.length === 0 && ai.ai !== 'off' && (
        <EmptyState icon={<Sparkles />} title="Upload the signed documents" description="The AI reads the proposal and annexes, then drafts the milestones, task cards, deadlines, summary and briefing for you to approve." className="py-8" />
      )}

      <StatusUpdate project={project} draft={ai?.statusDraft ?? null} busy={busy === 'status-update'} onDraft={() => act('status-update')} onChanged={onChanged} />
    </div>
  );
}

function Review({ project, proposal, busy, onApprove, onDiscard }: { project: OwnerProjectView; proposal: Proposal; busy: string; onApprove: (edits: Record<string, unknown>) => Promise<boolean>; onDiscard: () => Promise<boolean> }) {
  const [removed, setRemoved] = React.useState<Set<number>>(new Set());
  const [dropPeople, setDropPeople] = React.useState<Set<number>>(new Set());
  const [edits, setEdits] = React.useState<Record<number, Edit>>({});
  const [editing, setEditing] = React.useState<number | null>(null);
  const [summary, setSummary] = React.useState(proposal.summaryClient);
  const [briefing, setBriefing] = React.useState(proposal.briefingInternal);
  const rows = proposal.tasks.map((t, i) => ({ t: { ...t, ...edits[i] } as ProposalTask, i }));
  const kept = rows.filter((r) => !removed.has(r.i)).length;
  const patch = (i: number, e: Edit) => setEdits((all) => ({ ...all, [i]: { ...all[i], ...e } }));
  const approve = () =>
    onApprove({
      remove: [...removed],
      removePeople: [...dropPeople],
      tasks: edits,
      ...(summary !== proposal.summaryClient ? { summaryClient: summary } : {}),
      ...(briefing !== proposal.briefingInternal ? { briefingInternal: briefing } : {}),
    });

  return (
    <Card className="flex flex-col gap-5 p-4" data-testid="cp-ai-review">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-h3 text-fg">Draft plan to review</h2>
          <p className="mt-0.5 text-small text-fg-secondary">Nothing is on the board or visible to the client until you approve. Edits are optional.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => void onDiscard()} loading={busy === 'discard'}>
            Discard
          </Button>
          <Button variant="brand" icon={<Check />} onClick={() => void approve()} loading={busy === 'approve'} disabled={kept === 0} data-testid="cp-ai-approve">
            Approve plan
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-body-strong text-fg">Summary for the client</span>
          <Textarea rows={5} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={1500} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-body-strong text-fg">Internal briefing</span>
          <Textarea rows={5} value={briefing} onChange={(e) => setBriefing(e.target.value)} maxLength={5000} />
        </label>
      </div>

      {(proposal.keyDates.length > 0 || proposal.fees.length > 0 || proposal.risks.length > 0) && (
        <div className="grid gap-4 text-small text-fg-secondary md:grid-cols-3">
          <Facts title="Key dates" items={proposal.keyDates.map((d) => `${d.label}: ${d.date ? fmtDate(d.date) : d.offsetBd !== null ? `Day ${d.offsetBd} (${fmtDate(addBusinessDays(project.kickoffDate, d.offsetBd))})` : ''}${d.note ? ` · ${d.note}` : ''}`)} />
          <Facts title="Fees" items={proposal.fees.map((f) => `${f.label}: ${f.amount}${f.due ? ` · ${f.due}` : ''}`)} />
          <Facts title="Risks" items={proposal.risks} />
        </div>
      )}

      {(proposal.people ?? []).length > 0 && (
        <section aria-label="Suggested client people" data-testid="cp-ai-people">
          <h3 className="mb-1 text-body-strong text-fg">Client people named in the documents</h3>
          <p className="mb-2 text-small text-fg-secondary">Added to People (without an email) when you approve. Untick anyone you do not want.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {(proposal.people ?? []).map((x, i) => (
              <Checkbox
                key={i}
                checked={!dropPeople.has(i)}
                onChange={() =>
                  setDropPeople((set) => {
                    const n = new Set(set);
                    if (n.has(i)) n.delete(i);
                    else n.add(i);
                    return n;
                  })
                }
                label={`${x.name}${x.role ? ` · ${x.role}` : ''}`}
              />
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-4">
        {PHASES.map((phase) => {
          const list = rows.filter((r) => r.t.phase === phase);
          if (!list.length) return null;
          return (
            <section key={phase} aria-label={PHASE_LABEL[phase]}>
              <h3 className="mb-2 text-body-strong text-fg">{PHASE_LABEL[phase]}</h3>
              <ul className="divide-y divide-line rounded-md border border-line">
                {list.map(({ t, i }) => {
                  const off = removed.has(i);
                  return (
                    <li key={i} className={off ? 'opacity-50' : undefined} data-testid="cp-ai-row" data-kind={t.kind}>
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-body text-fg ${off ? 'line-through' : ''}`}>{t.title}</p>
                          <p className="truncate text-caption text-fg-tertiary">
                            {t.sourcePage ? `p.${t.sourcePage}` : 'No page'}
                            {t.sourceQuote ? ` · “${t.sourceQuote}”` : ''}
                            {t.assigneeName ? ` · Suggested: ${t.assigneeName}` : ''}
                            {t.checklist?.length ? ` · Checklist of ${t.checklist.length}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone={t.kind === 'changed' ? 'warning' : 'neutral'} className={t.kind === 'new' ? 'bg-selected-soft text-selected-soft-fg' : undefined}>{PROPOSAL_KIND_LABEL[t.kind]}</Badge>
                          {t.isGate && <Badge tone="neutral">Milestone</Badge>}
                          <PriorityMark priority={t.priority ?? null} />
                          <SideChip side={t.ownerSide} />
                          <span className="w-14 text-right text-caption tabular-nums text-fg-secondary">{fmtDate(addBusinessDays(project.kickoffDate, t.dueOffsetBd))}</span>
                          <IconButton label={`Edit ${t.title}`} size="sm" variant="ghost" onClick={() => setEditing(editing === i ? null : i)}>
                            <Pencil className="size-3.5" />
                          </IconButton>
                          <IconButton
                            label={off ? `Keep ${t.title}` : `Remove ${t.title}`}
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setRemoved((s) => {
                                const n = new Set(s);
                                if (n.has(i)) n.delete(i);
                                else n.add(i);
                                return n;
                              })
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </IconButton>
                        </div>
                      </div>
                      {editing === i && (
                        <div className="grid gap-2 border-t border-line bg-subtle px-3 py-2 sm:grid-cols-[1fr_8rem_8rem_8rem]">
                          <Input aria-label="Title" value={t.title} onChange={(e) => patch(i, { title: e.target.value })} maxLength={200} />
                          <Select aria-label="Owner" value={t.ownerSide} onChange={(e) => patch(i, { ownerSide: e.target.value as 'us' | 'client' })}>
                            <option value="us">Us</option>
                            <option value="client">Client</option>
                          </Select>
                          <Input aria-label="Business days from kickoff" type="number" min={-30} max={260} value={t.dueOffsetBd} onChange={(e) => patch(i, { dueOffsetBd: Math.trunc(Number(e.target.value) || 0) })} />
                          <Select aria-label="Priority" value={t.priority ?? ''} onChange={(e) => patch(i, { priority: (e.target.value || null) as Priority | null })}>
                            <option value="">No priority</option>
                            {PRIORITIES.map((p) => (
                              <option key={p} value={p}>
                                {PRIORITY_LABEL[p]}
                              </option>
                            ))}
                          </Select>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </Card>
  );
}

function Facts({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-body-strong text-fg">{title}</p>
      <ul className="mt-1 flex flex-col gap-1">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

/** "AI status update": drafts the owner copies, or approves onto the client board. Never sent automatically. */
function StatusUpdate({ project, draft, busy, onDraft, onChanged }: { project: OwnerProjectView; draft: StatusDraft | null; busy: boolean; onDraft: () => Promise<boolean>; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const [note, setNote] = React.useState(draft?.clientUpdate ?? '');
  const [publishing, setPublishing] = React.useState(false);
  React.useEffect(() => setNote(draft?.clientUpdate ?? ''), [draft?.at, draft?.clientUpdate]);
  const copy = async (text: string, what: string) => toast({ message: (await copyText(text)) ? `${what} copied` : 'Could not copy. Select the text and copy it.' });
  const publish = async (text: string) => {
    setPublishing(true);
    const r = await apiJson(`/api/client-projects/${project.id}`, { method: 'PATCH', body: { publishClientUpdate: text } });
    setPublishing(false);
    toast({ message: r.success ? (text ? 'Update is now on the client board' : 'Update removed from the client board') : r.error || 'Could not publish it.' });
    await onChanged();
  };
  return (
    <Card className="flex flex-col gap-4 p-4" data-testid="cp-status-update">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-h3 text-fg">Status update</h2>
          <p className="mt-0.5 text-small text-fg-secondary">Drafts a short progress note for the client and the weekly Delivery Report text from the board. Nothing is sent: you copy or approve.</p>
        </div>
        <Button variant="secondary" icon={<Sparkles />} onClick={() => void onDraft()} loading={busy} data-testid="cp-status-draft">
          AI status update
        </Button>
      </div>
      {project.clientUpdate && (
        <Note>
          On the client board since {fmtAt(project.clientUpdateAt)}.{' '}
          <button type="button" className="focus-ring rounded-sm underline" onClick={() => void publish('')}>
            Remove it
          </button>
        </Note>
      )}
      {draft && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-body-strong text-fg">
              Note for the client <span className="font-normal text-fg-tertiary">· drafted {fmtAt(draft.at)}{draft.ai ? ' by AI' : ''}</span>
            </p>
            <Textarea aria-label="Note for the client" rows={12} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} data-testid="cp-status-note" />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" icon={<Copy />} onClick={() => void copy(note, 'Note')}>
                Copy
              </Button>
              <Button variant="primary" size="sm" onClick={() => void publish(note)} loading={publishing} disabled={!note.trim()} data-testid="cp-status-publish">
                Approve and show on the client board
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-body-strong text-fg">Delivery Report text</p>
            <Textarea aria-label="Delivery Report text" rows={12} readOnly value={draft.deliveryReport} className="font-mono text-small" />
            <div>
              <Button variant="secondary" size="sm" icon={<Copy />} onClick={() => void copy(draft.deliveryReport, 'Delivery Report')}>
                Copy
              </Button>
            </div>
          </div>
          {draft.readinessNotice && (
            <div className="flex flex-col gap-2 lg:col-span-2" data-testid="cp-readiness-draft">
              <p className="text-body-strong text-fg">Readiness Notice (draft)</p>
              <Textarea aria-label="Readiness Notice draft" rows={10} readOnly value={draft.readinessNotice} className="font-mono text-small" />
              <div>
                <Button variant="secondary" size="sm" icon={<Copy />} onClick={() => void copy(draft.readinessNotice ?? '', 'Readiness Notice')}>
                  Copy
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
