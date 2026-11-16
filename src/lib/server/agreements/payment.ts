/**
 * Server only. Payment link + QR code for billing statements.
 *
 * - Payment link: https:// only, a real URL, no user:password part, at most 500 characters. Never
 *   javascript: or data:. Shown exactly as the owner set it.
 * - QR image: the browser re-encodes the upload (PNG or JPEG, max 1 MB) to PNG on a canvas, like
 *   profile photos. The server then rebuilds the PNG from its image chunks only (IHDR, PLTE, tRNS,
 *   IDAT, IEND), checking every CRC and that the pixel data inflates to the declared size. That
 *   strips metadata and anything appended to the file. Max 1 MB, at most 2000 x 2000 px.
 */
import zlib from 'node:zlib';

export const QR_MAX_BYTES = 1024 * 1024;
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const KEEP = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);

/** The cleaned link, or null when it is not an acceptable https:// URL. */
export function safePaymentLink(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v || v.length > 500 || /[\s<>"'`]/.test(v)) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !u.hostname.includes('.') || u.username || u.password) return null;
  return v;
}

let crcTable: number[] | null = null;
function crc32(buf: Buffer): number {
  crcTable ??= Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, c]);
}

/** Rebuilt PNG bytes, or null when the input is not a clean, decodable PNG within the limits. */
export function rebuildPng(buf: Buffer): Buffer | null {
  if (buf.length < 60 || buf.length > QR_MAX_BYTES || !buf.subarray(0, 8).equals(PNG_SIG)) return null;
  let off = 8;
  const kept: Buffer[] = [];
  const idat: Buffer[] = [];
  let ihdr: Buffer | null = null;
  let ended = false;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (!/^[A-Za-z]{4}$/.test(type) || off + 12 + len > buf.length) return null;
    const data = buf.subarray(off + 8, off + 8 + len);
    if (crc32(buf.subarray(off + 4, off + 8 + len)) !== buf.readUInt32BE(off + 8 + len)) return null;
    if (type === 'IHDR') ihdr = Buffer.from(data);
    if (type === 'IDAT') idat.push(Buffer.from(data));
    if (KEEP.has(type)) kept.push(chunk(type, Buffer.from(data)));
    off += 12 + len;
    if (type === 'IEND') {
      ended = true;
      break;
    }
  }
  if (!ended || !ihdr || ihdr.length !== 13 || !idat.length) return null;
  const w = ihdr.readUInt32BE(0);
  const h = ihdr.readUInt32BE(4);
  const depth = ihdr[8];
  const colour = ihdr[9];
  if (w < 16 || h < 16 || w > 2000 || h > 2000 || ihdr[12] !== 0) return null;
  const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  if (!(colour in channels) || ![1, 2, 4, 8, 16].includes(depth)) return null;
  const rowBytes = Math.ceil((w * channels[colour] * depth) / 8) + 1;
  try {
    const raw = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: rowBytes * h + 1 });
    if (raw.length !== rowBytes * h) return null;
  } catch {
    return null;
  }
  return Buffer.concat([PNG_SIG, ...kept]);
}

/** A QR data URL (PNG) after the server-side rebuild, or null. '' stays '' (no QR). */
export function safeQrDataUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m || m[1].length > Math.ceil((QR_MAX_BYTES * 4) / 3) + 8) return null;
  const png = rebuildPng(Buffer.from(m[1], 'base64'));
  return png ? `data:image/png;base64,${png.toString('base64')}` : null;
}

export function qrBytes(dataUrl: string | undefined | null): Buffer | null {
  const m = String(dataUrl || '').match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  return m ? Buffer.from(m[1], 'base64') : null;
}

export const isPaymentLinkKey = (k: string) => k === 'paymentLink';
export const isPaymentQrKey = (k: string) => k === 'paymentQr';
