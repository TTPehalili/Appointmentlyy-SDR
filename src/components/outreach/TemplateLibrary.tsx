'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Check,
  Copy,
  FileText,
  Layers,
  Lock,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  FilterBar,
  InlineError,
  Menu,
  PageHeader,
  Select,
  Skeleton,
  Tabs,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';
import { findAssistantFramework } from '@/lib/coldEmailAssistant';
import {
  SAMPLE_MERGE_VALUES,
  TEMPLATE_PURPOSES,
  TEMPLATE_WORD_LIMIT,
  countTemplateWords,
  fillMergeFields,
  isAssignedTo,
  purposeLabel,
  type EmailTemplate,
  type TemplateInput,
  type TemplatePurpose,
} from '@/lib/emailTemplates';
import {
  createTemplate,
  deleteTemplate,
  fetchMembers,
  fetchTemplates,
  updateTemplate,
  type WorkspaceMember,
} from '@/lib/emailTemplatesClient';
import TemplateEditorDialog from '@/components/outreach/TemplateEditorDialog';
import AssignTemplateDialog from '@/components/outreach/AssignTemplateDialog';

type View = 'team' | 'assigned' | 'mine' | 'archived';
type EditorState = { key: number; template: EmailTemplate | null; initial?: Partial<TemplateInput> } | null;
type AssignState = { key: number; templates: EmailTemplate[]; label: string } | null;

const NO_CAMPAIGN = '';

