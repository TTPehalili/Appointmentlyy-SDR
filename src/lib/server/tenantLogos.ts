/**
 * Server-only storage for workspace logos, one per workspace (a platform feature for every client workspace). Copied from
 * the profile-photo pattern (avatars.ts): Supabase (supabase/migrations/20261128000000_tenant_logo.sql) or a JSON file
 * (TENANCY_DATA_DIR/tenant_logos.json) for local work, a short content hash as the version, cached metadata reads, and
 * the bytes served one at a time by GET /api/tenant/logo/image.
 *
 * Accepted: PNG, JPEG, WebP up to 512 KB, checked by their own bytes (never the name or Content-Type), and SVG only as
 * the output of the Client Intake SVG sanitiser (an allow-list rebuild: no scripts, handlers, external references or
 * styles). The platform workspace never has a stored logo: it always shows the Appointmentlyy mark.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PLATFORM_TENANT_CODE } from '@/lib/roles';
import { nowIso } from '@/lib/server/tenantStore';
import { detectAttachment } from '@/lib/server/clientProjects/core';
import { decodesPng, looksLikeSvg, sanitizeSvg } from '@/lib/server/clientProjects/uploads';
import { LOGO_MAX_BYTES, type LogoMime } from '@/lib/tenantLogo';

export interface LogoMeta {
  tenantCode: string;
  mime: LogoMime;
  size: number;
  /** Short content hash: part of the image URL. */
  version: string;
  updatedAt: string;
  updatedBy: string;
}

interface StoredLogo extends LogoMeta {
  /** base64 of the bytes. */
  image: string;
}

/** The database table isn't there yet (migration not run). */
export class LogoStorageError extends Error {}

interface LogoStore {
  meta(tenantCode: string): Promise<LogoMeta | null>;
  image(tenantCode: string): Promise<StoredLogo | null>;
  put(row: StoredLogo): Promise<void>;
  remove(tenantCode: string): Promise<boolean>;
}

// ------------------------------------------------------------------ file backend

class FileLogoStore implements LogoStore {
  private file: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(dir: string) {
    this.file = path.join(dir, 'tenant_logos.json');
  }
  private read(): StoredLogo[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { rows?: StoredLogo[] };
      return parsed.rows ?? [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }
  private mutate<T>(fn: (rows: StoredLogo[]) => { rows: StoredLogo[]; out: T }): Promise<T> {
    const run = this.queue.then(() => {
      const { rows, out } = fn(this.read());
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ rows }), 'utf8');
      fs.renameSync(tmp, this.file);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
  async meta(tenantCode: string) {
    const r = this.read().find((x) => x.tenantCode === tenantCode);
    if (!r) return null;
    const { image: _i, ...m } = r;
    void _i;
    return m;
  }
  async image(tenantCode: string) {
    return this.read().find((x) => x.tenantCode === tenantCode) ?? null;
  }
  put(row: StoredLogo) {
    return this.mutate((rows) => ({ rows: [...rows.filter((r) => r.tenantCode !== row.tenantCode), row], out: undefined }));
  }
  remove(tenantCode: string) {
    return this.mutate((rows) => ({ rows: rows.filter((r) => r.tenantCode !== tenantCode), out: rows.some((r) => r.tenantCode === tenantCode) }));
  }
}

// ------------------------------------------------------------------ Supabase backend

type Row = Record<string, unknown>;
const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST204', '42703']);
const TABLE = 'tenant_logos';

const toMeta = (r: Row): LogoMeta => ({
  tenantCode: String(r.tenant_code),
  mime: String(r.mime) as LogoMime,
  size: Number(r.size ?? 0),
  version: String(r.version ?? ''),
  updatedAt: String(r.updated_at ?? ''),
  updatedBy: String(r.updated_by ?? ''),
});

class SupabaseLogoStore implements LogoStore {
  constructor(private db: SupabaseClient) {}
  private check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
    if (res.error) {
      if (res.error.code && MISSING_TABLE.has(res.error.code)) throw new LogoStorageError(res.error.message);
      throw new Error(`[tenantLogos] ${res.error.message}`);
    }
    return res.data;
  }
  async meta(tenantCode: string) {
    const r = this.check(await this.db.from(TABLE).select('tenant_code, mime, size, version, updated_at, updated_by').eq('tenant_code', tenantCode).maybeSingle()) as Row | null;
    return r ? toMeta(r) : null;
  }
  async image(tenantCode: string) {
    const r = this.check(await this.db.from(TABLE).select('*').eq('tenant_code', tenantCode).maybeSingle()) as Row | null;
    return r ? { ...toMeta(r), image: String(r.image ?? '') } : null;
  }
  async put(row: StoredLogo) {
    this.check(
      await this.db.from(TABLE).upsert({
        tenant_code: row.tenantCode,
        mime: row.mime,
        image: row.image,
        size: row.size,
        version: row.version,
        updated_at: row.updatedAt,
        updated_by: row.updatedBy,
      }),
    );
  }
  async remove(tenantCode: string) {
    const rows = this.check(await this.db.from(TABLE).delete().eq('tenant_code', tenantCode).select('tenant_code')) as Row[] | null;
    return Boolean(rows && rows.length);
  }
}

