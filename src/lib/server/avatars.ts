/**
 * Server-only storage for profile photos, one per person per workspace. Same two backends as
 * tenantStore: Supabase (table in supabase/migrations/20261119000000_member_avatar.sql) or a JSON
 * file (TENANCY_DATA_DIR/avatars.json) for local work on a single server.
 *
 * Kept out of tenant_members on purpose: every request re-reads the member row for the session,
 * so photo bytes there would be fetched constantly; and platform staff (AUTH_ADMIN_EMAILS) may
 * have no member row at all. Listing never reads image bytes: uploads are served one at a time
 * by GET /api/profile/avatar/image.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getAdminEmails } from '@/lib/authToken';
import { PLATFORM_TENANT_CODE } from '@/lib/roles';
import { nowIso } from '@/lib/server/tenantStore';
import {
  AVATAR_IMAGE_ROUTE,
  AVATAR_NONE,
  OWNER_PHOTO,
  avatarImageSrc,
  parseAvatarDataUrl,
  type AvatarMime,
} from '@/lib/avatar';

/** One saved avatar. `avatar` is a preset / site path / `none`, or `upload` (bytes in `image`). */
export interface AvatarRow {
  tenantCode: string;
  email: string;
  avatar: string;
  /** Short content hash: part of the image URL, so browsers can cache uploads for good. */
  version: string;
  updatedAt: string;
  updatedBy: string;
}

interface StoredAvatar extends AvatarRow {
  /** Upload only: the data URL. */
  image: string | null;
}

/** The database table isn't there yet (migration not run). */
export class AvatarStorageError extends Error {}

interface AvatarStore {
  list(tenantCode: string): Promise<AvatarRow[]>;
  image(tenantCode: string, email: string): Promise<{ image: string; version: string } | null>;
  put(row: StoredAvatar): Promise<void>;
  remove(tenantCode: string, email: string): Promise<void>;
}

// ------------------------------------------------------------------ file backend

class FileAvatarStore implements AvatarStore {
  private file: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(dir: string) {
    this.file = path.join(dir, 'avatars.json');
  }
  private read(): StoredAvatar[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { rows?: StoredAvatar[] };
      return parsed.rows ?? [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }
  private mutate(fn: (rows: StoredAvatar[]) => StoredAvatar[]): Promise<void> {
    const run = this.queue.then(() => {
      const rows = fn(this.read());
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ rows }), 'utf8');
      fs.renameSync(tmp, this.file);
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
  async list(tenantCode: string) {
    return this.read()
      .filter((r) => r.tenantCode === tenantCode)
      .map(({ image: _i, ...row }) => (void _i, row));
  }
  async image(tenantCode: string, email: string) {
    const r = this.read().find((x) => x.tenantCode === tenantCode && x.email === email);
    return r?.image ? { image: r.image, version: r.version } : null;
  }
  put(row: StoredAvatar) {
    return this.mutate((rows) => [...rows.filter((r) => !(r.tenantCode === row.tenantCode && r.email === row.email)), row]);
  }
  remove(tenantCode: string, email: string) {
    return this.mutate((rows) => rows.filter((r) => !(r.tenantCode === tenantCode && r.email === email)));
  }
}

// ------------------------------------------------------------------ Supabase backend

type Row = Record<string, unknown>;
const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST204', '42703']);

class SupabaseAvatarStore implements AvatarStore {
  constructor(private db: SupabaseClient) {}
  private check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
    if (res.error) {
      if (res.error.code && MISSING_TABLE.has(res.error.code)) throw new AvatarStorageError(res.error.message);
      throw new Error(`[avatars] ${res.error.message}`);
    }
    return res.data;
  }
  async list(tenantCode: string) {
    const rows = this.check(
      await this.db.from('member_avatars').select('tenant_code, email, avatar, version, updated_at, updated_by').eq('tenant_code', tenantCode),
    ) as Row[];
    return rows.map((r) => ({
      tenantCode: String(r.tenant_code),
      email: String(r.email),
      avatar: String(r.avatar),
      version: String(r.version ?? ''),
      updatedAt: String(r.updated_at ?? ''),
      updatedBy: String(r.updated_by ?? ''),
    }));
  }
  async image(tenantCode: string, email: string) {
    const r = this.check(
      await this.db.from('member_avatars').select('image, version').eq('tenant_code', tenantCode).eq('email', email).maybeSingle(),
    ) as Row | null;
    return r?.image ? { image: String(r.image), version: String(r.version ?? '') } : null;
  }
  async put(row: StoredAvatar) {
    this.check(
      await this.db.from('member_avatars').upsert({
        tenant_code: row.tenantCode,
        email: row.email,
        avatar: row.avatar,
        image: row.image,
        version: row.version,
        updated_at: row.updatedAt,
        updated_by: row.updatedBy,
      }),
    );
  }
  async remove(tenantCode: string, email: string) {
    this.check(await this.db.from('member_avatars').delete().eq('tenant_code', tenantCode).eq('email', email));
  }
}

