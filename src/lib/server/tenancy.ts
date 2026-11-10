/**
 * Server-only tenant rules: who belongs where, seat limits, who may grant which role.
 * Route handlers call these; nothing here trusts tenant or role values sent by the browser.
 */
import crypto from 'node:crypto';
import {
  CLIENT_ROLES,
  GRANTABLE,
  PLATFORM_TENANT_CODE,
  PLATFORM_TENANT_NAME,
  ROLE_RANK,
  TENANT_CODE_RE,
  type Role,
} from '@/lib/roles';
import { getAdminEmails } from '@/lib/authToken';
import { normalizeHex, checkBrandColor } from '@/lib/theme';
import {
  DuplicateError,
  getTenantStore,
  newId,
  nowIso,
  type Member,
  type Tenant,
  type TenantBranding,
} from '@/lib/server/tenantStore';

export class TenancyError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
  }
}

export const DEFAULT_MODULES: Record<string, boolean> = {
  dialer: true,
  practice: true,
  certificationGate: true,
  leadFinder: true,
  outreach: true,
};

/** Make sure the platform workspace exists (first run). */
export async function ensurePlatformTenant(): Promise<Tenant> {
  const store = getTenantStore();
  const existing = await store.getTenant(PLATFORM_TENANT_CODE);
  if (existing) return existing;
  try {
    return await store.insertTenant({
      code: PLATFORM_TENANT_CODE,
      name: PLATFORM_TENANT_NAME,
      plan: 'Platform',
      seatLimit: 0,
      status: 'active',
      modules: { ...DEFAULT_MODULES },
      branding: {},
      createdBy: 'system',
      createdAt: nowIso(),
    });
  } catch (err) {
    if (err instanceof DuplicateError) return (await store.getTenant(PLATFORM_TENANT_CODE))!;
    throw err;
  }
}

/** Platform staff: AUTH_ADMIN_EMAILS, or an active Super Admin member of the platform workspace. */
export async function isPlatformAdmin(email: string): Promise<boolean> {
  if (getAdminEmails().includes(email)) return true;
  const rows = await getTenantStore().listMembers({ tenantCode: PLATFORM_TENANT_CODE, email });
  return rows.some((m) => m.status === 'active' && m.role === 'Super Admin');
}

export function seatsUsed(members: Member[]): number {
  return members.filter((m) => m.status !== 'removed').length;
}

// ------------------------------------------------------------------ sign-in resolution

export interface ResolvedIdentity {
  email: string;
  name: string;
  role: Role;
  tenant: Tenant;
  isPlatformAdmin: boolean;
  member: Member | null;
}

/**
 * Who this email is inside `tenantCode`, checked against storage right now. Returns null if they
 * have no live membership there (removed, never invited, or the workspace is suspended).
 */
export async function resolveIdentity(email: string, tenantCode: string, fallbackName = ''): Promise<ResolvedIdentity | null> {
  const store = getTenantStore();
  await ensurePlatformTenant();
  const platform = await isPlatformAdmin(email);
  const tenant = await store.getTenant(tenantCode);

  if (platform) {
    // Platform staff may open any workspace (suspended ones too, to fix them).
    const target = tenant ?? (await store.getTenant(PLATFORM_TENANT_CODE))!;
    const own = (await store.listMembers({ tenantCode: PLATFORM_TENANT_CODE, email }))[0] ?? null;
    return {
      email,
      name: own?.name || fallbackName || email,
      role: 'Super Admin',
      tenant: target,
      isPlatformAdmin: true,
      member: own,
    };
  }

  if (!tenant || tenant.status !== 'active') return null;
  const member = (await store.listMembers({ tenantCode, email })).find((m) => m.status !== 'removed') ?? null;
  if (!member) return null;
  return { email, name: member.name || fallbackName || email, role: member.role, tenant, isPlatformAdmin: false, member };
}

/** Workspaces this email can use: every tenant for platform staff, otherwise live memberships. */
export async function listWorkspacesFor(email: string): Promise<Tenant[]> {
  const store = getTenantStore();
  if (await isPlatformAdmin(email)) return store.listTenants();
  const memberships = (await store.listMembers({ email })).filter((m) => m.status !== 'removed');
  const tenants = await Promise.all(memberships.map((m) => store.getTenant(m.tenantCode)));
  return tenants.filter((t): t is Tenant => !!t && t.status === 'active');
}

/** Workspace to sign a login link into: platform for staff, else the most recently used membership. */
export async function pickLoginWorkspace(email: string): Promise<string | null> {
  if (await isPlatformAdmin(email)) return PLATFORM_TENANT_CODE;
  const store = getTenantStore();
  const memberships = (await store.listMembers({ email })).filter((m) => m.status !== 'removed');
  const live: Member[] = [];
  for (const m of memberships) {
    const t = await store.getTenant(m.tenantCode);
    if (t?.status === 'active') live.push(m);
  }
  live.sort((a, b) => (b.lastLoginAt || b.invitedAt).localeCompare(a.lastLoginAt || a.invitedAt));
  return live[0]?.tenantCode ?? null;
}

