import { NextRequest, NextResponse } from 'next/server';
import { AVATAR_PRESETS } from '@/lib/avatarPresets';
import { OWNER_PHOTO, parseAvatarInput, presetValue } from '@/lib/avatar';
import { getAdminEmails, rateLimit } from '@/lib/authToken';
import { PLATFORM_TENANT_CODE, ROLE_RANK, type Role } from '@/lib/roles';
import { getServerSession, hasRank, type ServerSession } from '@/lib/server/session';
import { getTenantStore, nowIso } from '@/lib/server/tenantStore';
import { displayNameFor } from '@/lib/server/tenancy';
import {
  AvatarStorageError,
  avatarSrcs,
  clearAvatar,
  decodeAvatarUpload,
  displaySrc,
  hasOwnerDefault,
  saveAvatar,
  workspaceAvatars,
} from '@/lib/server/avatars';
import { invalidateDirectory } from '@/lib/server/chatApi';
import { publishChat } from '@/lib/server/chatBus';

/**
 * Profile photos in the signed-in person's current workspace (always from the session).
 *
 * GET    /api/profile/avatar[?emails=a@x.com,b@x.com]  photos to show: { avatars: { email: src | null } }
 * PUT    /api/profile/avatar { avatar, email? }        set your own photo, or (Admin+) a member's
 * DELETE /api/profile/avatar[?email=]                  remove it (initials show instead)
 *
 * `avatar` is `preset:avatar-01`, a built-in photo path, or an upload as a data URL (WebP / JPEG /
 * PNG, at most 200 KB decoded; the browser resizes to 256 px first). Admins can change people of
 * their own rank or below in the workspace they are in; changes by anyone are in the audit log.
 */

const noStore = { 'Cache-Control': 'no-store' };
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: noStore });
const fail = (status: number, error: string) => json({ success: false, error }, status);

interface Person {
  email: string;
  name: string;
  role: Role;
}

/** Everyone who can show up in this workspace: live members, platform staff (platform workspace), you. */
async function peopleOf(session: ServerSession): Promise<Map<string, Person>> {
  const rows = await getTenantStore().listMembers({ tenantCode: session.tenantCode });
  const out = new Map<string, Person>();
  for (const m of rows) {
    if (m.status === 'removed') continue;
    const email = m.email.toLowerCase();
    out.set(email, { email, name: displayNameFor(email, m.name), role: m.role });
  }
  if (session.tenantCode === PLATFORM_TENANT_CODE) {
    for (const email of getAdminEmails()) out.set(email, { email, name: out.get(email)?.name ?? displayNameFor(email), role: 'Super Admin' });
  }
  const me = session.email.toLowerCase();
  if (!out.has(me)) out.set(me, { email: me, name: session.name, role: session.role });
  return out;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  try {
    const people = await peopleOf(session);
    const asked = (req.nextUrl.searchParams.get('emails') || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 200);
    const list = asked.length ? asked.map((e) => people.get(e)).filter((p): p is Person => !!p) : [...people.values()];
    const avatars = await avatarSrcs(session.tenantCode, list);
    // Anyone asked about who isn't in this workspace simply has no photo here.
    for (const e of asked) if (!(e in avatars)) avatars[e] = null;
    return json({ success: true, me: session.email.toLowerCase(), avatars, canManage: hasRank(session, 'Admin') });
  } catch (err) {
    console.error('[profile/avatar GET]', err);
    return fail(500, 'Could not load profile photos.');
  }
}

type Target = { email: string; name: string; self: boolean };

/** Whose photo this request changes, or why not. Members outside the current workspace are "not found". */
async function targetOf(session: ServerSession, raw: unknown): Promise<Target | NextResponse> {
  const me = session.email.toLowerCase();
  const email = typeof raw === 'string' && raw.trim() ? raw.trim().toLowerCase() : me;
  if (email === me) return { email, name: session.name, self: true };
  if (!hasRank(session, 'Admin')) return fail(403, 'Only admins can change someone else’s photo.');
  const person = (await peopleOf(session)).get(email);
  if (!person) return fail(404, 'That person is not in this workspace.');
  if (!session.isPlatformAdmin && ROLE_RANK[person.role] > ROLE_RANK[session.role]) return fail(403, `You can’t change a ${person.role}’s photo.`);
  return { email, name: person.name, self: false };
}

/** Tell open chat windows and forget cached directories. */
async function announce(tenantCode: string, t: Target): Promise<string | null> {
  invalidateDirectory(tenantCode);
  const src = displaySrc(tenantCode, t.email, t.name, (await workspaceAvatars(tenantCode)).get(t.email));
  publishChat(tenantCode, { type: 'member', email: t.email, avatar: src, at: nowIso() });
  return src;
}

const notReady = () => fail(503, 'Profile photos aren’t switched on for this workspace yet. Contact Appointmentlyy support.');

export async function PUT(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  if (!rateLimit(`avatar:${session.email}`, 30, 10 * 60_000)) return fail(429, 'Too many photo changes. Try again in a few minutes.');
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return fail(400, 'Pick a photo or an avatar.');
  const target = await targetOf(session, body.email);
  if (target instanceof NextResponse) return target;

  const parsed = parseAvatarInput(body.avatar);
  if (!parsed.ok) return fail(400, parsed.error);
  let value = parsed.value;
  if (parsed.kind === 'photo') {
    // Built-in files: a preset's file is saved as the preset; the founder's photo only for the founder.
    const preset = AVATAR_PRESETS.find((p) => p.src === value);
    if (preset) value = presetValue(preset.id);
    else if (!(value === OWNER_PHOTO && hasOwnerDefault(session.tenantCode, target.email, target.name))) return fail(400, 'That photo is not available.');
  }
  if (parsed.kind === 'upload' && !decodeAvatarUpload(value)) return fail(400, 'That file isn’t a valid JPG, PNG or WebP image.');

  try {
    await saveAvatar(session.tenantCode, target.email, value, session.email);
    await getTenantStore().addAudit({
      actorEmail: session.email,
      tenantCode: session.tenantCode,
      action: 'member.avatar',
      target: target.email,
      detail: { change: parsed.kind, ...(parsed.presetId ? { preset: parsed.presetId } : {}), self: target.self },
    });
    const avatar = await announce(session.tenantCode, target);
    return json({ success: true, email: target.email, avatar });
  } catch (err) {
    if (err instanceof AvatarStorageError) {
      console.error('[profile/avatar PUT] member_avatars table missing: run supabase/migrations/20261119000000_member_avatar.sql', err.message);
      return notReady();
    }
    console.error('[profile/avatar PUT]', err);
    return fail(500, 'Could not save the photo.');
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  if (!rateLimit(`avatar:${session.email}`, 30, 10 * 60_000)) return fail(429, 'Too many photo changes. Try again in a few minutes.');
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const target = await targetOf(session, req.nextUrl.searchParams.get('email') ?? body?.email);
  if (target instanceof NextResponse) return target;
  try {
    await clearAvatar(session.tenantCode, target.email, target.name, session.email);
    await getTenantStore().addAudit({
      actorEmail: session.email,
      tenantCode: session.tenantCode,
      action: 'member.avatar',
      target: target.email,
      detail: { change: 'removed', self: target.self },
    });
    const avatar = await announce(session.tenantCode, target);
    return json({ success: true, email: target.email, avatar });
  } catch (err) {
    if (err instanceof AvatarStorageError) {
      console.error('[profile/avatar DELETE] member_avatars table missing', err.message);
      return notReady();
    }
    console.error('[profile/avatar DELETE]', err);
    return fail(500, 'Could not remove the photo.');
  }
}