let store: AvatarStore | null = null;
function getAvatarStore(): AvatarStore {
  if (store) return store;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (url && key) {
    store = new SupabaseAvatarStore(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  } else {
    if (process.env.NODE_ENV === 'production' && !process.env.TENANCY_DATA_DIR) {
      throw new Error('[avatars] No database configured. Set SUPABASE_SERVICE_ROLE_KEY or TENANCY_DATA_DIR.');
    }
    store = new FileAvatarStore(process.env.TENANCY_DATA_DIR || path.join(process.cwd(), '.data'));
  }
  return store;
}

// ------------------------------------------------------------------ cached reads

const g = globalThis as typeof globalThis & { __appyAvatars?: Map<string, { at: number; rows: Map<string, AvatarRow> }>; __appyAvatarWarned?: boolean };
const cache = (g.__appyAvatars ??= new Map());
const CACHE_TTL_MS = 30_000;

/** Every saved avatar in a workspace, by email. Empty (never an error) when storage isn't ready. */
export async function workspaceAvatars(tenantCode: string): Promise<Map<string, AvatarRow>> {
  const hit = cache.get(tenantCode);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;
  let rows: AvatarRow[] = [];
  try {
    rows = await getAvatarStore().list(tenantCode);
  } catch (err) {
    // Photos are decoration: a missing table must never break chat or the member list.
    if (!g.__appyAvatarWarned) {
      g.__appyAvatarWarned = true;
      console.warn('[avatars] Could not read profile photos (is supabase/migrations/20261119000000_member_avatar.sql applied?):', (err as Error).message);
    }
  }
  const map = new Map(rows.map((r) => [r.email, r]));
  cache.set(tenantCode, { at: Date.now(), rows: map });
  return map;
}

export function invalidateAvatars(tenantCode: string) {
  cache.delete(tenantCode);
}

/**
 * The founder's photo is the default for platform staff in the Appointmentlyy workspace
 * (AUTH_ADMIN_EMAILS) and for a member there named "Emil Halili". Never in client workspaces.
 */
export function hasOwnerDefault(tenantCode: string, email: string, name = ''): boolean {
  if (tenantCode !== PLATFORM_TENANT_CODE) return false;
  return getAdminEmails().includes(email.toLowerCase()) || name.trim().replace(/\s+/g, ' ').toLowerCase() === 'emil halili';
}

/** The src the browser should show for someone, or null for initials. */
export function displaySrc(tenantCode: string, email: string, name: string, row: AvatarRow | undefined): string | null {
  if (row) {
    if (row.avatar === 'upload') return `${AVATAR_IMAGE_ROUTE}?email=${encodeURIComponent(email)}&v=${row.version}`;
    return avatarImageSrc(row.avatar) ?? null;
  }
  return hasOwnerDefault(tenantCode, email, name) ? OWNER_PHOTO : null;
}

/** Display srcs for a list of people in one workspace. */
export async function avatarSrcs(tenantCode: string, people: { email: string; name: string }[]): Promise<Record<string, string | null>> {
  const rows = await workspaceAvatars(tenantCode);
  const out: Record<string, string | null> = {};
  for (const p of people) {
    const email = p.email.toLowerCase();
    out[email] = displaySrc(tenantCode, email, p.name, rows.get(email));
  }
  return out;
}

// ------------------------------------------------------------------ writes

const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);

/** First bytes of each accepted image type. */
function sniff(buf: Buffer): AvatarMime | null {
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

/** Decoded upload, or null when the bytes are not the image type the data URL claims. */
export function decodeAvatarUpload(dataUrl: string): { mime: AvatarMime; bytes: Buffer } | null {
  const d = parseAvatarDataUrl(dataUrl);
  if (!d) return null;
  const bytes = Buffer.from(d.base64, 'base64');
  return sniff(bytes) === d.mime ? { mime: d.mime, bytes } : null;
}

/** Save a checked avatar value (see parseAvatarInput) for someone. */
export async function saveAvatar(tenantCode: string, email: string, value: string, actorEmail: string): Promise<AvatarRow> {
  const upload = value.startsWith('data:');
  const row: StoredAvatar = {
    tenantCode,
    email: email.toLowerCase(),
    avatar: upload ? 'upload' : value,
    image: upload ? value : null,
    version: hash(value),
    updatedAt: nowIso(),
    updatedBy: actorEmail,
  };
  await getAvatarStore().put(row);
  invalidateAvatars(tenantCode);
  const { image: _i, ...out } = row;
  void _i;
  return out;
}

/** Clear someone's photo. Where a default photo would show, "none" is saved so initials show instead. */
export async function clearAvatar(tenantCode: string, email: string, name: string, actorEmail: string): Promise<void> {
  if (hasOwnerDefault(tenantCode, email, name)) await saveAvatar(tenantCode, email, AVATAR_NONE, actorEmail);
  else await getAvatarStore().remove(tenantCode, email.toLowerCase());
  invalidateAvatars(tenantCode);
}

/** An uploaded photo's bytes, for the image route. */
export async function avatarImage(tenantCode: string, email: string): Promise<{ mime: AvatarMime; bytes: Buffer; version: string } | null> {
  const r = await getAvatarStore().image(tenantCode, email.toLowerCase());
  if (!r) return null;
  const d = decodeAvatarUpload(r.image);
  return d ? { ...d, version: r.version } : null;
}