export default function TemplateLibrary() {
  const { session } = useSession();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [me, setMe] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState<View | null>(null);
  const [search, setSearch] = useState('');
  const [purpose, setPurpose] = useState<TemplatePurpose | 'all'>('all');
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const [assign, setAssign] = useState<AssignState>(null);
  const [preview, setPreview] = useState<EmailTemplate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<EmailTemplate | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const seq = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    setNotice({ text, tone });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 6000);
  }, []);
  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  const load = useCallback(async () => {
    const r = await fetchTemplates({ archived: true });
    setLoading(false);
    if (!r.ok) {
      setLoadError(r.error);
      return;
    }
    setLoadError('');
    setTemplates(r.templates);
    setCanManage(r.canManage);
    setMe(r.me);
    setView((v) => v ?? (r.canManage ? 'team' : 'assigned'));
    if (r.canManage) {
      const list = await fetchMembers();
      setMembers(list);
      setMembersLoaded(true);
    }
  }, []);

  // Runs again whenever the tab is shown (routes stay mounted in a hidden Activity), so the list is fresh.
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load, session?.tenantCode]);

  const memberName = useMemo(() => {
    const map = new Map(members.map((m) => [m.email.toLowerCase(), m.name || m.email]));
    return (email: string) => (email.toLowerCase() === me.toLowerCase() ? 'You' : map.get(email.toLowerCase()) || email);
  }, [members, me]);

  const mineOf = useCallback((t: EmailTemplate) => t.visibility === 'private' && t.createdBy.toLowerCase() === me.toLowerCase(), [me]);
  const canEdit = useCallback((t: EmailTemplate) => (t.visibility === 'private' ? mineOf(t) : canManage), [canManage, mineOf]);

  const inView = useCallback(
    (t: EmailTemplate, v: View | null) => {
      if (v === 'mine') return mineOf(t) && !t.archived;
      if (v === 'archived') return t.archived;
      if (v === 'assigned') return t.visibility === 'team' && !t.archived && isAssignedTo(t, me);
      return t.visibility === 'team' && !t.archived; // team
    },
    [me, mineOf],
  );

  const counts = useMemo(() => {
    const c: Record<View, number> = { team: 0, assigned: 0, mine: 0, archived: 0 };
    for (const t of templates) for (const v of ['team', 'assigned', 'mine', 'archived'] as View[]) if (inView(t, v)) c[v] += 1;
    return c;
  }, [templates, inView]);

  const campaigns = useMemo(() => [...new Set(templates.filter((t) => t.campaign && !t.archived).map((t) => t.campaign))].sort(), [templates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter(
      (t) =>
        inView(t, view) &&
        (purpose === 'all' || t.purpose === purpose) &&
        (!q || [t.name, t.subject, t.body, t.campaign, ...t.outcomeTags].some((x) => x.toLowerCase().includes(q))),
    );
  }, [templates, inView, view, purpose, search]);

  const groups = useMemo(() => {
    const map = new Map<string, EmailTemplate[]>();
    for (const t of filtered) {
      const k = t.campaign || NO_CAMPAIGN;
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return [...map.entries()].sort(([a], [b]) => (a === NO_CAMPAIGN ? 1 : b === NO_CAMPAIGN ? -1 : a.localeCompare(b)));
  }, [filtered]);

  // ---------------------------------------------------------------- actions

  const merge = (updated: EmailTemplate[]) =>
    setTemplates((prev) => {
      const byId = new Map(prev.map((t) => [t.id, t]));
      for (const u of updated) byId.set(u.id, u);
      return [...byId.values()];
    });

  const openNew = (initial?: Partial<TemplateInput>) => setEditor({ key: ++seq.current, template: null, initial });
  const openEdit = (t: EmailTemplate) => setEditor({ key: ++seq.current, template: t });
  const openAssign = (list: EmailTemplate[], label: string) => setAssign({ key: ++seq.current, templates: list, label });

  const setArchived = async (t: EmailTemplate, archived: boolean) => {
    const r = await updateTemplate(t.id, { archived });
    if (!r.ok) return say(r.error, 'error');
    merge([r.template]);
    say(archived ? `Archived "${t.name}". Find it under Archived.` : `Restored "${t.name}".`);
  };

  const duplicate = async (t: EmailTemplate) => {
    const asTeam = canManage && t.visibility === 'team';
    const r = await createTemplate({
      name: `${t.name} (copy)`.slice(0, 80),
      subject: t.subject,
      body: t.body,
      frameworkId: t.frameworkId,
      campaign: asTeam ? t.campaign : '',
      purpose: t.purpose,
      outcomeTags: t.outcomeTags,
      sequenceStep: asTeam ? t.sequenceStep : null,
      visibility: asTeam ? 'team' : 'private',
    });
    if (!r.ok) return say(r.error, 'error');
    merge([r.template]);
    say(asTeam ? `Copied to "${r.template.name}".` : `Copied to My templates as "${r.template.name}".`);
  };

  const remove = async (t: EmailTemplate) => {
    const r = await deleteTemplate(t.id);
    if (!r.ok) return say(r.error, 'error');
    setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    say(`Deleted "${t.name}".`);
  };

  const assignedLabel = (t: EmailTemplate) => {
    if (t.visibility === 'private') return { icon: <Lock className="size-3.5" aria-hidden />, text: 'Only you' };
    if (t.assignedTo.length === 0) return { icon: <Users className="size-3.5" aria-hidden />, text: 'Everyone' };
    if (!canManage) return { icon: <UserPlus className="size-3.5" aria-hidden />, text: 'Assigned to you' };
    const names = t.assignedTo.map(memberName);
    return { icon: <UserPlus className="size-3.5" aria-hidden />, text: names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}` };
  };

  // ---------------------------------------------------------------- render

  const tabs = canManage
    ? [
        { value: 'team', label: 'Team templates', count: counts.team },
        { value: 'mine', label: 'My templates', count: counts.mine },
        { value: 'archived', label: 'Archived', count: counts.archived },
      ]
    : [
        { value: 'assigned', label: 'Assigned to me', count: counts.assigned },
        { value: 'mine', label: 'My templates', count: counts.mine },
      ];

  const activeView = view ?? (canManage ? 'team' : 'assigned');
  const nothingAtAll = !loading && !loadError && templates.length === 0;

  const empty = () => {
    if (search || purpose !== 'all') {
      return <EmptyState icon={<FileText />} title="No templates match" description="Try a different search or purpose." action={<Button variant="ghost" size="sm" onClick={() => { setSearch(''); setPurpose('all'); }}>Clear filters</Button>} />;
    }
    if (activeView === 'archived') return <EmptyState icon={<Archive />} title="Nothing archived" description="Archived templates stay here and can be restored." />;
    if (activeView === 'assigned') {
      return <EmptyState icon={<Users />} title="Nothing assigned to you yet" description="When a manager assigns templates to you, they show up here, in Cold email and in the Dialer." />;
    }
    if (activeView === 'mine') {
      return (
        <EmptyState
          icon={<Lock />}
          title="No templates of your own yet"
          description="Save emails you send often. Only you can see your templates."
          action={<Button variant="secondary" size="sm" icon={<Plus />} onClick={() => openNew({ visibility: 'private' })}>New template</Button>}
        />
      );
    }
    return (
      <EmptyState
        icon={<Layers />}
        title="No team templates yet"
        description="Create templates and campaigns, then assign them to reps. Reps pick them in Cold email and after a call in the Dialer."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" size="sm" icon={<Sparkles />} onClick={() => openNew()}>Draft with AI</Button>
            <Button variant="primary" size="sm" icon={<Plus />} onClick={() => openNew()}>New template</Button>
          </div>
        }
      />
    );
  };

  return (
    <div className="min-h-full space-y-6 bg-app px-4 py-6 font-sans text-fg md:px-8">
      <PageHeader
        title="Email templates"
        count={loading ? undefined : canManage ? counts.team : counts.assigned + counts.mine}
        description={canManage ? 'Templates and campaigns your reps send from Cold email and the Dialer.' : 'Templates assigned to you, plus your own.'}
        secondaryActions={
          <Button variant="secondary" size="sm" icon={<Sparkles />} onClick={() => openNew(canManage ? undefined : { visibility: 'private' })}>
            Draft with AI
          </Button>
        }
        primaryAction={
          <Button variant="brand" size="sm" icon={<Plus />} onClick={() => openNew(canManage ? undefined : { visibility: 'private' })}>
            New template
          </Button>
        }
        tabs={
          !nothingAtAll || !canManage ? (
            <Tabs items={tabs} value={activeView} onChange={(v) => setView(v as View)} label="Template lists" />
          ) : undefined
        }
      />

      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={cn('rounded-md px-3 py-2 text-small', notice.tone === 'error' ? 'bg-danger-bg text-danger-fg' : 'bg-success-bg text-success-fg')}
        >
          {notice.text}
        </p>
      )}

      {loadError ? (
        <InlineError message={loadError} onRetry={() => { setLoading(true); void load(); }} />
      ) : loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading templates">
          <Skeleton className="h-9 w-80" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : (
        <>
          {!nothingAtAll && (
            <FilterBar
              search={search}
              onSearch={setSearch}
              searchPlaceholder="Search templates"
              filters={
                <div className="w-44">
                  <Select aria-label="Filter by purpose" value={purpose} onChange={(e) => setPurpose(e.target.value as TemplatePurpose | 'all')}>
                    <option value="all">All purposes</option>
                    {TEMPLATE_PURPOSES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                </div>
              }
            />
          )}

          {groups.length === 0 ? (
            <div className="rounded-lg border border-line bg-surface">{empty()}</div>
          ) : (
            <div className="space-y-8">
              {groups.map(([campaign, list]) => {
                const assignable = canManage && activeView === 'team' && list.every((t) => t.visibility === 'team');
                return (
                  <section key={campaign || '__none'} aria-labelledby={`camp-${campaign || 'none'}`} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 id={`camp-${campaign || 'none'}`} className="flex items-center gap-2 text-h3 text-fg">
                        {campaign ? <Layers className="size-4 text-fg-tertiary" aria-hidden /> : <FileText className="size-4 text-fg-tertiary" aria-hidden />}
                        <span>{campaign || 'No campaign'}</span>
                        <span className="text-caption tabular-nums text-fg-tertiary">{list.length}</span>
                      </h2>
                      {assignable && campaign && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" icon={<Plus />} onClick={() => openNew({ campaign })}>
                            Add template
                          </Button>
                          <Button variant="secondary" size="sm" icon={<UserPlus />} onClick={() => openAssign(list, `"${campaign}"`)}>
                            Assign campaign
                          </Button>
                        </div>
                      )}
                    </div>
                    <ul className="grid gap-3 xl:grid-cols-2">
                      {list.map((t) => (
                        <TemplateCard
                          key={t.id}
                          t={t}
                          assigned={assignedLabel(t)}
                          editable={canEdit(t)}
                          canAssign={canManage && t.visibility === 'team' && !t.archived}
                          canArchive={canManage && t.visibility === 'team'}
                          canDelete={canEdit(t) && (t.visibility === 'private' || t.archived)}
                          onOpen={() => (canEdit(t) && !t.archived ? openEdit(t) : setPreview(t))}
                          onEdit={() => openEdit(t)}
                          onAssign={() => openAssign([t], `"${t.name}"`)}
                          onArchive={() => void setArchived(t, !t.archived)}
                          onDuplicate={() => void duplicate(t)}
                          onDelete={() => setConfirmDelete(t)}
                          onPreview={() => setPreview(t)}
                        />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {editor && (
        <TemplateEditorDialog
          key={editor.key}
          open
          onClose={() => setEditor(null)}
          template={editor.template}
          initial={editor.initial}
          canManage={canManage}
          campaigns={campaigns}
          onSaved={(saved, message, close) => {
            merge(saved);
            say(message);
            if (close) setEditor(null);
          }}
        />
      )}

      {assign && (
        <AssignTemplateDialog
          key={assign.key}
          open
          onClose={() => setAssign(null)}
          templates={assign.templates}
          label={assign.label}
          members={members}
          membersLoaded={membersLoaded}
          onSaved={(updated, message) => {
            merge(updated);
            say(message);
            setAssign(null);
          }}
        />
      )}

      {preview && <PreviewDialog t={preview} onClose={() => setPreview(null)} onCopy={() => void duplicate(preview)} canManage={canManage} />}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && void remove(confirmDelete)}
        title="Delete this template?"
        description={confirmDelete ? `"${confirmDelete.name}" is deleted for good. This can't be undone.` : undefined}
        confirmLabel="Delete template"
        icon={<Trash2 />}
      />
    </div>
  );
}

