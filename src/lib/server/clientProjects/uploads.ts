/**
 * Server only. Client Intake uploads: what a file really is, from its own bytes and structure. The upload's name and
 * Content-Type are never trusted for the type (the name's extension only separates CSV from plain text, which have no
 * signature). Allow-list: PDF, DOCX, XLSX, CSV, TXT, PNG, JPG, and SVG for logo fields only.
 *
 *   PDF   parses (pdf.js) with at least one page
 *   DOCX  a valid OOXML zip ([Content_Types].xml says WordprocessingML) with no macros (no vbaProject, no macro-enabled
 *   XLSX  content type; .docm / .xlsm refused), a sane central directory and a bounded uncompressed size
 *   CSV   UTF-8 (strict), no NUL bytes, within the row / column / cell caps
 *   TXT   UTF-8 (strict), no NUL bytes
 *   PNG   every chunk's CRC checks, IHDR first, and the image data inflates to the size the header says (it decodes)
 *   JPG   SOI, a frame header with real dimensions, EOI
 *   SVG   rebuilt from an allow-list of elements and attributes (scripts, event handlers, external references, styles,
 *         entities and DOCTYPEs are removed or refused). The STORED file is the sanitised one; it is never served
 *         inline, to anyone.
 */
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { detectAttachment } from '@/lib/server/clientProjects/core';
import { pdfPageCount } from '@/lib/server/clientProjects/pdfText';
import { FILE_KIND_MIME, INTAKE_LIMITS, parseCsv, type FileKind } from '@/lib/clientProjects/intake';

export type Checked = { ok: true; kind: FileKind; mime: string; bytes: Uint8Array; name: string; originalSha256?: string; csvRows?: string[][] } | { ok: false; error: string };

const sha = (b: Uint8Array) => crypto.createHash('sha256').update(b).digest('hex');
const EXT: Record<FileKind, string> = { pdf: 'pdf', docx: 'docx', xlsx: 'xlsx', csv: 'csv', txt: 'txt', png: 'png', jpg: 'jpg', svg: 'svg' };

/** A safe stored name (no path parts, no control characters) ending in the extension of what the bytes are. */
export function intakeName(raw: unknown, kind: FileKind): string {
  const s = typeof raw === 'string' ? raw : '';
  const base = s
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150)
    .replace(/\.(pdf|docx?|docm|xlsx?|xlsm|csv|txt|png|jpe?g|svg)$/i, '')
    .replace(/^\.+/, '')
    .trim();
  return `${base || 'file'}.${EXT[kind]}`;
}

const extOf = (name: string) => (/\.([a-z0-9]{1,5})$/i.exec(name.trim())?.[1] ?? '').toLowerCase();
/** A leading byte-order mark. */
const BOM_RE = new RegExp(`^${String.fromCharCode(0xfeff)}`);
/** SVG logos: a hard size cap (sanitising is linear, but there is no reason for a logo to be larger). */
export const SVG_MAX_BYTES = 512 * 1024;

/**
 * Does this text start like an SVG document? A LINEAR scan (security review H1: the earlier regex backtracked
 * exponentially on repeated comments): optional whitespace, at most one <?xml ...?>, any number of <!-- ... -->
 * comments (each skipped with indexOf), then "<svg" followed by whitespace or ">".
 */
export function looksLikeSvg(text: string): boolean {
  let i = 0;
  const ws = () => {
    while (i < text.length && (text[i] === ' ' || text[i] === '\n' || text[i] === '\r' || text[i] === '\t')) i++;
  };
  ws();
  if (text.startsWith('<?xml', i)) {
    const end = text.indexOf('?>', i + 5);
    if (end < 0) return false;
    i = end + 2;
    ws();
  }
  while (text.startsWith('<!--', i)) {
    const end = text.indexOf('-->', i + 4);
    if (end < 0) return false;
    i = end + 3;
    ws();
  }
  return /^<svg[\s>]/i.test(text.slice(i, i + 5));
}