export async function recordLogin(identity: ResolvedIdentity, via: string) {
  const store = getTenantStore();
  if (identity.member && identity.member.tenantCode === identity.tenant.code) {
    await store.updateMember(identity.member.id, {
      lastLoginAt: nowIso(),
      ...(identity.member.status === 'invited' ? { status: 'active', joinedAt: nowIso() } : {}),
    });
  }
  await store.addAudit({ actorEmail: identity.email, tenantCode: identity.tenant.code, action: 'login', target: identity.email, detail: { via } });
}

// ------------------------------------------------------------------ tenants

export interface CreateTenantInput {
  name: string;
  code?: string;
  plan?: string;
  seatLimit?: number;
  modules?: Record<string, boolean>;
  branding?: TenantBranding;
}

export function cleanBranding(input: unknown, current: TenantBranding = {}): TenantBranding {
  const b = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: TenantBranding = { ...current };
  if ('brandColor' in b) {
    const raw = String(b.brandColor ?? '').trim();
    if (!raw) delete out.brandColor;
    else {
      const hex = normalizeHex(raw);
      const check = checkBrandColor(raw);
      if (!hex || !check.ok) throw new TenancyError(`Brand colour: ${check.message}`);
      out.brandColor = hex;
    }
  }
  if ('displayName' in b) {
    const v = String(b.displayName ?? '').trim().slice(0, 60);
    if (v) out.displayName = v;
    else delete out.displayName;
  }
  if ('logoInitials' in b) {
    const v = String(b.logoInitials ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase();
    if (v) out.logoInitials = v;
    else delete out.logoInitials;
  }
  if ('supportEmail' in b) {
    const v = String(b.supportEmail ?? '').trim().toLowerCase().slice(0, 254);
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) throw new TenancyError('Support email is not a valid address.');
    if (v) out.supportEmail = v;
    else delete out.supportEmail;
  }
  return out;
}

export async function createTenant(input: CreateTenantInput, actorEmail: string): Promise<Tenant> {
  const name = String(input.name || '').trim().slice(0, 80);
  if (name.length < 2) throw new TenancyError('Enter the company name.');
  const code = String(input.code || '').trim().toUpperCase();
  if (!TENANT_CODE_RE.test(code)) throw new TenancyError('Workspace code must be 2-32 letters, numbers or dashes.');
  if (code === PLATFORM_TENANT_CODE) throw new TenancyError('That workspace code is reserved.');
  const seatLimit = Math.floor(Number(input.seatLimit ?? 10));
  if (!Number.isFinite(seatLimit) || seatLimit < 1 || seatLimit > 5000) throw new TenancyError('Seats must be between 1 and 5000.');

  const modules = { ...DEFAULT_MODULES };
  for (const k of Object.keys(DEFAULT_MODULES)) if (input.modules && k in input.modules) modules[k] = Boolean(input.modules[k]);

  const store = getTenantStore();
  try {
    const tenant = await store.insertTenant({
      code,
      name,
      plan: String(input.plan || 'Standard').slice(0, 60),
      seatLimit,
      status: 'active',
      modules,
      branding: cleanBranding(input.branding),
      createdBy: actorEmail,
      createdAt: nowIso(),
    });
    await store.addAudit({ actorEmail, tenantCode: code, action: 'tenant.create', target: code, detail: { name, seatLimit } });
    return tenant;
  } catch (err) {
    if (err instanceof DuplicateError) throw new TenancyError(`The workspace code ${code} is already taken. Pick another.`, 409);
    throw err;
  }
}

// ------------------------------------------------------------------ members

export interface Actor {
  email: string;
  name: string;
  role: Role;
  tenantCode: string;
  isPlatformAdmin: boolean;
}

export interface InviteResult {
  member: Member;
  nonce: string;
  reinvited: boolean;
}

