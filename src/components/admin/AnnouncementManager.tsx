'use client';

import * as React from 'react';
import { Megaphone, Pencil, Plus, Square, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  InlineError,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
  useToast,
  type Tone,
} from '@/components/ui';
import { apiJson } from '@/lib/authClient';
import {
  ANNOUNCEMENT_KINDS,
  LINK_LABEL_MAX,
  MESSAGE_MAX,
  TITLE_MAX,
  announcementStatus,
  validateAnnouncement,
  type Announcement,
  type AnnouncementAudience,
  type AnnouncementInput,
  type AnnouncementKind,
  type AnnouncementStatus,
} from '@/lib/announcements';
import { ANNOUNCEMENT_KIND_META, AnnouncementRibbonView } from '@/components/announcements/AnnouncementRibbon';

const STATUS: Record<AnnouncementStatus, { label: string; tone: Tone; order: number }> = {
  live: { label: 'Live', tone: 'success', order: 0 },
  scheduled: { label: 'Scheduled', tone: 'brand', order: 1 },
  ended: { label: 'Ended', tone: 'neutral', order: 2 },
};

const pad = (n: number) => String(n).padStart(2, '0');
/** ISO UTC -> value for <input type="datetime-local"> in the browser's time zone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** datetime-local value (local time) -> ISO UTC. */
function fromLocalInput(v: string): string {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}
const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function audienceLabel(a: Pick<Announcement, 'audience' | 'workspaceCodes'>, names: Map<string, string>) {
  if (a.audience === 'everyone') return 'Everyone';
  if (a.audience === 'admins') return 'Workspace admins';
  const list = a.workspaceCodes.map((c) => names.get(c) ?? c);
  return list.length <= 3 ? list.join(', ') : `${list.slice(0, 3).join(', ')} +${list.length - 3}`;
}

interface TenantOption {
  code: string;
  name: string;
}

