/**
 * Server only. Email delegates: a platform owner lets one of their own workspace's members (their
 * assistant) send and reply to email AS the owner, and see the replies in the Inbox.
 *
 * Stored in the platform workspace's `branding.emailDelegates` (an existing JSON column, so no
 * migration): a list of { delegateEmail, ownerEmail, setAt }. Nothing here comes from a request
 * body: the owner is the signed-in caller, the delegate is looked up from the member record.
 *
 * A delegation gives exactly two things: the owner's sender identity (sendingPolicy.senderFor) and
 * the owner workspace's reply mailbox (email/inbound GET). It never changes the delegate's role or
 * isPlatformAdmin, so every other guard treats them as the Rep (or whatever role) they are.
 *
 * It is re-checked against storage on every use and stops working the moment:
 *  - the owner revokes it, or the delegate is removed (the entry is also deleted then);
 *  - the delegate becomes platform staff, or signs in to another workspace;
 *  - the owner is no longer active platform staff.
 */
import { PLATFORM_TENANT_CODE } from '@/lib/roles';
import { getAdminEmails } from '@/lib/authToken';
import { getTenantStore, type Member, type TenantBranding } from '@/lib/server/tenantStore';
import { TenancyError, displayNameFor, isPlatformAdmin } from '@/lib/server/tenancy';
import type { ServerSession } from '@/lib/server/session';

export interface EmailDelegate {
  delegateEmail: string;
  ownerEmail: string;
  setAt: string;
}

export interface ActiveDelegation extends EmailDelegate {
  /** The owner's name exactly as the owner's own session would carry it. */
  ownerName: string;
}

const MAX_DELEGATES = 20;
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

/** The stored list, with anything malformed dropped. */
export function readDelegates(branding: TenantBranding | null | undefined): EmailDelegate[] {
  const raw = branding?.emailDelegates;
  if (!Array.isArray(raw)) return [];
  const out: EmailDelegate[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const delegateEmail = norm(r.delegateEmail);
    const ownerEmail = norm(r.ownerEmail);
    if (!delegateEmail || !ownerEmail || delegateEmail === ownerEmail) continue;
    if (out.some((d) => d.delegateEmail === delegateEmail)) continue; // one owner per delegate
    out.push({ delegateEmail, ownerEmail, setAt: String(r.setAt ?? '') });
  }
  return out;
}

const isActiveStaff = (email: string, platformRows: Member[]) =>
  getAdminEmails().includes(email) || platformRows.some((m) => m.status === 'active' && m.role === 'Super Admin');

/**
 * The delegation this signed-in person holds right now, or null. Everyone who is not listed as a
 * delegate returns null before any storage read, so their requests cost and behave as before.
 */
export async function activeDelegation(
  session: Pick<ServerSession, 'email' | 'tenantCode' | 'isPlatformAdmin' | 'identity'>,
): Promise<ActiveDelegation | null> {
  if (session.isPlatformAdmin || session.tenantCode !== PLATFORM_TENANT_CODE) return null;
  if (session.identity.tenant.code !== PLATFORM_TENANT_CODE) return null;
  const me = norm(session.email);
  if (!readDelegates(session.identity.tenant.branding).some((d) => d.delegateEmail === me)) return null;

  // Listed in the session's copy of the workspace: confirm against storage now (that copy can be a
  // few seconds old), so a revoke or a removal applies to the very next send.
  const store = getTenantStore();
  const tenant = await store.getTenant(PLATFORM_TENANT_CODE);
  const entry = readDelegates(tenant?.branding).find((d) => d.delegateEmail === me);
  if (!entry) return null;
  const [selfRows, ownerRows] = await Promise.all([
    store.listMembers({ tenantCode: PLATFORM_TENANT_CODE, email: session.email }),
    store.listMembers({ tenantCode: PLATFORM_TENANT_CODE, email: entry.ownerEmail }),
  ]);
  const self = selfRows.find((m) => m.status !== 'removed');
  if (!self || self.status !== 'active') return null;
  if (isActiveStaff(me, selfRows)) return null;
  if (!isActiveStaff(entry.ownerEmail, ownerRows)) return null;
  // Same name rule as the owner's own session (resolveIdentity): their platform member record.
  return { ...entry, ownerName: displayNameFor(entry.ownerEmail, ownerRows[0]?.name) };
}

async function writeDelegates(next: EmailDelegate[]): Promise<void> {
  const store = getTenantStore();
  const tenant = await store.getTenant(PLATFORM_TENANT_CODE);
  if (!tenant) throw new TenancyError('The platform workspace was not found.', 500);
  const branding: TenantBranding = { ...tenant.branding };
  if (next.length) branding.emailDelegates = next;
  else delete branding.emailDelegates;
  await store.updateTenant(PLATFORM_TENANT_CODE, { branding });
}

async function currentDelegates(): Promise<EmailDelegate[]> {
  return readDelegates((await getTenantStore().getTenant(PLATFORM_TENANT_CODE))?.branding);
}

/** The platform-workspace member the owner is acting on (404 for anything else). */
async function platformMember(memberId: string): Promise<Member> {
  const m = await getTenantStore().getMember(memberId);
  if (!m || m.tenantCode !== PLATFORM_TENANT_CODE) throw new TenancyError('Not found.', 404);
  return m;
}