// ------------------------------------------------------------------ card

function TemplateCard({
  t,
  assigned,
  editable,
  canAssign,
  canArchive,
  canDelete,
  onOpen,
  onEdit,
  onAssign,
  onArchive,
  onDuplicate,
  onDelete,
  onPreview,
}: {
  t: EmailTemplate;
  assigned: { icon: React.ReactNode; text: string };
  editable: boolean;
  canAssign: boolean;
  canArchive: boolean;
  canDelete: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onAssign: () => void;
  onArchive: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPreview: () => void;
}) {
  const words = countTemplateWords(t.body);
  const framework = findAssistantFramework(t.frameworkId);
  const items = [
    ...(editable && !t.archived ? [{ label: 'Edit', icon: <Pencil />, onSelect: onEdit }] : []),
    { label: 'Preview', icon: <FileText />, onSelect: onPreview },
    ...(canAssign ? [{ label: 'Assign', icon: <UserPlus />, onSelect: onAssign }] : []),
    { label: canArchive ? 'Duplicate' : 'Copy to My templates', icon: <Copy />, onSelect: onDuplicate },
    ...(canArchive ? [{ label: t.archived ? 'Restore' : 'Archive', icon: t.archived ? <ArchiveRestore /> : <Archive />, onSelect: onArchive }] : []),
    ...(canDelete ? ['divider' as const, { label: 'Delete', icon: <Trash2 />, onSelect: onDelete, danger: true }] : []),
  ];
  return (
    <li className="group relative flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-surface p-4 shadow-xs transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="focus-ring min-w-0 rounded-sm text-left">
          <span className="block truncate text-body-strong text-fg">
            {t.sequenceStep ? <span className="mr-1.5 text-fg-tertiary tabular-nums">{t.sequenceStep}.</span> : null}
            {t.name}
          </span>
          <span className="mt-0.5 block truncate text-small text-fg-secondary">
            <span className="text-fg-tertiary">Subject: </span>
            {t.subject}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {canAssign && (
            <Button variant="ghost" size="sm" icon={<UserPlus />} onClick={onAssign} aria-label={`Assign ${t.name}`}>
              <span className="hidden sm:inline">Assign</span>
            </Button>
          )}
          <Menu items={items} label={`Actions for ${t.name}`} />
        </div>
      </div>
      <p className="line-clamp-2 whitespace-pre-line text-small text-fg-tertiary">{t.body.replace(/\n{2,}/g, '\n')}</p>
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        <Badge tone="neutral">{purposeLabel(t.purpose)}</Badge>
        {t.outcomeTags.map((tag) => (
          <Badge key={tag} tone="brand">
            {tag}
          </Badge>
        ))}
        {framework && <Badge tone="neutral">{framework.name}</Badge>}
        <span className={cn('text-caption tabular-nums', words >= TEMPLATE_WORD_LIMIT ? 'text-danger-fg' : 'text-fg-tertiary')}>{words} words</span>
        <span className="ml-auto inline-flex items-center gap-1 text-caption text-fg-secondary" title="Who can use it">
          {assigned.icon}
          {assigned.text}
        </span>
      </div>
    </li>
  );
}

