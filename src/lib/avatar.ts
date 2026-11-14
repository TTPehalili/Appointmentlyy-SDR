/**
 * Profile photo rules shared by the server (validation) and the browser (what to show).
 * No 'use client' and no browser or Node APIs: safe to import anywhere.
 *
 * A stored avatar value is one of:
 * - `preset:avatar-01`      one of the illustrated avatars in src/lib/avatarPresets.ts
 * - `/images/profile/x.webp` a built-in photo shipped with the site
 * - `data:image/webp;base64,...` a small uploaded photo (resized to 256 px in the browser)
 * - `none`                  explicitly no photo (turns off a default such as the founder's photo)
 *
 * What the browser gets is a display src: preset and site paths as-is, uploads as a short URL of
 * GET /api/profile/avatar/image (cacheable, so chat payloads never carry image bytes).
 */
import { AVATAR_PRESETS } from '@/lib/avatarPresets';

/** Largest accepted upload after compression (decoded bytes). */
export const AVATAR_MAX_BYTES = 200 * 1024;
/** Uploads are resized to this square size in the browser. */
export const AVATAR_SIZE = 256;
/** The founder's photo, shown by default for the platform owner (see src/lib/server/avatars.ts). */
export const OWNER_PHOTO = '/images/profile/emil-halili.webp';
export const AVATAR_NONE = 'none';
export const AVATAR_IMAGE_ROUTE = '/api/profile/avatar/image';
export const AVATAR_MIMES = ['image/webp', 'image/jpeg', 'image/png'] as const;
export type AvatarMime = (typeof AVATAR_MIMES)[number];
export type AvatarKind = 'preset' | 'photo' | 'upload';

const PRESET_PREFIX = 'preset:';
const SITE_PATH_RE = /^\/images\/(?:profile|avatars)\/[a-z0-9][a-z0-9._-]{0,80}\.(?:webp|png|jpe?g|svg)$/;
const DATA_URL_RE = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/;

export const presetValue = (id: string) => `${PRESET_PREFIX}${id}`;

/** Decoded size of a base64 string, without decoding it. */
export function base64Bytes(b64: string): number {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/** The parts of an upload data URL, or null when it isn't a webp / jpeg / png data URL. */
export function parseAvatarDataUrl(v: string): { mime: AvatarMime; base64: string; bytes: number } | null {
  const m = DATA_URL_RE.exec(v);
  if (!m) return null;
  return { mime: m[1] as AvatarMime, base64: m[2], bytes: base64Bytes(m[2]) };
}

export type AvatarParse = { ok: true; value: string; kind: AvatarKind; presetId?: string } | { ok: false; error: string };

/** Strict check of what a person asked to save (the server also checks the image bytes). */
export function parseAvatarInput(raw: unknown): AvatarParse {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: 'Pick a photo or an avatar.' };
  const v = raw.trim();
  if (v.startsWith(PRESET_PREFIX)) {
    const id = v.slice(PRESET_PREFIX.length);
    return AVATAR_PRESETS.some((p) => p.id === id) ? { ok: true, value: v, kind: 'preset', presetId: id } : { ok: false, error: 'That avatar does not exist.' };
  }
  if (v.startsWith('/')) return SITE_PATH_RE.test(v) ? { ok: true, value: v, kind: 'photo' } : { ok: false, error: 'That photo is not available.' };
  if (v.startsWith('data:')) {
    // Cheap length check first: base64 is 4/3 of the bytes.
    if (v.length > Math.ceil((AVATAR_MAX_BYTES * 4) / 3) + 64) return { ok: false, error: 'That photo is too large. Use one under 200 KB.' };
    const d = parseAvatarDataUrl(v);
    if (!d) return { ok: false, error: 'Use a JPG, PNG or WebP image.' };
    if (d.bytes > AVATAR_MAX_BYTES) return { ok: false, error: 'That photo is too large. Use one under 200 KB.' };
    if (d.bytes < 32) return { ok: false, error: 'That image is empty.' };
    return { ok: true, value: v, kind: 'upload' };
  }
  return { ok: false, error: 'Pick a photo or an avatar.' };
}

/**
 * What an <img> can show for an avatar value: presets become their file, site paths, the image
 * route and data URLs pass through, anything else (including `none`) shows initials.
 */
export function avatarImageSrc(v?: string | null): string | undefined {
  if (!v || v === AVATAR_NONE) return undefined;
  if (v.startsWith(PRESET_PREFIX)) return AVATAR_PRESETS.find((p) => p.id === v.slice(PRESET_PREFIX.length))?.src;
  if (SITE_PATH_RE.test(v)) return v;
  if (v.startsWith(`${AVATAR_IMAGE_ROUTE}?`)) return v;
  if (v.startsWith('data:image/') || v.startsWith('blob:')) return v;
  return undefined;
}