/**
 * Check one upload. `accept` is the field's allow-list; SVG is only ever accepted when the field names it.
 * Returns the bytes to STORE (for SVG: the sanitised version) or a plain reason.
 */
export async function checkIntakeFile(bytes: Uint8Array, nameRaw: unknown, accept: FileKind[]): Promise<Checked> {
  if (!bytes.length) return { ok: false, error: 'The file is empty.' };
  if (bytes.length > INTAKE_LIMITS.fileBytes) return { ok: false, error: `The file is larger than ${Math.round(INTAKE_LIMITS.fileBytes / 1024 / 1024)} MB.` };
  const name = typeof nameRaw === 'string' ? nameRaw : '';
  const ext = extOf(name);
  if (['docm', 'xlsm', 'dotm', 'xltm', 'xlam', 'ppsm', 'pptm', 'exe', 'js', 'html', 'htm'].includes(ext)) return { ok: false, error: 'Macro-enabled and executable files are not accepted.' };
  // The SVG path (and its sanitiser) only ever runs for a field that takes SVG (logos).
  const kind = await sniff(bytes, ext, accept.includes('svg'));
  if (!kind.ok) return kind;
  if (!accept.includes(kind.kind)) return { ok: false, error: `This field takes ${accept.map((k) => k.toUpperCase()).join(', ')} files.` };
  return { ...kind, name: intakeName(name, kind.kind) };
}

async function sniff(b: Uint8Array, ext: string, allowSvg: boolean): Promise<Checked> {
  const head = Buffer.from(b.subarray(0, 8));
  // PDF
  if (head.subarray(0, 5).toString('latin1') === '%PDF-') {
    const pages = (await pdfPageCount(b)) ?? 0;
    return pages >= 1 ? { ok: true, kind: 'pdf', mime: FILE_KIND_MIME.pdf, bytes: b, name: '' } : { ok: false, error: 'This file could not be read as a PDF.' };
  }
  // PNG: the full check (CRCs and the image data really inflating), on top of the attachment check.
  if (head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return detectAttachment(b)?.mime === 'image/png' && decodesPng(b) ? { ok: true, kind: 'png', mime: FILE_KIND_MIME.png, bytes: b, name: '' } : { ok: false, error: 'This file could not be read as a PNG image.' };
  }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return detectAttachment(b)?.mime === 'image/jpeg' ? { ok: true, kind: 'jpg', mime: FILE_KIND_MIME.jpg, bytes: b, name: '' } : { ok: false, error: 'This file could not be read as a JPG image.' };
  }
  // ZIP: only Office Open XML documents (Word, Excel), never with macros.
  if (head.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    const o = checkOoxml(Buffer.from(b));
    return o.ok ? { ok: true, kind: o.kind, mime: FILE_KIND_MIME[o.kind], bytes: b, name: '' } : o;
  }
  // Text: strict UTF-8 and no NUL bytes; SVG, CSV or TXT.
  if (b.includes(0)) return { ok: false, error: 'This file type is not accepted.' };
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return { ok: false, error: 'Text files must be UTF-8.' };
  }
  const trimmed = text.replace(BOM_RE, '');
  if (ext === 'svg' || looksLikeSvg(trimmed)) {
    if (!allowSvg) return { ok: false, error: 'SVG files are only accepted for logos. Send a PNG, JPG or PDF here.' };
    if (b.length > SVG_MAX_BYTES) return { ok: false, error: `The SVG is too large (${SVG_MAX_BYTES / 1024} KB at most). Send a PNG instead.` };
    const clean = sanitizeSvg(text);
    if (!clean.ok) return clean;
    const out = Buffer.from(clean.svg, 'utf8');
    return { ok: true, kind: 'svg', mime: FILE_KIND_MIME.svg, bytes: out, name: '', originalSha256: sha(b) };
  }
  if (ext === 'csv') {
    const parsed = parseCsv(text);
    if (parsed.error) return { ok: false, error: `This CSV could not be read: ${parsed.error}` };
    if (!parsed.rows.length) return { ok: false, error: 'The CSV is empty.' };
    return { ok: true, kind: 'csv', mime: FILE_KIND_MIME.csv, bytes: b, name: '', csvRows: parsed.rows };
  }
  if (ext === 'txt' || ext === 'text' || ext === 'md') return { ok: true, kind: 'txt', mime: FILE_KIND_MIME.txt, bytes: b, name: '' };
  return { ok: false, error: 'This file type is not accepted. Send PDF, DOCX, XLSX, CSV, TXT, PNG or JPG.' };
}