let store: LogoStore | null = null;
function getLogoStore(): LogoStore {
  if (store) return store;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (url && key) {
    store = new SupabaseLogoStore(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  } else {
    if (process.env.NODE_ENV === 'production' && !process.env.TENANCY_DATA_DIR) {
      throw new Error('[tenantLogos] No database configured. Set SUPABASE_SERVICE_ROLE_KEY or TENANCY_DATA_DIR.');
    }
    store = new FileLogoStore(process.env.TENANCY_DATA_DIR || path.join(process.cwd(), '.data'));
  }
  return store;
}

// ------------------------------------------------------------------ checks

export type LogoCheck = { ok: true; mime: LogoMime; bytes: Buffer } | { ok: false; error: string };

const TOO_BIG = `That logo is too large. Use one under ${LOGO_MAX_BYTES / 1024} KB.`;
/** Largest PNG logo: 4096 px on a side and about 4 megapixels (4096 x 1024, 2048 x 2048). */
const LOGO_MAX_SIDE = 4096;
const LOGO_MAX_PIXELS = 4096 * 1024;

/** A real WebP: RIFF header, the WEBP form type, a VP8 / VP8L / VP8X first chunk, and a RIFF size that fits the file. */
function isWebp(b: Buffer): boolean {
  if (b.length < 30 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') return false;
  const riff = b.readUInt32LE(4);
  if (riff + 8 > b.length || riff < 22) return false;
  return ['VP8 ', 'VP8L', 'VP8X'].includes(b.toString('latin1', 12, 16));
}

/**
 * What the uploaded bytes really are, and the bytes to store (for SVG: the sanitised rebuild). The name is never trusted
 * for the type; only the bytes decide. Same rules as Client Intake uploads: PNG chunks and CRCs and the image data
 * inflating, a JPEG frame header and end marker, and the SVG allow-list sanitiser.
 */
export function checkLogoBytes(input: Uint8Array): LogoCheck {
  const b = Buffer.from(input);
  if (!b.length) return { ok: false, error: 'That file is empty.' };
  if (b.length > LOGO_MAX_BYTES) return { ok: false, error: TOO_BIG };
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    // Security review M1: the size in the header is checked BEFORE anything is inflated. A 200 KB PNG can declare
    // 5000 x 5000 16-bit RGBA (200 MB of pixels): a decompression bomb for the server and every member's browser.
    if (b.length >= 24 && b.toString('latin1', 12, 16) === 'IHDR') {
      const w = b.readUInt32BE(16);
      const h = b.readUInt32BE(20);
      if (w > LOGO_MAX_SIDE || h > LOGO_MAX_SIDE || w * h > LOGO_MAX_PIXELS) return { ok: false, error: `That logo is ${w} x ${h} pixels. Use one at most ${LOGO_MAX_SIDE} pixels wide or high (about 4 megapixels in all).` };
    }
    return detectAttachment(b)?.mime === 'image/png' && decodesPng(b) ? { ok: true, mime: 'image/png', bytes: b } : { ok: false, error: 'That file could not be read as a PNG image.' };
  }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return detectAttachment(b)?.mime === 'image/jpeg' ? { ok: true, mime: 'image/jpeg', bytes: b } : { ok: false, error: 'That file could not be read as a JPG image.' };
  }
  if (b.toString('latin1', 0, 4) === 'RIFF') return isWebp(b) ? { ok: true, mime: 'image/webp', bytes: b } : { ok: false, error: 'That file could not be read as a WebP image.' };
  if (b.includes(0)) return { ok: false, error: 'Use a PNG, JPG, WebP or SVG logo.' };
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return { ok: false, error: 'Use a PNG, JPG, WebP or SVG logo.' };
  }
  const trimmed = text.replace(/^﻿/, '');
  if (!looksLikeSvg(trimmed)) return { ok: false, error: 'Use a PNG, JPG, WebP or SVG logo.' };
  const clean = sanitizeSvg(text);
  if (!clean.ok) return clean;
  const out = Buffer.from(clean.svg, 'utf8');
  if (out.length > LOGO_MAX_BYTES) return { ok: false, error: TOO_BIG };
  return { ok: true, mime: 'image/svg+xml', bytes: out };
}