// ------------------------------------------------------------------ preview (read-only)

function PreviewDialog({ t, onClose, onCopy, canManage }: { t: EmailTemplate; onClose: () => void; onCopy: () => void; canManage: boolean }) {
  const [copied, setCopied] = useState(false);
  const filled = (s: string) => fillMergeFields(s, SAMPLE_MERGE_VALUES);
  const copyText = () => {
    void navigator.clipboard?.writeText(`Subject: ${t.subject}\n\n${t.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={t.name}
      description={`${purposeLabel(t.purpose)}${t.campaign ? ` in ${t.campaign}` : ''}${t.archived ? ' (archived)' : ''}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={copyText} icon={copied ? <Check /> : <Copy />}>
            {copied ? 'Copied' : 'Copy text'}
          </Button>
          {!t.archived && (
            <Button
              variant="secondary"
              onClick={() => {
                onCopy();
                onClose();
              }}
              icon={<Copy />}
            >
              {canManage && t.visibility === 'team' ? 'Duplicate' : 'Copy to My templates'}
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <p className="text-caption text-fg-tertiary">Template</p>
          <p className="text-small text-fg">
            <span className="text-fg-tertiary">Subject: </span>
            <span className="font-medium">{t.subject}</span>
          </p>
          <p className="whitespace-pre-wrap rounded-md border border-line bg-surface p-3 text-small leading-relaxed text-fg">{t.body}</p>
        </div>
        <div className="space-y-1.5">
          <p className="text-caption text-fg-tertiary">With sample values</p>
          <p className="text-small text-fg">
            <span className="text-fg-tertiary">Subject: </span>
            <span className="font-medium">{filled(t.subject)}</span>
          </p>
          <p className="whitespace-pre-wrap rounded-md bg-subtle p-3 text-small leading-relaxed text-fg">{filled(t.body)}</p>
        </div>
      </div>
    </Dialog>
  );
}