/** Platform Console › Announcements: tell client workspaces about upgrades, updates and releases. */
export function AnnouncementManager() {
  const toast = useToast();
  const [rows, setRows] = React.useState<Announcement[] | null>(null);
  const [storage, setStorage] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [tenants, setTenants] = React.useState<TenantOption[]>([]);
  const [editing, setEditing] = React.useState<Announcement | 'new' | null>(null);
  const [deleting, setDeleting] = React.useState<Announcement | null>(null);
  const [now, setNow] = React.useState(0);

  const load = React.useCallback(async () => {
    const res = await apiJson<{ announcements: Announcement[]; storage: string }>('/api/platform/announcements');
    setNow(Date.now());
    if (!res.success) {
      setError(res.error || 'Could not load announcements.');
      return;
    }
    setError(null);
    setRows(res.announcements);
    setStorage(res.storage);
  }, []);

  React.useEffect(() => {
    void Promise.resolve().then(load);
    void apiJson<{ tenants: TenantOption[] }>('/api/platform/tenants').then((res) => {
      if (res.success) setTenants(res.tenants.map((t) => ({ code: t.code, name: t.name })));
    });
    // Keep the Scheduled / Live / Ended chips current while the page stays open.
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const names = React.useMemo(() => new Map(tenants.map((t) => [t.code, t.name])), [tenants]);

  const endNow = async (a: Announcement) => {
    const res = await apiJson(`/api/platform/announcements/${a.id}`, { method: 'PATCH', body: { endNow: true } });
    if (!res.success) return toast({ message: res.error || 'Could not end the announcement.' });
    toast({ message: `“${a.title}” ended. It no longer shows to anyone.` });
    load();
  };

  const remove = async (a: Announcement) => {
    const res = await apiJson(`/api/platform/announcements/${a.id}`, { method: 'DELETE' });
    if (!res.success) return toast({ message: res.error || 'Could not delete the announcement.' });
    toast({ message: 'Announcement deleted' });
    load();
  };

  const sorted = (rows ?? [])
    .map((a) => ({ a, status: announcementStatus(a, now || Date.parse(a.createdAt)) }))
    .sort((x, y) => STATUS[x.status].order - STATUS[y.status].order || y.a.publishAt.localeCompare(x.a.publishAt));

  return (
    <div className="px-4 py-6 md:px-8">
      <PageHeader
        title="Announcements"
        count={rows?.length}
        description="Tell client workspaces about upgrades, updates and new features."
        primaryAction={
          <Button variant="brand" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            New announcement
          </Button>
        }
      />

      {storage === 'file' && (
        <div role="note" className="mb-4 rounded-md border border-warning-400/40 bg-warning-bg px-3 py-2 text-small text-warning-fg">
          Announcements are saved on this server&apos;s disk (<span className="font-mono">.data/announcements.json</span>). Connect the
          Supabase database before going live so nothing is lost when the server is redeployed.
        </div>
      )}

      {error && <InlineError message={error} onRetry={load} />}

      {rows === null && !error && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {rows && rows.length === 0 && (
        <Card>
          <EmptyState
            icon={<Megaphone />}
            title="No announcements yet"
            description="Announce a release or planned maintenance. It shows as a slim ribbon at the top of the app."
            action={
              <Button variant="brand" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
                New announcement
              </Button>
            }
          />
        </Card>
      )}

      {sorted.length > 0 && (
        <div className="space-y-3">
          {sorted.map(({ a, status }) => {
            const meta = ANNOUNCEMENT_KIND_META[a.kind] ?? ANNOUNCEMENT_KIND_META.update;
            const Icon = meta.icon;
            return (
              <Card key={a.id} className="p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="flex min-w-0 items-start gap-3">
                    <span aria-hidden className={`flex size-9 shrink-0 items-center justify-center rounded-md ${meta.tile}`}>
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-h3 text-fg">{a.title}</h2>
                        <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
                      </div>
                      <p className="mt-1 text-small text-fg-secondary">{a.message}</p>
                      <p className="mt-2 text-caption text-fg-tertiary">
                        {meta.label} · {audienceLabel(a, names)} · {fmt(a.publishAt)} → {fmt(a.unpublishAt)}
                        {a.createdBy ? ` · by ${a.createdBy}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button variant="ghost" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(a)}>
                      Edit
                    </Button>
                    {status !== 'ended' && (
                      <Button variant="secondary" size="sm" icon={<Square className="h-3.5 w-3.5" />} onClick={() => endNow(a)}>
                        End now
                      </Button>
                    )}
                    <Button variant="danger" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDeleting(a)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AnnouncementEditor
        key={editing === null ? 'closed' : editing === 'new' ? 'new' : editing.id}
        editing={editing}
        tenants={tenants}
        onClose={() => setEditing(null)}
        onSaved={(msg) => {
          toast({ message: msg });
          setEditing(null);
          load();
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove(deleting);
          setDeleting(null);
        }}
        title="Delete this announcement?"
        description={`“${deleting?.title ?? ''}” is removed for everyone and can’t be restored. To just take it down, use End now.`}
        confirmLabel="Delete announcement"
        icon={<Trash2 className="h-4 w-4" />}
      />
    </div>
  );
}

// ------------------------------------------------------------------ editor

interface Draft {
  title: string;
  message: string;
  linkUrl: string;
  linkLabel: string;
  kind: AnnouncementKind;
  audience: AnnouncementAudience;
  workspaceCodes: string[];
  publishLocal: string;
  unpublishLocal: string;
}

function initialDraft(a: Announcement | 'new' | null): Draft {
  if (a && a !== 'new') {
    return {
      title: a.title,
      message: a.message,
      linkUrl: a.linkUrl ?? '',
      linkLabel: a.linkLabel ?? '',
      kind: a.kind,
      audience: a.audience,
      workspaceCodes: a.workspaceCodes,
      publishLocal: toLocalInput(a.publishAt),
      unpublishLocal: toLocalInput(a.unpublishAt),
    };
  }
  const start = new Date();
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000);
  return {
    title: '',
    message: '',
    linkUrl: '',
    linkLabel: '',
    kind: 'feature',
    audience: 'admins',
    workspaceCodes: [],
    publishLocal: toLocalInput(start.toISOString()),
    unpublishLocal: toLocalInput(end.toISOString()),
  };
}

function AnnouncementEditor({
  editing,
  tenants,
  onClose,
  onSaved,
}: {
  editing: Announcement | 'new' | null;
  tenants: TenantOption[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [d, setD] = React.useState<Draft>(() => initialDraft(editing));
  const [showErrors, setShowErrors] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [serverError, setServerError] = React.useState<{ field?: string; error: string } | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((p) => ({ ...p, [k]: v }));
    setServerError(null);
  };
  const isNew = editing === 'new';

  const payload: Record<string, unknown> = {
    title: d.title,
    message: d.message,
    linkUrl: d.linkUrl,
    linkLabel: d.linkLabel,
    kind: d.kind,
    audience: d.audience,
    workspaceCodes: d.workspaceCodes,
    publishAt: fromLocalInput(d.publishLocal),
    unpublishAt: fromLocalInput(d.unpublishLocal),
  };
  const check = validateAnnouncement(payload);
  const err = (field: keyof AnnouncementInput) => {
    if (serverError?.field === field) return serverError.error;
    return showErrors && !check.ok && check.field === field ? check.error : undefined;
  };

  const save = async () => {
    setShowErrors(true);
    if (!check.ok) return;
    setSaving(true);
    const res = isNew
      ? await apiJson('/api/platform/announcements', { method: 'POST', body: check.value })
      : await apiJson(`/api/platform/announcements/${(editing as Announcement).id}`, { method: 'PATCH', body: check.value });
    setSaving(false);
    if (!res.success) {
      setServerError({ field: (res as { field?: string }).field, error: res.error || 'Could not save the announcement.' });
      return;
    }
    const st = announcementStatus(check.value);
    onSaved(
      st === 'live' ? 'Announcement is live' : st === 'scheduled' ? `Scheduled for ${fmt(check.value.publishAt)}` : 'Announcement saved (already ended)',
    );
  };

  const toggleCode = (code: string) =>
    set('workspaceCodes', d.workspaceCodes.includes(code) ? d.workspaceCodes.filter((c) => c !== code) : [...d.workspaceCodes, code]);

  return (
    <Dialog
      open={editing !== null}
      onClose={onClose}
      dismissible={!saving}
      size="xl"
      title={isNew ? 'New announcement' : 'Edit announcement'}
      description="Shown as a ribbon at the top of the app to the people you pick, between the start and end time."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            {isNew ? 'Publish' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-1.5 text-caption text-fg-tertiary">Preview</p>
          <div className="rounded-lg bg-app py-2">
            <AnnouncementRibbonView
              announcement={{ title: d.title.trim(), message: d.message.trim(), linkUrl: d.linkUrl.trim() || null, linkLabel: d.linkLabel.trim() || null, kind: d.kind }}
              onDismiss={() => undefined}
              className="px-2 pt-0 md:px-2"
            />
          </div>
        </div>

        {serverError && !serverError.field && (
          <p role="alert" className="text-small text-danger-fg">
            {serverError.error}
          </p>
        )}

        <Field label="Title" htmlFor="ann-title" error={err('title')} hint={`${d.title.length}/${TITLE_MAX}`}>
          <Input
            id="ann-title"
            value={d.title}
            maxLength={TITLE_MAX}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Call recordings now in every workspace"
            aria-invalid={Boolean(err('title')) || undefined}
          />
        </Field>
        <Field label="Message" htmlFor="ann-message" error={err('message')} hint={`${d.message.length}/${MESSAGE_MAX} · plain text`}>
          <Textarea
            id="ann-message"
            value={d.message}
            maxLength={MESSAGE_MAX}
            rows={3}
            onChange={(e) => set('message', e.target.value)}
            placeholder="Listen back to any call from the contact timeline. Turn it on in Admin › Calling."
            aria-invalid={Boolean(err('message')) || undefined}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label="Link (optional)" htmlFor="ann-link" error={err('linkUrl')} hint="https://… or a page path like /admin/members">
            <Input
              id="ann-link"
              value={d.linkUrl}
              onChange={(e) => set('linkUrl', e.target.value)}
              placeholder="https://appointmentlyy.com/changelog"
              aria-invalid={Boolean(err('linkUrl')) || undefined}
            />
          </Field>
          <Field label="Link label" htmlFor="ann-link-label" error={err('linkLabel')}>
            <Input
              id="ann-link-label"
              value={d.linkLabel}
              maxLength={LINK_LABEL_MAX}
              onChange={(e) => set('linkLabel', e.target.value)}
              placeholder="Learn more"
              disabled={!d.linkUrl.trim()}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" htmlFor="ann-kind">
            <Select id="ann-kind" value={d.kind} onChange={(e) => set('kind', e.target.value as AnnouncementKind)}>
              {ANNOUNCEMENT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Audience" htmlFor="ann-audience">
            <Select id="ann-audience" value={d.audience} onChange={(e) => set('audience', e.target.value as AnnouncementAudience)}>
              <option value="admins">Workspace admins (and platform staff)</option>
              <option value="everyone">Everyone</option>
              <option value="workspaces">Specific workspaces</option>
            </Select>
          </Field>
        </div>

        {d.audience === 'workspaces' && (
          <fieldset>
            <legend className="mb-1.5 text-body-strong text-fg">Workspaces</legend>
            {tenants.length === 0 ? (
              <p className="text-small text-fg-tertiary">No client workspaces yet.</p>
            ) : (
              <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border border-line p-3">
                {tenants.map((t) => (
                  <Checkbox
                    key={t.code}
                    checked={d.workspaceCodes.includes(t.code)}
                    onChange={() => toggleCode(t.code)}
                    label={
                      <span>
                        {t.name} <span className="font-mono text-caption text-fg-tertiary">{t.code}</span>
                      </span>
                    }
                  />
                ))}
              </div>
            )}
            {err('workspaceCodes') && (
              <p role="alert" className="mt-1.5 text-small text-danger-fg">
                {err('workspaceCodes')}
              </p>
            )}
            <p className="mt-1.5 text-small text-fg-tertiary">Everyone in the selected workspaces sees it.</p>
          </fieldset>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Show from" htmlFor="ann-publish" error={err('publishAt')} hint="Your local time">
            <Input id="ann-publish" type="datetime-local" value={d.publishLocal} onChange={(e) => set('publishLocal', e.target.value)} />
          </Field>
          <Field label="Hide after" htmlFor="ann-unpublish" error={err('unpublishAt')} hint="Your local time">
            <Input
              id="ann-unpublish"
              type="datetime-local"
              value={d.unpublishLocal}
              min={d.publishLocal || undefined}
              onChange={(e) => set('unpublishLocal', e.target.value)}
              aria-invalid={Boolean(err('unpublishAt')) || undefined}
            />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