/** Create (or refresh) an invite. Enforces role-granting rules and the seat limit. */
export async function inviteMember(
  actor: Actor,
  tenantCode: string,
  input: { email: string; name?: string; role: Role },
): Promise<InviteResult> {
  if (!actor.isPlatformAdmin && actor.tenantCode !== tenantCode) throw new TenancyError('You can only invite people to your own workspace.', 403);
  const allowed = GRANTABLE[actor.role] ?? [];
  if (!allowed.includes(input.role)) throw new TenancyError(`As ${actor.role} you can't give someone the ${input.role} role.`, 403);
  if (tenantCode !== PLATFORM_TENANT_CODE && !CLIENT_ROLES.includes(input.role)) {
    throw new TenancyError('Super Admin is only for Appointmentlyy staff. Pick Admin for the client’s lead.', 400);
  }

  const store = getTenantStore();
  const tenant = await store.getTenant(tenantCode);
  if (!tenant) throw new TenancyError('That workspace does not exist.', 404);
  if (tenant.status !== 'active') throw new TenancyError('This workspace is suspended. Reactivate it before inviting people.', 409);

  const members = await store.listMembers({ tenantCode });
  const existing = members.find((m) => m.email === input.email);
  const nonce = crypto.randomBytes(16).toString('base64url');

  if (existing && existing.status === 'active') {
    throw new TenancyError(`${input.email} is already a member of ${tenant.name}.`, 409);
  }
  if (existing && !actor.isPlatformAdmin) {
    // Re-inviting changes someone's pending access, so the same rules as editing them apply.
    if (ROLE_RANK[existing.role] > ROLE_RANK[actor.role]) {
      throw new TenancyError(`Only someone at ${existing.role} level or above can re-invite ${input.email}.`, 403);
    }
    if (existing.status === 'removed' && ROLE_RANK[actor.role] < ROLE_RANK.Admin) {
      throw new TenancyError('Only an admin can bring back someone who was removed.', 403);
    }
  }
  if (existing && existing.role === 'Admin' && input.role !== 'Admin' && existing.status !== 'removed') {
    await assertNotLastAdmin(existing);
  }
  const willTakeSeat = !existing || existing.status === 'removed';
  if (tenant.seatLimit > 0 && willTakeSeat && seatsUsed(members) >= tenant.seatLimit) {
    throw new TenancyError(`All ${tenant.seatLimit} seats in ${tenant.name} are used. Add seats or remove someone first.`, 409);
  }

  let member: Member;
  if (existing) {
    member = (await store.updateMember(existing.id, {
      name: input.name || existing.name,
      role: input.role,
      status: 'invited',
      invitedBy: actor.name || actor.email,
      invitedAt: nowIso(),
      inviteNonce: nonce,
    }))!;
  } else {
    member = await store.insertMember({
      id: newId(),
      tenantCode,
      email: input.email,
      name: input.name || '',
      role: input.role,
      status: 'invited',
      invitedBy: actor.name || actor.email,
      invitedAt: nowIso(),
      joinedAt: null,
      lastLoginAt: null,
      inviteNonce: nonce,
    });
  }
  await store.addAudit({
    actorEmail: actor.email,
    tenantCode,
    action: existing ? 'member.reinvite' : 'member.invite',
    target: input.email,
    detail: { role: input.role },
  });
  return { member, nonce, reinvited: Boolean(existing) };
}

function assertCanManage(actor: Actor, target: Member) {
  if (!actor.isPlatformAdmin && actor.tenantCode !== target.tenantCode) throw new TenancyError('Not found.', 404);
  if (target.email === actor.email) throw new TenancyError('You can’t change your own access. Ask another admin.', 403);
  if (!actor.isPlatformAdmin && ROLE_RANK[actor.role] < 2) throw new TenancyError('Only admins can change members.', 403);
  if (ROLE_RANK[target.role] > ROLE_RANK[actor.role]) throw new TenancyError(`You can’t change a ${target.role}.`, 403);
}

async function assertNotLastAdmin(target: Member) {
  if (target.role !== 'Admin' || target.tenantCode === PLATFORM_TENANT_CODE) return;
  // Only admins who have actually accepted count: a pending (maybe mistyped) invite can't run the workspace.
  const admins = (await getTenantStore().listMembers({ tenantCode: target.tenantCode })).filter(
    (m) => m.role === 'Admin' && m.status === 'active' && m.id !== target.id,
  );
  if (admins.length === 0) throw new TenancyError('This is the workspace’s only admin. Make someone else Admin first.', 409);
}

export async function changeMemberRole(actor: Actor, memberId: string, role: Role): Promise<Member> {
  const store = getTenantStore();
  const target = await store.getMember(memberId);
  if (!target) throw new TenancyError('Not found.', 404);
  assertCanManage(actor, target);
  if (!(GRANTABLE[actor.role] ?? []).includes(role)) throw new TenancyError(`As ${actor.role} you can't give the ${role} role.`, 403);
  if (target.tenantCode !== PLATFORM_TENANT_CODE && !CLIENT_ROLES.includes(role)) throw new TenancyError('Super Admin is only for Appointmentlyy staff.');
  if (role !== 'Admin') await assertNotLastAdmin(target);
  const updated = (await store.updateMember(memberId, { role }))!;
  await store.addAudit({ actorEmail: actor.email, tenantCode: target.tenantCode, action: 'member.role', target: target.email, detail: { from: target.role, to: role } });
  return updated;
}

export async function removeMember(actor: Actor, memberId: string): Promise<Member> {
  const store = getTenantStore();
  const target = await store.getMember(memberId);
  if (!target) throw new TenancyError('Not found.', 404);
  assertCanManage(actor, target);
  await assertNotLastAdmin(target);
  const updated = (await store.updateMember(memberId, { status: 'removed', inviteNonce: null }))!;
  await store.addAudit({ actorEmail: actor.email, tenantCode: target.tenantCode, action: 'member.remove', target: target.email, detail: {} });
  return updated;
}