// ------------------------------------------------------------------ PNG: it really decodes

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function decodesPng(b: Uint8Array): boolean {
  const buf = Buffer.from(b);
  let at = 8;
  let w = 0;
  let h = 0;
  let bpp = 0;
  const idat: Buffer[] = [];
  let ended = false;
  let first = true;
  while (at + 12 <= buf.length) {
    const len = buf.readUInt32BE(at);
    const type = buf.subarray(at + 4, at + 8).toString('latin1');
    if (len > buf.length - at - 12) return false;
    const data = buf.subarray(at + 8, at + 8 + len);
    if (crc32(buf.subarray(at + 4, at + 8 + len)) !== buf.readUInt32BE(at + 8 + len)) return false;
    if (first) {
      if (type !== 'IHDR' || len !== 13) return false;
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      const depth = data[8];
      const color = data[9];
      const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color];
      if (!channels || ![1, 2, 4, 8, 16].includes(depth) || data[12] > 1) return false;
      bpp = channels * depth;
      first = false;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') {
      ended = true;
      break;
    }
    at += 12 + len;
  }
  if (!ended || !w || !h || !idat.length || w * h > 40_000_000) return false;
  const rowBytes = Math.ceil((w * bpp) / 8) + 1;
  // Non-interlaced size; an interlaced image is a little larger (seven passes), so allow headroom but never more.
  const expected = rowBytes * h;
  try {
    const out = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: Math.ceil(expected * 1.25) + 64 });
    return out.length >= expected;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ OOXML (DOCX / XLSX): a real zip, no macros

const MAX_ENTRIES = 3000;
const MAX_UNCOMPRESSED = 250 * 1024 * 1024;

function checkOoxml(buf: Buffer): { ok: true; kind: 'docx' | 'xlsx' } | { ok: false; error: string } {
  const bad = (error = 'This file could not be read as a Word or Excel document.') => ({ ok: false as const, error });
  // End of central directory: in the last 64 KB + 22 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return bad();
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOff = buf.readUInt32LE(eocd + 16);
  if (!count || count > MAX_ENTRIES || cdOff + cdSize > eocd) return bad();
  const names = new Map<string, { method: number; csize: number; usize: number; local: number }>();
  let total = 0;
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return bad();
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8');
    if (flags & 0x1) return bad('Encrypted documents are not accepted.');
    if (![0, 8].includes(method)) return bad();
    if (name.includes('..') || name.startsWith('/') || name.includes('\\')) return bad();
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) return bad();
    if (usize > 0 && csize > 0 && usize / csize > 1000) return bad('This document is not accepted (compression ratio).');
    total += usize;
    if (total > MAX_UNCOMPRESSED) return bad('This document is too large once unpacked.');
    // Macros: the VBA project, in any location, under any case.
    if (/(^|\/)vbaproject\.bin$/i.test(name) || /(^|\/)vbadata\.xml$/i.test(name)) return bad('Documents with macros are not accepted. Save it as .docx or .xlsx without macros.');
    names.set(name, { method, csize, usize, local });
    p += 46 + nlen + xlen + clen;
  }
  const ct = names.get('[Content_Types].xml');
  if (!ct || ct.usize > 1024 * 1024) return bad();
  const ctXml = readEntry(buf, ct);
  if (ctXml === null) return bad();
  if (/macroenabled|vbaproject/i.test(ctXml)) return bad('Documents with macros are not accepted. Save it as .docx or .xlsx without macros.');
  const isDoc = /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml/i.test(ctXml) && names.has('word/document.xml');
  const isXls = /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet\.main\+xml/i.test(ctXml) && names.has('xl/workbook.xml');
  if (isDoc === isXls) return bad();
  return { ok: true, kind: isDoc ? 'docx' : 'xlsx' };
}

