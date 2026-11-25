/**
 * Screenshots on support tickets: the only check between uploaded bytes and storage. Same rules as workspace logos and
 * profile photos (src/lib/server/tenantLogos.ts, avatars.ts): the bytes decide the type (never the name or the
 * Content-Type), PNG, JPEG and WebP only, and a size in the header is checked BEFORE anything is decoded.
 *
 * On top of that, each image is REBUILT from its own structure, keeping only what is needed to show it:
 *   PNG:  only image chunks are kept (IHDR, PLTE, tRNS, colour chunks, IDAT, IEND): text, EXIF and anything after
 *         IEND are dropped; every chunk CRC must match and the image data must inflate to exactly the declared size
 *         (counted in a stream, never held in memory: a decompression bomb stops at the cap).
 *   JPEG: EXIF/XMP (APP1), other APP segments and comments are dropped wherever they are (a photo's GPS position never
 *         reaches support); pictures a phone appends after the end marker are dropped, any other trailing data is refused.
 *   WebP: the RIFF size must match the file; EXIF and XMP chunks are dropped.
 * A file that is "an image plus something else" (a polyglot) is refused or loses the something else.
 */
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { SUPPORT_LIMITS, type ScreenshotMime } from '@/lib/supportReport';

/** 16384 px on a side and about 26 megapixels (a 6K display) at most. */
export const SHOT_MAX_SIDE = 16384;
export const SHOT_MAX_PIXELS = 26_000_000;

export type ShotCheck =
  | { ok: true; mime: ScreenshotMime; bytes: Buffer; width: number; height: number; sha256: string }
  | { ok: false; error: string };

const fail = (error: string): ShotCheck => ({ ok: false, error });
const sizeError = (w: number, h: number) =>
  w > SHOT_MAX_SIDE || h > SHOT_MAX_SIDE || w * h > SHOT_MAX_PIXELS
    ? `That picture is ${w} x ${h} pixels. Use one at most ${SHOT_MAX_SIDE} pixels on a side (about 26 megapixels).`
    : '';

// ------------------------------------------------------------------ PNG

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Chunks needed to show the picture faithfully. Everything else (text, EXIF, time, animation) is dropped. */
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND', 'sRGB', 'gAMA', 'cHRM', 'iCCP', 'sBIT', 'pHYs']);

/** Inflated size of a zlib stream, counted as it streams; -1 if broken or past `max` (stops reading there). */
function inflatedSize(data: Buffer, max: number): Promise<number> {
  return new Promise((resolve) => {
    const z = zlib.createInflate({ chunkSize: 64 * 1024 });
    let n = 0;
    let done = false;
    const finish = (v: number) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    z.on('data', (c: Buffer) => {
      n += c.length;
      if (n > max) {
        finish(-1);
        z.destroy();
      }
    });
    z.on('end', () => finish(n));
    z.on('error', () => finish(-1));
    z.end(data);
  });
}

async function checkPng(b: Buffer): Promise<ShotCheck> {
  const bad = fail('That file could not be read as a PNG picture.');
  let at = 8;
  let w = 0;
  let h = 0;
  let bpp = 0;
  let interlaced = false;
  let ended = false;
  const keep: Buffer[] = [PNG_SIG];
  const idat: Buffer[] = [];
  while (at + 12 <= b.length) {
    const len = b.readUInt32BE(at);
    const type = b.toString('latin1', at + 4, at + 8);
    if (!/^[A-Za-z]{4}$/.test(type) || len > b.length - at - 12) return bad;
    const crcEnd = at + 8 + len;
    if (crc32(b.subarray(at + 4, crcEnd)) !== b.readUInt32BE(crcEnd)) return bad;
    const data = b.subarray(at + 8, crcEnd);
    if (at === 8) {
      if (type !== 'IHDR' || len !== 13) return bad;
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      const depth = data[8];
      const color = data[9];
      const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color];
      if (!w || !h || !channels || ![1, 2, 4, 8, 16].includes(depth) || data[10] !== 0 || data[11] !== 0 || data[12] > 1) return bad;
      // The size in the header is checked before anything is inflated.
      const tooBig = sizeError(w, h);
      if (tooBig) return fail(tooBig);
      bpp = channels * depth;
      interlaced = data[12] === 1;
    } else if (type === 'IHDR') return bad;
    // An unknown CRITICAL chunk (upper-case first letter) means a picture we cannot vouch for.
    if (!PNG_KEEP.has(type) && type[0] === type[0].toUpperCase()) return bad;
    if (type === 'IDAT') idat.push(data);
    if (PNG_KEEP.has(type)) keep.push(b.subarray(at, crcEnd + 4));
    at = crcEnd + 4;
    if (type === 'IEND') {
      ended = true;
      break;
    }
  }
  // Nothing may follow IEND (an "image + HTML/ZIP" polyglot).
  if (!ended || at !== b.length || !idat.length) return bad;
  const expected = (Math.ceil((w * bpp) / 8) + 1) * h;
  // Interlaced images are a little larger (seven passes): allow headroom, never more.
  const max = Math.ceil(expected * (interlaced ? 1.25 : 1)) + 64;
  const got = await inflatedSize(Buffer.concat(idat), max);
  if (got < 0 || got < expected) return bad;
  return done('image/png', Buffer.concat(keep), w, h);
}