// ------------------------------------------------------------------ cached metadata reads

const g = globalThis as typeof globalThis & { __appyLogos?: Map<string, { at: number; meta: LogoMeta | null }>; __appyLogoWarned?: boolean };
const cache = (g.__appyLogos ??= new Map());
const CACHE_TTL_MS = 30_000;

/** The workspace's logo metadata, or null (no logo, the platform workspace, or storage not ready: never an error). */
export async function tenantLogoMeta(tenantCode: string): Promise<LogoMeta | null> {
  if (!tenantCode || tenantCode === PLATFORM_TENANT_CODE) return null;
  const hit = cache.get(tenantCode);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.meta;
  let meta: LogoMeta | null = null;
  try {
    meta = await getLogoStore().meta(tenantCode);
  } catch (err) {
    // A logo is decoration: a missing table must never break sign-in or the shell.
    if (!g.__appyLogoWarned) {
      g.__appyLogoWarned = true;
      console.warn('[tenantLogos] Could not read workspace logos (is supabase/migrations/20261128000000_tenant_logo.sql applied?):', (err as Error).message);
    }
  }
  cache.set(tenantCode, { at: Date.now(), meta });
  if (cache.size > 5000) for (const k of cache.keys()) if (Date.now() - (cache.get(k)?.at ?? 0) > CACHE_TTL_MS) cache.delete(k);
  return meta;
}

const invalidate = (tenantCode: string) => cache.delete(tenantCode);

// ------------------------------------------------------------------ writes

const hash = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

export class LogoRefused extends Error {}

/**
 * Save a workspace logo from uploaded bytes (checked here; SVG sanitised). Returns the metadata and whether it changed
 * (the same bytes again are a no-op). Never for the platform workspace.
 */
export async function saveTenantLogo(tenantCode: string, input: Uint8Array, actorEmail: string): Promise<{ meta: LogoMeta; changed: boolean }> {
  if (!tenantCode || tenantCode === PLATFORM_TENANT_CODE) throw new LogoRefused('The Appointmentlyy workspace always shows the Appointmentlyy mark.');
  const c = checkLogoBytes(input);
  if (!c.ok) throw new LogoRefused(c.error);
  const version = hash(c.bytes);
  const s = getLogoStore();
  const cur = await s.meta(tenantCode);
  if (cur && cur.version === version && cur.mime === c.mime) return { meta: cur, changed: false };
  const row: StoredLogo = { tenantCode, mime: c.mime, size: c.bytes.length, version, updatedAt: nowIso(), updatedBy: actorEmail, image: c.bytes.toString('base64') };
  await s.put(row);
  invalidate(tenantCode);
  const { image: _i, ...meta } = row;
  void _i;
  return { meta, changed: true };
}

/** Remove a workspace's logo (its initials show again). False when there was none. */
export async function clearTenantLogo(tenantCode: string): Promise<boolean> {
  const removed = await getLogoStore().remove(tenantCode);
  invalidate(tenantCode);
  return removed;
}

const gv = globalThis as typeof globalThis & { __appyLogoVerified?: Set<string> };
const verified = (gv.__appyLogoVerified ??= new Set<string>());

/**
 * A logo's bytes, for the image route. The stored bytes must hash to their version (exactly what was checked and saved),
 * and the full check runs again once per workspace, version and process, so only an accepted type is ever served. It
 * is not re-run on every request (security review M1: re-inflating a large PNG per GET blocked the event loop), and the
 * STORED bytes are served (re-sanitising an SVG on every GET escaped its entities once more each time).
 */
export async function tenantLogoImage(tenantCode: string): Promise<{ mime: LogoMime; bytes: Buffer; version: string } | null> {
  if (!tenantCode || tenantCode === PLATFORM_TENANT_CODE) return null;
  const r = await getLogoStore().image(tenantCode);
  if (!r?.image) return null;
  const bytes = Buffer.from(r.image, 'base64');
  if (hash(bytes) !== r.version) return null;
  const key = `${tenantCode}:${r.version}:${r.mime}`;
  if (!verified.has(key)) {
    const c = checkLogoBytes(bytes);
    if (!c.ok || c.mime !== r.mime) return null;
    if (verified.size > 5000) verified.clear();
    verified.add(key);
  }
  return { mime: r.mime, bytes, version: r.version };
}