function readEntry(buf: Buffer, e: { method: number; csize: number; usize: number; local: number }): string | null {
  const nlen = buf.readUInt16LE(e.local + 26);
  const xlen = buf.readUInt16LE(e.local + 28);
  const start = e.local + 30 + nlen + xlen;
  if (start + e.csize > buf.length) return null;
  const data = buf.subarray(start, start + e.csize);
  try {
    const out = e.method === 0 ? data : zlib.inflateRawSync(data, { maxOutputLength: 1024 * 1024 });
    return out.toString('utf8');
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ SVG sanitiser (allow-list rebuild)

const SVG_ELEMENTS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'lineargradient', 'radialgradient', 'stop', 'title', 'desc', 'clippath', 'mask', 'use', 'text', 'tspan', 'symbol']);
const SVG_ATTRS = new Set([
  'xmlns', 'xmlns:xlink', 'version', 'viewbox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'transform',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset',
  'opacity', 'clip-path', 'clip-rule', 'mask', 'id', 'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'spreadmethod', 'fx', 'fy',
  'preserveaspectratio', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing', 'href', 'xlink:href', 'clippathunits', 'maskunits', 'maskcontentunits', 'patternunits', 'display', 'visibility',
]);
const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
/**
 * A transform value: only the transform functions, numbers, spaces, commas and brackets. Checked with two flat
 * (non-nested, linear) regexes on purpose: no url, no escape and no other function can pass.
 */