// ------------------------------------------------------------------ JPEG

/** APP0 (JFIF) and APP14 (Adobe colour transform) are kept, and APP2 only when it is a colour profile (ICC_PROFILE);
 * other APPn (EXIF/XMP in APP1, MPF in APP2, ...) and comments are not, wherever they appear (also between the scans
 * of a progressive JPEG). */
const JPEG_KEEP_APP = new Set([0xe0, 0xe2, 0xee]);
const ICC_TAG = Buffer.from('ICC_PROFILE\0', 'latin1');

function checkJpeg(b: Buffer): ShotCheck {
  const bad = fail('That file could not be read as a JPG picture.');
  const out: Buffer[] = [b.subarray(0, 2)];
  let i = 2;
  let w = 0;
  let h = 0;
  let scans = 0;
  while (i + 2 <= b.length) {
    if (b[i] !== 0xff) return bad;
    let m = b[i + 1];
    while (m === 0xff && i + 2 < b.length) {
      i++;
      m = b[i + 1];
    }
    if (m === 0xff || m === 0x00 || m === 0xd8) return bad;
    if (m === 0xd9) {
      if (!scans) return bad; // an end marker before any picture data
      out.push(b.subarray(i, i + 2));
      // After the end marker: only zero padding, or the extra pictures a phone appends (MPF preview, HDR gain map),
      // which are dropped with whatever metadata they carry. Anything else (an "image + HTML/ZIP" polyglot) is refused.
      const rest = b.subarray(i + 2);
      const appendedPictures = rest.length >= 3 && rest[0] === 0xff && rest[1] === 0xd8 && rest[2] === 0xff;
      if (!appendedPictures && rest.some((x) => x !== 0)) return bad;
      return done('image/jpeg', Buffer.concat(out), w, h);
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      out.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > b.length) return bad;
    const len = b.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > b.length) return bad;
    const seg = b.subarray(i, i + 2 + len);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      if (len < 8) return bad;
      h = b.readUInt16BE(i + 5);
      w = b.readUInt16BE(i + 7);
      if (!w || !h) return bad;
      const tooBig = sizeError(w, h);
      if (tooBig) return fail(tooBig);
    }
    if (m === 0xda) {
      if (!w || !h) return bad; // scan data before any frame header
      out.push(seg);
      // The entropy-coded data runs to the next marker: an 0xFF that is not a stuffed 0xFF00 or a restart marker.
      let j = i + 2 + len;
      for (;;) {
        j = b.indexOf(0xff, j);
        if (j < 0 || j + 1 >= b.length) return bad; // no end marker
        const n = b[j + 1];
        if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) {
          j += 2;
          continue;
        }
        break;
      }
      out.push(b.subarray(i + 2 + len, j));
      scans++;
      i = j;
      continue;
    }
    const isApp = m >= 0xe0 && m <= 0xef;
    const keepApp = isApp && JPEG_KEEP_APP.has(m) && (m !== 0xe2 || (len >= 2 + ICC_TAG.length && seg.subarray(4, 4 + ICC_TAG.length).equals(ICC_TAG)));
    if (m === 0xfe || (isApp && !keepApp)) {
      i += 2 + len;
      continue;
    }
    out.push(seg);
    i += 2 + len;
  }
  return bad;
}

