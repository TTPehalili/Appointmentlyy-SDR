/**
 * Server only. Client Intake auto-apply: what an accepted submission does in the platform. Every one runs only behind
 * the owner's own Accept (or "Apply again") click, only into THIS project's chosen client workspace, and reuses the
 * platform's own functions and rules:
 *   branding  -> tenancy.cleanBranding + tenantStore.updateTenant (the same path as Platform Console > Workspaces)
 *   invites   -> tenancy.inviteMember (role rules, seat limit, staff-address refusal, re-invites), owner-approved rows only
 *   testers   -> the project's client-side people (the same rules as adding a person by hand)
 *   company   -> stored on the project (data only: Agreements has no per-client defaults to write to)
 * Nothing here sends email: invites are created in the workspace, and the owner sends them from the workspace.
 */
import { EMAIL_RE, PLATFORM_TENANT_CODE, parseRole, CLIENT_ROLES, type Role } from '@/lib/roles';
import { getTenantStore, newId, nowIso } from '@/lib/server/tenantStore';
import { cleanBranding, inviteMember, TenancyError, type Actor } from '@/lib/server/tenancy';
import { getClientProjectStore } from '@/lib/server/clientProjectStore';
import { line, personName } from '@/lib/server/clientProjects/core';
import { log, type Ctx } from '@/lib/server/clientProjects/service';
import { CP_LIMITS, type CompanyProfile, type Person, type Project } from '@/lib/clientProjects/types';
import type { ApplyResult, Answers, CpSubmission, TableRow } from '@/lib/clientProjects/intake';

const at = () => nowIso();
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** The project's client workspace, checked: it exists and is not the platform's own. */
export async function clientWorkspace(p: Project): Promise<{ code: string; name: string } | null> {
  const code = p.settings?.intake?.tenantCode;
  if (!code || code === PLATFORM_TENANT_CODE) return null;
  const t = await getTenantStore().getTenant(code);
  return t ? { code: t.code, name: t.name } : null;
}

export async function applyBranding(p: Project, answers: Answers, actor: Actor): Promise<ApplyResult> {
  const ws = await clientWorkspace(p);
  if (!ws) return { target: 'branding', ok: false, detail: 'Pick the client’s workspace on Client data first, then apply again.', at: at() };
  const store = getTenantStore();
  const tenant = await store.getTenant(ws.code);
  if (!tenant) return { target: 'branding', ok: false, detail: 'The client’s workspace was not found.', at: at() };
  const want: Record<string, unknown> = { brandColor: str(answers.primary) };
  if (str(answers.displayName)) want.displayName = str(answers.displayName);
  try {
    const branding = cleanBranding(want, tenant.branding);
    await store.updateTenant(ws.code, { branding });
    await store.addAudit({ actorEmail: actor.email, tenantCode: ws.code, action: 'tenant.update', target: ws.code, detail: { via: 'client-intake', projectId: p.id, branding: { brandColor: branding.brandColor ?? null, displayName: branding.displayName ?? null } } });
  } catch (err) {
    const msg = err instanceof TenancyError ? err.message : 'The workspace could not be updated.';
    return { target: 'branding', ok: false, detail: `Not applied: ${msg}`, at: at() };
  }
  const notes = [`Brand colour ${str(answers.primary)} set on ${ws.name}`];
  if (str(answers.displayName)) notes.push(`name shown: ${str(answers.displayName)}`);
  // The platform has no logo or second-colour setting yet: those are kept as data (Client data page).
  notes.push('logo and secondary colour kept on Client data (the workspace has no logo or second-colour setting yet)');
  return { target: 'branding', ok: true, detail: `${notes.join('; ')}.`, at: at() };
}

/** Map the form's role names onto the platform's client roles. */
function roleOf(v: string): Role | null {
  const r = parseRole(v);
  return r && CLIENT_ROLES.includes(r) ? r : null;
}

/**
 * Create the invites (no email is sent). `approved` is the owner's list of emails to create; anything not in it is
 * skipped. Each row reports its own outcome; one bad row never stops the others.
 */
