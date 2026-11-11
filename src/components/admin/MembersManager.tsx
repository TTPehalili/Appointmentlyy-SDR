'use client';

import * as React from 'react';
import { Copy, Mail, Plus, Send, Trash2, Users } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  InlineError,
  Input,
  Meter,
  PageHeader,
  SearchInput,
  Select,
  Skeleton,
  useToast,
} from '@/components/ui';
import { apiJson } from '@/lib/authClient';
import { EMAIL_RE, ROLE_RANK, type Role } from '@/lib/roles';

interface MemberRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: 'invited' | 'active';
  invitedBy: string;
  invitedAt: string;
  joinedAt: string | null;
  lastLoginAt: string | null;
}

interface MembersReply {
  tenant: { code: string; name: string; seatLimit: number };
  seatsUsed: number;
  canManage: boolean;
  grantable: Role[];
  me: string;
  members: MemberRow[];
}

const TH_ROW = 'h-9 bg-subtle';
const TH = 'px-4 text-caption font-medium text-fg-tertiary';
const TR = 'border-t border-line transition-colors duration-150 hover:bg-subtle';

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

/** Admin › Members & seats: the current workspace's people, invites, roles and seat usage. */
export function MembersManager() {
  const toast = useToast();
  const [data, setData] = React.useState<MembersReply | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState<MemberRow | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [linkFor, setLinkFor] = React.useState<{ email: string; url: string } | null>(null);

  const load = React.useCallback(async () => {
    const res = await apiJson<MembersReply>('/api/tenant/members');
    if (!res.success) {
      setError(res.status === 403 ? 'Only supervisors, managers and admins can see the member list.' : res.error || 'Could not load members.');
      return;
    }
    setError(null);
    setData(res);
  }, []);

  React.useEffect(() => {
    // Defer to a microtask so the first fetch never sets state during the effect itself.
    void Promise.resolve().then(load);
  }, [load]);

  const changeRole = async (m: MemberRow, role: Role) => {
    setBusy(m.id);
    const res = await apiJson(`/api/tenant/members/${m.id}`, { method: 'PATCH', body: { role } });
    setBusy(null);
    if (!res.success) return toast({ message: res.error || 'Could not change the role.' });
    toast({ message: `${m.name || m.email} is now ${role}.` });
    load();
  };

  const resend = async (m: MemberRow) => {
    setBusy(m.id);
    const res = await apiJson<{ emailDelivered: boolean; inviteUrl?: string }>(`/api/tenant/members/${m.id}`, {
      method: 'PATCH',
      body: { resend: true },
    });
    setBusy(null);
    if (!res.success) return toast({ message: res.error || 'Could not re-send the invite.' });
    if (res.emailDelivered) toast({ message: `Invite re-sent to ${m.email}.` });
    else if (res.inviteUrl) setLinkFor({ email: m.email, url: res.inviteUrl });
    load();
  };

  const remove = async (m: MemberRow) => {
    const res = await apiJson(`/api/tenant/members/${m.id}`, { method: 'DELETE' });
    if (!res.success) return toast({ message: res.error || 'Could not remove this person.' });
    toast({ message: m.status === 'invited' ? `Invite to ${m.email} withdrawn.` : `${m.name || m.email} removed and signed out.` });
    load();
  };

  const q = query.trim().toLowerCase();
  const members = (data?.members ?? []).filter((m) => !q || `${m.name} ${m.email} ${m.role}`.toLowerCase().includes(q));
  const myRank = data ? ROLE_RANK[data.members.find((m) => m.email === data.me)?.role ?? 'Rep'] : 0;
  const seatLimit = data?.tenant.seatLimit ?? 0;
  const seatsFull = seatLimit > 0 && (data?.seatsUsed ?? 0) >= seatLimit;
  const canInvite = Boolean(data && data.grantable.length > 0);

  return (
    <div>
      <PageHeader
        title="Members & seats"
        count={data?.members.length}
        description={data ? `People in ${data.tenant.name}. Invite your team and set what each person can do.` : 'People in this workspace.'}
        meta={
          data && seatLimit > 0 ? (
            <div className="w-44">
              <div className="mb-1 flex justify-between text-small">
                <span className="text-fg-secondary">Seats</span>
                <span className="tabular-nums text-fg">
                  {data.seatsUsed} / {seatLimit}
                </span>
              </div>
              <Meter value={Math.min(1, data.seatsUsed / seatLimit)} label="Seats used" />
            </div>
          ) : undefined
        }
        primaryAction={
          canInvite ? (
            <Button
              variant="brand"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setInviteOpen(true)}
              disabled={seatsFull}
              title={seatsFull ? 'All seats are used. Remove someone or ask Appointmentlyy for more seats.' : undefined}
            >
              Invite people
            </Button>
          ) : undefined
        }
      />

      {error && <InlineError message={error} onRetry={load} />}
      {!data && !error && <Skeleton className="h-64 w-full" />}

      {data && seatsFull && canInvite && (
        <div role="note" className="mb-4 rounded-md border border-warning-400/40 bg-warning-bg px-3 py-2 text-small text-warning-fg">
          All {seatLimit} seats are used. Remove someone or contact Appointmentlyy to add seats.
        </div>
      )}

      {data && data.members.length === 0 && (
        <Card>
          <EmptyState
            icon={<Users />}
            title="No one here yet"
            description="Invite your reps, supervisors and managers. Each person gets a sign-in email."
            action={
              canInvite ? (
                <Button variant="brand" icon={<Plus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>
                  Invite people
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

      {data && data.members.length > 0 && (
        <div className="space-y-4">
          <div className="w-full sm:max-w-md">
            <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, email or role" aria-label="Search members" />
          </div>
          <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-body tabular-nums">
                <thead>
                  <tr className={TH_ROW}>
                    <th scope="col" className={TH}>Name</th>
                    <th scope="col" className={TH}>Role</th>
                    <th scope="col" className={TH}>Status</th>
                    <th scope="col" className={TH}>Last sign-in</th>
                    <th scope="col" className={`${TH} text-right`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const isMe = m.email === data.me;
                    const editable = data.canManage && !isMe && ROLE_RANK[m.role] <= myRank;
                    return (
                      <tr key={m.id} className={TR}>
                        <td className="px-4 py-2.5">
                          <div className="text-body-strong text-fg">
                            {m.name || m.email.split('@')[0]}
                            {isMe && <span className="ml-1.5 text-small font-normal text-fg-tertiary">(you)</span>}
                          </div>
                          <div className="text-small text-fg-secondary">{m.email}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          {editable ? (
                            <Select
                              value={m.role}
                              onChange={(e) => changeRole(m, e.target.value as Role)}
                              disabled={busy === m.id}
                              aria-label={`Role for ${m.email}`}
                              className="h-8 w-44"
                            >
                              {Array.from(new Set([m.role, ...data.grantable])).map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <span className="text-fg">{m.role}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {m.status === 'active' ? (
                            <Badge tone="success">Active</Badge>
                          ) : (
                            <Badge tone="warning" className="cursor-default">
                              <span title={`Invited by ${m.invitedBy} on ${when(m.invitedAt)}`}>Invite pending</span>
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-small text-fg-secondary">{when(m.lastLoginAt)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="inline-flex items-center gap-0.5">
                            {m.status === 'invited' && canInvite && (
                              <IconButton label={`Re-send invite to ${m.email}`} size="sm" onClick={() => resend(m)} disabled={busy === m.id}>
                                <Mail className="h-4 w-4" />
                              </IconButton>
                            )}
                            {editable && (
                              <IconButton
                                label={m.status === 'invited' ? `Withdraw invite to ${m.email}` : `Remove ${m.email}`}
                                size="sm"
                                onClick={() => setRemoving(m)}
                                className="hover:bg-danger-bg hover:text-danger-fg"
                              >
                                <Trash2 className="h-4 w-4" />
                              </IconButton>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line px-4 py-3 text-small text-fg-secondary">
              Showing {members.length} of {data.members.length} people
            </div>
          </div>
        </div>
      )}

      {data && (
        <InviteDialog
          key={inviteOpen ? 'invite-open' : 'invite-closed'}
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          grantable={data.grantable}
          workspaceName={data.tenant.name}
          onInvited={load}
          onLink={(email, url) => setLinkFor({ email, url })}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) remove(removing);
          setRemoving(null);
        }}
        title={removing?.status === 'invited' ? `Withdraw the invite to ${removing?.email}?` : `Remove ${removing?.name || removing?.email}?`}
        description={
          removing?.status === 'invited'
            ? 'Their invite link stops working and the seat is freed.'
            : 'They are signed out right away and lose access to this workspace. The seat is freed. Their past calls and notes stay.'
        }
        confirmLabel={removing?.status === 'invited' ? 'Withdraw invite' : 'Remove person'}
        icon={<Trash2 className="h-4 w-4" />}
      />

      <Dialog open={linkFor !== null} onClose={() => setLinkFor(null)} title="Invite email didn’t send" size="md">
        {linkFor && <CopyLink text={`Share this invite link with ${linkFor.email} directly. It works for 7 days.`} url={linkFor.url} onDone={() => setLinkFor(null)} />}
      </Dialog>
    </div>
  );
}

function CopyLink({ text, url, onDone }: { text: string; url: string; onDone: () => void }) {
  const toast = useToast();
  return (
    <div className="space-y-3">
      <p className="text-body text-fg-secondary">{text}</p>
      <div className="flex items-center gap-2">
        <Input readOnly value={url} aria-label="Invite link" className="font-mono text-small" onFocus={(e) => e.currentTarget.select()} />
        <Button
          variant="secondary"
          icon={<Copy className="h-4 w-4" />}
          onClick={() => navigator.clipboard.writeText(url).then(() => toast({ message: 'Invite link copied' }))}
        >
          Copy
        </Button>
      </div>
      <div className="flex justify-end">
        <Button variant="primary" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

function InviteDialog({
  open,
  onClose,
  grantable,
  workspaceName,
  onInvited,
  onLink,
}: {
  open: boolean;
  onClose: () => void;
  grantable: Role[];
  workspaceName: string;
  onInvited: () => void;
  onLink: (email: string, url: string) => void;
}) {
  const toast = useToast();
  const defaultRole: Role = grantable.includes('Rep') ? 'Rep' : grantable[grantable.length - 1];
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [role, setRole] = React.useState<Role>(defaultRole);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) return setError('Enter a valid email address.');
    setSending(true);
    setError(null);
    const res = await apiJson<{ emailDelivered: boolean; inviteUrl?: string; reinvited: boolean }>('/api/auth/invite', {
      method: 'POST',
      body: { email: clean, name: name.trim(), role },
    });
    setSending(false);
    if (!res.success) return setError(res.error || 'Could not send the invite.');
    onInvited();
    onClose();
    if (res.emailDelivered) toast({ message: `${res.reinvited ? 'Invite re-sent' : 'Invite sent'} to ${clean}.` });
    else if (res.inviteUrl) onLink(clean, res.inviteUrl);
  };

  return (
    <Dialog open={open} onClose={onClose} title={`Invite someone to ${workspaceName}`} description="They get an email with a 7-day invite link." size="md">
      <form onSubmit={send} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="inv-email" error={error ?? undefined}>
            <Input id="inv-email" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
          </Field>
          <Field label="Name" htmlFor="inv-name" hint="Optional">
            <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <Field label="Role" htmlFor="inv-role" hint={ROLE_HINT[role]}>
          <Select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {grantable.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={sending} icon={<Send className="h-4 w-4" />}>
            Send invite
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const ROLE_HINT: Record<Role, string> = {
  'Super Admin': 'Appointmentlyy staff: every workspace and the Platform Console.',
  Admin: 'Everything in this workspace, including members, billing and branding.',
  Manager: 'Team pages, coaching and reports. Can invite supervisors and reps.',
  Supervisor: 'Live floor and coaching for their team. Can invite reps.',
  'Account Executive': 'Runs the meetings reps book, with their meeting plans. Otherwise the same access as a Rep.',
  Rep: 'Dialer, inbox, practice and their own pipeline.',
};
