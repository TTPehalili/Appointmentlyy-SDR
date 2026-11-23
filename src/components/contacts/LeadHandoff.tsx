'use client';

/**
 * "Assign leads to a teammate" (src/lib/leadHandoffs.ts):
 * - AssignToTeammateDialog: the sender picks a member of their workspace and sends the leads.
 * - LeadHandoffSync: mounted once in the app shell; collects leads teammates sent to the signed-in
 *   person into their own Contacts and says so in a toast.
 */
import * as React from 'react';
import { Button, Dialog, Field, Select, useToast } from '@/components/ui';
import { DEMO_LOGIN, apiJson, useServerAuth } from '@/lib/authClient';
import { useSession } from '@/lib/session';
import type { ContactRecord } from '@/lib/leadStore';
import { canSendLeadHandoffs, type LeadHandoffSummary } from '@/lib/leadHandoffs';
import { collectLeadHandoffs, describeCollected, sendLeadHandoff } from '@/lib/leadHandoffClient';

/**
 * Whether to show the "Assign to teammate" action: the server's rule (Admin and above; platform staff
 * only in the platform's own workspace), and not while staff preview a lower role. The server decides
 * again on every send.
 */
export function useCanAssignLeads(): boolean {
  const { identity } = useServerAuth();
  const { role } = useSession();
  if (DEMO_LOGIN) return false;
  return canSendLeadHandoffs(identity) && (role === 'Admin' || role === 'Super Admin');
}

interface MemberOption {
  email: string;
  name: string;
  role: string;
  status: string;
}

const MAX_LEADS_PER_SEND = 5000;

interface AssignDialogProps {
  open: boolean;
  onClose: () => void;
  /** The leads to send (a selection or a whole folder). */
  leads: ContactRecord[];
  /** Name the recipient sees for the folder, before " (from <sender>)". */
  folderName: string;
}

/** Mounted only while open, so every opening starts clean (no teammate chosen, no old error). */
export function AssignToTeammateDialog(props: AssignDialogProps) {
  return props.open ? <AssignDialogBody {...props} /> : null;
}

function AssignDialogBody({ open, onClose, leads, folderName }: AssignDialogProps) {
  const toast = useToast();
  const selectId = React.useId();
  const [members, setMembers] = React.useState<MemberOption[] | null>(null);
  const [sent, setSent] = React.useState<LeadHandoffSummary[]>([]);
  const [toEmail, setToEmail] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const [m, s] = await Promise.all([
        apiJson<{ members?: MemberOption[]; me?: string }>('/api/tenant/members'),
        apiJson<{ sent?: LeadHandoffSummary[] }>('/api/leads/handoffs/sent'),
      ]);
      if (!alive) return;
      if (!m.success) {
        setMembers([]);
        setError(m.error || 'Could not load your teammates.');
        return;
      }
      const me = (m.me || '').toLowerCase();
      setMembers((m.members ?? []).filter((x) => x.email.toLowerCase() !== me && x.status !== 'removed'));
      setSent(s.success ? (s.sent ?? []).slice(0, 4) : []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const tooMany = leads.length > MAX_LEADS_PER_SEND;
  const nameOf = (email: string) => {
    const m = members?.find((x) => x.email.toLowerCase() === email.toLowerCase());
    return m?.name?.trim() || email;
  };

  const send = async () => {
    if (!toEmail || busy || leads.length === 0 || tooMany) return;
    setBusy(true);
    setError(null);
    const r = await sendLeadHandoff({ toEmail, folderName, leads });
    setBusy(false);
    if (!r.ok) {
      setError(r.error || 'Could not send the leads.');
      return;
    }
    toast({
      message: `Sent ${r.sent} lead${r.sent === 1 ? '' : 's'} to ${r.recipientName || nameOf(toEmail)}. They appear in their Contacts when they next open the app.`,
    });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title="Assign to teammate"
      description={
        <span data-handoff-count>
          {leads.length} lead{leads.length === 1 ? '' : 's'}, sent as &ldquo;{folderName}&rdquo;
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="brand" onClick={send} disabled={!toEmail || busy || leads.length === 0 || tooMany} data-handoff-send>
            {busy ? 'Sending…' : `Send ${leads.length} lead${leads.length === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Teammate"
          htmlFor={selectId}
          hint="A copy of these leads is added to their Contacts as a new folder the next time they open the app. Your own list is not changed."
        >
          <Select id={selectId} value={toEmail} onChange={(e) => setToEmail(e.target.value)} disabled={busy || members === null} data-handoff-member>
            <option value="">{members === null ? 'Loading teammates…' : members.length === 0 ? 'No teammates in this workspace yet' : 'Choose a teammate'}</option>
            {(members ?? []).map((m) => (
              <option key={m.email} value={m.email}>
                {(m.name?.trim() || m.email) + ` (${m.role}${m.status === 'invited' ? ', invited' : ''})`}
              </option>
            ))}
          </Select>
        </Field>
        {leads.length === 0 && <p className="text-small text-fg-secondary">There are no leads to send.</p>}
        {tooMany && (
          <p className="text-small text-danger-fg" role="alert">
            You can send up to {MAX_LEADS_PER_SEND.toLocaleString('en-US')} leads at once. Filter the list or send one folder at a time.
          </p>
        )}
        {error && (
          <p className="text-small text-danger-fg" role="alert" data-handoff-error>
            {error}
          </p>
        )}
        {sent.length > 0 && (
          <div className="rounded-md border border-line bg-subtle px-3 py-2">
            <p className="text-small font-medium text-fg-secondary">Recently sent</p>
            <ul className="mt-1 flex flex-col gap-1">
              {sent.map((s) => (
                <li key={s.id} className="flex min-w-0 items-center justify-between gap-3 text-small text-fg-secondary">
                  <span className="min-w-0 truncate">
                    {s.leadCount} to {nameOf(s.toEmail)}
                  </span>
                  <span className="shrink-0 text-fg-tertiary">{s.deliveredAt ? 'Received' : 'Waiting for them to open the app'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}

const POLL_MS = 120_000;

/** Collects leads sent to the signed-in person: shortly after the app opens, every 2 minutes, and on return to the tab. */
export function LeadHandoffSync() {
  const { status, identity } = useServerAuth();
  const toast = useToast();
  const email = identity?.email ?? '';
  const tenantCode = identity?.tenantCode ?? '';
  const tenantName = identity?.tenantName ?? '';
  const repName = identity?.repName ?? '';

  React.useEffect(() => {
    if (DEMO_LOGIN || status !== 'signed-in' || !email || !tenantCode) return;
    let alive = true;
    let last = 0;
    const run = async () => {
      if (!alive || document.visibilityState !== 'visible') return;
      last = Date.now();
      const collected = await collectLeadHandoffs({ email, tenantCode, tenantName, repName });
      if (!alive) return;
      for (const c of collected) toast({ message: describeCollected(c) });
    };
    // The first tries wait for SessionSync to confirm whose data is in this browser.
    const first = [setTimeout(run, 1200), setTimeout(run, 6000)];
    const poll = setInterval(run, POLL_MS);
    const onVisible = () => {
      if (Date.now() - last > 30_000) run();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      alive = false;
      first.forEach(clearTimeout);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [status, email, tenantCode, tenantName, repName, toast]);

  return null;
}