// ------------------------------------------------------------------ WebP

function checkWebp(b: Buffer): ShotCheck {
  const bad = fail('That file could not be read as a WebP picture.');
  if (b.length < 30 || b.toString('latin1', 8, 12) !== 'WEBP') return bad;
  const riff = b.readUInt32LE(4);
  if (riff + 8 !== b.length || riff < 22) return bad;
  let at = 12;
  let w = 0;
  let h = 0;
  let first = true;
  const chunks: Buffer[] = [];
  let vp8xAt = -1;
  while (at + 8 <= b.length) {
    const fourcc = b.toString('latin1', at, at + 4);
    const size = b.readUInt32LE(at + 4);
    const padded = size + (size & 1);
    if (!/^[A-Za-z0-9 ]{4}$/.test(fourcc) || at + 8 + size > b.length) return bad;
    const data = b.subarray(at + 8, at + 8 + size);
    if (first) {
      first = false;
      if (fourcc === 'VP8X') {
        if (size < 10) return bad;
        w = 1 + data.readUIntLE(4, 3);
        h = 1 + data.readUIntLE(7, 3);
      } else if (fourcc === 'VP8L') {
        if (size < 5 || data[0] !== 0x2f) return bad;
        const bits = data.readUInt32LE(1);
        w = 1 + (bits & 0x3fff);
        h = 1 + ((bits >>> 14) & 0x3fff);
      } else if (fourcc === 'VP8 ') {
        if (size < 10 || data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) return bad;
        w = data.readUInt16LE(6) & 0x3fff;
        h = data.readUInt16LE(8) & 0x3fff;
      } else return bad;
      if (!w || !h) return bad;
      const tooBig = sizeError(w, h);
      if (tooBig) return fail(tooBig);
    }
    if (fourcc !== 'EXIF' && fourcc !== 'XMP ') {
      if (fourcc === 'VP8X') vp8xAt = chunks.reduce((n, c) => n + c.length, 0);
      chunks.push(Buffer.from(b.subarray(at, Math.min(b.length, at + 8 + padded))));
    }
    at += 8 + padded;
  }
  if (at < b.length - 1) return bad;
  const body = Buffer.concat(chunks);
  // The EXIF (0x08) and XMP (0x04) flags must go with their chunks.
  if (vp8xAt >= 0) body[vp8xAt + 8] &= ~0x0c;
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(body.length + 4, 4);
  head.write('WEBP', 8, 'latin1');
  return done('image/webp', Buffer.concat([head, body]), w, h);
}

// ------------------------------------------------------------------ entry

function done(mime: ScreenshotMime, bytes: Buffer, width: number, height: number): ShotCheck {
  if (!bytes.length || bytes.length > SUPPORT_LIMITS.screenshotBytes) return fail('That picture is too large. Use one under 5 MB.');
  return { ok: true, mime, bytes, width, height, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

/** What the uploaded bytes really are, rebuilt without metadata, or why they were refused. */
export async function checkScreenshot(input: Uint8Array): Promise<ShotCheck> {
  const b = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (!b.length) return fail('That file is empty.');
  if (b.length > SUPPORT_LIMITS.screenshotBytes) return fail('That picture is too large. Use one under 5 MB.');
  if (b.length >= 8 && b.subarray(0, 8).equals(PNG_SIG)) return checkPng(b);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return checkJpeg(b);
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF') return checkWebp(b);
  return fail('Use a PNG, JPG or WebP picture.');
}

/** First bytes of a stored picture still match its type (checked again when it is served). */
export function sniffMatches(bytes: Buffer, mime: string): boolean {
  if (mime === 'image/png') return bytes.length > 8 && bytes.subarray(0, 8).equals(PNG_SIG);
  if (mime === 'image/jpeg') return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/webp') return bytes.length > 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP';
  return false;
}