const safeTransform = (v: string) => v.length <= 2000 && /^[A-Za-z0-9\s,.()+-]*$/.test(v) && (v.match(/[A-Za-z]+/g) ?? []).every((w) => /^(matrix|translate|scale|rotate|skewX|skewY|e|E)$/.test(w));
const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escText = (s: string) => s.replace(/&(?!(amp|lt|gt|quot|apos|#\d{1,6}|#x[0-9a-f]{1,6});)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Rebuild an SVG from its allow-listed parts. Refuses DOCTYPEs, entities, CDATA and stylesheets outright. */
export function sanitizeSvg(input: string): { ok: true; svg: string; removed: number } | { ok: false; error: string } {
  if (input.length > SVG_MAX_BYTES) return { ok: false, error: `The SVG is too large (${SVG_MAX_BYTES / 1024} KB at most).` };
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[|<\?xml-stylesheet/i.test(input)) return { ok: false, error: 'This SVG is not accepted (DOCTYPE, entities, CDATA or stylesheets). Export a plain SVG, or send a PNG.' };
  const pre = input.replace(BOM_RE, '').replace(/<\?xml[^<>]*\?>/gi, '');
  // Comments out, with indexOf (a lazy regex rescans to the end for every unterminated "<!--": quadratic).
  const parts: string[] = [];
  let at = 0;
  for (;;) {
    const open = pre.indexOf('<!--', at);
    if (open < 0) break;
    const close = pre.indexOf('-->', open + 4);
    if (close < 0) return { ok: false, error: 'This SVG could not be read (an unclosed comment).' };
    parts.push(pre.slice(at, open));
    at = close + 3;
  }
  parts.push(pre.slice(at));
  const src = parts.join('');
  // Attribute names never contain < or quotes (security review H1: a name that could hold "<" made every failed tag
  // scan to the end of the input).
  const tagRe = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=>/<"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g;
  const out: string[] = [];
  const stack: { name: string; tag: string; keep: boolean }[] = [];
  let removed = 0;
  let last = 0;
  let sawRoot = false;
  let shapes = 0;
  // A counter, not a scan of the stack: checking every open element on every tag was quadratic in the nesting depth.
  let dropDepth = 0;
  const dropping = () => dropDepth > 0;
  for (const m of src.matchAll(tagRe)) {
    const between = src.slice(last, m.index);
    if (between.includes('<')) return { ok: false, error: 'This SVG could not be read.' };
    if (between.trim() && !dropping() && stack.length && ['text', 'tspan', 'title', 'desc'].includes(stack[stack.length - 1].name)) out.push(escText(between));
    last = (m.index ?? 0) + m[0].length;
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    const selfClose = m[4] === '/';
    if (closing) {
      const top = stack.pop();
      if (top && !top.keep) dropDepth--;
      if (!top || top.name !== name) return { ok: false, error: 'This SVG could not be read (unbalanced tags).' };
      if (top.keep && !dropping()) out.push(`</${top.tag}>`);
      continue;
    }
    if (!sawRoot) {
      if (name !== 'svg') return { ok: false, error: 'This is not an SVG file.' };
      sawRoot = true;
    }
    const keep = SVG_ELEMENTS.has(name) && !dropping();
    if (!keep) removed++;
    if (keep) {
      if (['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'use'].includes(name)) shapes++;
      const attrs: string[] = [];
      for (const a of m[3].matchAll(/([^\s=>/<"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)) {
        const an = a[1].toLowerCase();
        const av = (a[2] ?? a[3] ?? '').trim();
        if (!SVG_ATTRS.has(an) || an.startsWith('on')) {
          removed++;
          continue;
        }
        if (an === 'href' || an === 'xlink:href') {
          // Internal references only (#id): no external files, no data: or javascript: URLs.
          if (!/^#[A-Za-z_][\w.-]*$/.test(av)) {
            removed++;
            continue;
          }
        }
        // Namespaces are pinned (never a custom namespace that could change what the elements mean).
        if ((an === 'xmlns' && av !== SVG_NS) || (an === 'xmlns:xlink' && av !== XLINK_NS)) {
          removed++;
          continue;
        }
        // L1: no CSS escapes and no functions in values, so an escaped url( ... ) can never fetch anything. The only
        // function allowed is an internal url(#id); transforms keep their plain numeric grammar.
        const isTransform = an === 'transform' || an === 'gradienttransform';
        if (av.includes('\\') || (av.includes('(') && !(isTransform ? safeTransform(av) : /^url\(\s*#[A-Za-z_][\w.-]*\s*\)$/i.test(av)))) {
          removed++;
          continue;
        }
        if (/javascript:|data:|expression\s*\(/i.test(av)) {
          removed++;
          continue;
        }
        attrs.push(`${a[1]}="${escAttr(av.slice(0, 20_000))}"`);
      }
      const tag = m[2];
      out.push(`<${tag}${attrs.length ? ` ${attrs.join(' ')}` : ''}${selfClose ? '/' : ''}>`);
    }
    if (!selfClose) {
      if (stack.length >= 256) return { ok: false, error: 'This SVG is nested too deeply. Export a simpler SVG, or send a PNG.' };
      stack.push({ name, tag: m[2], keep });
      if (!keep) dropDepth++;
    }
  }
  if (src.slice(last).includes('<') || stack.length) return { ok: false, error: 'This SVG could not be read (unbalanced tags).' };
  if (!sawRoot || !shapes) return { ok: false, error: 'This SVG has no drawing in it.' };
  let svg = out.join('');
  if (!/^<svg[^>]*\sxmlns=/i.test(svg)) svg = svg.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return { ok: true, svg, removed };
}