export async function applyInvites(p: Project, rows: TableRow[], approved: string[] | null, actor: Actor): Promise<ApplyResult> {
  const ws = await clientWorkspace(p);
  if (!ws) return { target: 'invites', ok: false, detail: 'Pick the client’s workspace on Client data first, then apply again.', at: at() };
  const allow = approved ? new Set(approved.map((e) => e.toLowerCase())) : null;
  const store = getTenantStore();
  const out: { label: string; ok: boolean; note: string }[] = [];
  for (const r of rows.slice(0, 300)) {
    const email = str(r.email).trim().toLowerCase();
    const name = line(r.name, 80);
    if (allow && !allow.has(email)) {
      out.push({ label: email || name, ok: false, note: 'skipped (not approved)' });
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      out.push({ label: email || name, ok: false, note: 'not a valid email' });
      continue;
    }
    const role = roleOf(str(r.role));
    if (!role) {
      out.push({ label: email, ok: false, note: `unknown role “${str(r.role).slice(0, 30)}”` });
      continue;
    }
    try {
      const res = await inviteMember(actor, ws.code, { email, name, role });
      out.push({ label: email, ok: true, note: res.reinvited ? `invite refreshed (${role})` : `invited as ${role}` });
      await store.addAudit({ actorEmail: actor.email, tenantCode: ws.code, action: 'member.invite', target: email, detail: { via: 'client-intake', projectId: p.id, role, emailed: false } });
    } catch (err) {
      out.push({ label: email, ok: false, note: err instanceof TenancyError ? err.message : 'could not be invited' });
    }
  }
  const ok = out.filter((x) => x.ok).length;
  const tried = out.filter((x) => x.note !== 'skipped (not approved)').length;
  return {
    target: 'invites',
    ok: tried > 0 && ok === tried,
    detail: `${ok} of ${tried} invite${tried === 1 ? '' : 's'} created in ${ws.name}. No emails were sent: send them from the workspace’s Members page when you are ready.`,
    at: at(),
    rows: out,
  };
}

/** UAT lead and testers become client-side people on the project (skipped when the name or email is already there). */
export async function applyTesters(p: Project, rows: TableRow[], ctx: Ctx): Promise<ApplyResult> {
  const s = getClientProjectStore();
  const fresh = (await s.getProject(p.id)) ?? p;
  let people: Person[] = [...(fresh.people ?? [])];
  const out: { label: string; ok: boolean; note: string }[] = [];
  for (const r of rows.slice(0, 40)) {
    const name = personName(r.name);
    const email = str(r.email).trim().toLowerCase();
    if (name.length < 2) {
      out.push({ label: str(r.name).slice(0, 80), ok: false, note: 'the name cannot be used' });
      continue;
    }
    if (people.some((x) => x.name.toLowerCase() === name.toLowerCase() || (email && x.email === email))) {
      out.push({ label: name, ok: true, note: 'already on the project' });
      continue;
    }
    if (people.length >= CP_LIMITS.people) {
      out.push({ label: name, ok: false, note: `the project already has ${CP_LIMITS.people} people` });
      continue;
    }
    const person: Person = { id: newId(), name, email: EMAIL_RE.test(email) ? email : '', side: 'client', role: line(r.role === 'UAT lead' ? 'UAT lead' : 'UAT tester', CP_LIMITS.roleLabel), createdAt: nowIso() };
    people = [...people, person];
    out.push({ label: name, ok: true, note: `added as ${person.role}` });
    await log(p, null, ctx.actor, 'person_added', { personId: person.id, name: person.name, side: 'client', hasEmail: Boolean(person.email), via: 'client-intake' });
  }
  await s.updateProject(p.id, { people, settings: { ...(fresh.settings ?? {}), peopleSeeded: true } as Project['settings'] });
  const added = out.filter((x) => x.note.startsWith('added')).length;
  return { target: 'testers', ok: out.every((x) => x.ok), detail: `${added} added as client people on the project${out.length > added ? `, ${out.length - added} already there or skipped` : ''}.`, at: at(), rows: out };
}

/** Company details: stored on the project (Client data) for the Agreements and billing fields. Data only. */
export async function applyCompany(p: Project, sub: CpSubmission): Promise<ApplyResult> {
  const a = sub.answers;
  const company: CompanyProfile = {
    legalName: str(a.legalName),
    secNo: str(a.secNo),
    tin: str(a.tin),
    address: str(a.address),
    website: str(a.website),
    signatoryName: str(a.signatoryName),
    signatoryTitle: str(a.signatoryTitle),
    billingEmail: str(a.billingEmail),
    phone: str(a.phone),
    version: sub.version,
    acceptedAt: nowIso(),
  };
  const s = getClientProjectStore();
  const fresh = (await s.getProject(p.id)) ?? p;
  await s.updateProject(p.id, { settings: { ...(fresh.settings ?? {}), intake: { ...(fresh.settings?.intake ?? {}), company } } as Project['settings'] });
  return {
    target: 'company',
    ok: true,
    dataOnly: true,
    detail: 'Company profile saved on Client data, with the Agreements field values ready to copy (Agreements has no per-client defaults to prefill automatically).',
    at: at(),
  };
}

/** The Agreements template fields the company profile fills (proposal and billing statement). Shown on Client data. */
export function agreementFieldsOf(c: CompanyProfile): Record<string, string> {
  const parts = c.address.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
  return {
    clientLegal: c.legalName,
    clientSecNo: c.secNo,
    clientStreet: parts.slice(0, -1).join(', ') || c.address,
    clientCity: parts.length > 1 ? parts[parts.length - 1] : '',
    clientAddress: c.address.replace(/\n+/g, ', '),
    clientTin: c.tin,
    recipientName: c.signatoryName,
    recipientTitle: c.signatoryTitle,
    recipientEmail: c.billingEmail,
  };
}