/** Owner only (the route checks requireOwner): let this member send as the caller. */
export async function grantEmailDelegate(owner: Pick<ServerSession, 'email' | 'tenantCode' | 'isPlatformAdmin'>, memberId: string): Promise<EmailDelegate> {
  if (!owner.isPlatformAdmin || owner.tenantCode !== PLATFORM_TENANT_CODE) throw new TenancyError('Not allowed.', 403);
  const member = await platformMember(memberId);
  if (member.status === 'removed') throw new TenancyError('Not found.', 404);
  const ownerEmail = norm(owner.email);
  const delegateEmail = norm(member.email);
  if (delegateEmail === ownerEmail) throw new TenancyError('You already send as yourself. Pick someone else.', 400);
  if (member.role === 'Super Admin' || (await isPlatformAdmin(member.email))) {
    throw new TenancyError('Platform staff send as themselves. Pick a member who is not a Super Admin.', 400);
  }
  const list = await currentDelegates();
  const existing = list.find((d) => d.delegateEmail === delegateEmail);
  if (existing && existing.ownerEmail === ownerEmail) return existing;
  if (existing) throw new TenancyError('This person already sends as someone else.', 409);
  if (list.length >= MAX_DELEGATES) throw new TenancyError('Too many people already send as someone. Stop one first.', 409);
  const entry: EmailDelegate = { delegateEmail, ownerEmail, setAt: new Date().toISOString() };
  await writeDelegates([...list, entry]);
  await getTenantStore().addAudit({
    actorEmail: owner.email,
    tenantCode: PLATFORM_TENANT_CODE,
    action: 'email_delegate.grant',
    target: delegateEmail,
    detail: { delegateEmail, ownerEmail },
  });
  return entry;
}

/** Owner only: stop this member sending as the caller. Returns false if they were not. */
export async function revokeEmailDelegate(owner: Pick<ServerSession, 'email' | 'tenantCode' | 'isPlatformAdmin'>, memberId: string): Promise<boolean> {
  if (!owner.isPlatformAdmin || owner.tenantCode !== PLATFORM_TENANT_CODE) throw new TenancyError('Not allowed.', 403);
  const member = await platformMember(memberId);
  const ownerEmail = norm(owner.email);
  const delegateEmail = norm(member.email);
  const list = await currentDelegates();
  const existing = list.find((d) => d.delegateEmail === delegateEmail);
  if (!existing) return false;
  if (existing.ownerEmail !== ownerEmail) throw new TenancyError('This person sends as someone else. Only that person can stop it.', 403);
  await writeDelegates(list.filter((d) => d.delegateEmail !== delegateEmail));
  await getTenantStore().addAudit({
    actorEmail: owner.email,
    tenantCode: PLATFORM_TENANT_CODE,
    action: 'email_delegate.revoke',
    target: delegateEmail,
    detail: { delegateEmail, ownerEmail },
  });
  return true;
}

/**
 * A platform-workspace member is being removed or is changing role: delete what they hold, so a
 * later re-invite or role change can never bring an old delegation back. Called BEFORE the member
 * record changes (if this fails, the member is not changed either).
 */
export async function endEmailDelegationsFor(
  member: Pick<Member, 'email' | 'tenantCode'>,
  actorEmail: string,
  opts: { asDelegate: boolean; asOwner: boolean; reason: string },
): Promise<void> {
  if (member.tenantCode !== PLATFORM_TENANT_CODE) return;
  const email = norm(member.email);
  const list = await currentDelegates();
  const ended = list.filter((d) => (opts.asDelegate && d.delegateEmail === email) || (opts.asOwner && d.ownerEmail === email));
  if (!ended.length) return;
  await writeDelegates(list.filter((d) => !ended.includes(d)));
  const store = getTenantStore();
  for (const d of ended) {
    await store.addAudit({
      actorEmail,
      tenantCode: PLATFORM_TENANT_CODE,
      action: 'email_delegate.end',
      target: d.delegateEmail,
      detail: { delegateEmail: d.delegateEmail, ownerEmail: d.ownerEmail, reason: opts.reason },
    });
  }
}

/**
 * A branding save built from the session's copy of the workspace must not put back (or drop) the
 * delegate list as it was a few seconds ago: take the list from storage as it is now.
 */
export async function withStoredDelegates(tenantCode: string, branding: TenantBranding): Promise<TenantBranding> {
  if (tenantCode !== PLATFORM_TENANT_CODE) return branding;
  const out: TenantBranding = { ...branding };
  const list = await currentDelegates();
  if (list.length) out.emailDelegates = list;
  else delete out.emailDelegates;
  return out;
}

/** The record that names the real sender. No subject, no body. */
export async function auditDelegatedSend(d: ActiveDelegation, info: { via: string; to: unknown }): Promise<void> {
  const all = Array.isArray(info.to) ? info.to : [info.to];
  const to = all.slice(0, 20).map((v) => String(v ?? '').slice(0, 254));
  await getTenantStore().addAudit({
    actorEmail: d.delegateEmail,
    tenantCode: PLATFORM_TENANT_CODE,
    action: 'email.send_as',
    target: d.ownerEmail,
    detail: { summary: `sent by ${d.delegateEmail} as ${d.ownerEmail}`, sentBy: d.delegateEmail, sentAs: d.ownerEmail, via: info.via, to, toCount: all.length },
  });
}
