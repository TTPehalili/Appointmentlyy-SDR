/**
 * Server only. PDF checks and text extraction (pdfjs-dist, the legacy Node build) for the Client Projects
 * planner and intake, and for Agreements (custom proposal import, page bookmarks of our own PDFs).
 * Text is extracted per page so every proposed card can cite its source page. Nothing is rendered,
 * no fonts or scripts are loaded, and pages and characters are capped.
 *
 * Uploaded PDFs are untrusted and pdf.js work is synchronous: a "decompression bomb" (a small file whose
 * streams inflate to hundreds of MB) would block the server's event loop and its memory. So every parse
 * runs in its own worker thread (node:worker_threads), never on the request thread:
 * - a V8 heap cap per parse (resourceLimits) and a wall clock (PDF_LIMITS.wallMs): the worker is
 *   terminated when either is hit, or when the process grows by more than PDF_LIMITS.rssBudgetMb
 *   while it runs (inflated stream buffers live outside the V8 heap);
 * - at most PDF_LIMITS.concurrency parses at once, a short queue behind them, and PdfUnsafeError
 *   ("This PDF couldn't be read safely") when a parse is stopped or the queue is full.
 * The worker code is an inline script (eval) that loads pdf.js from node_modules at run time, so the
 * bundler never rewrites it and it works the same in `next dev` and the production `next start` build.
 */
import { Worker } from 'node:worker_threads';
import { CP_LIMITS } from '@/lib/clientProjects/types';

export interface PdfPage {
  page: number;
  text: string;
}

/** A PDF by its magic bytes ("%PDF-" at the very start), within the size cap. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length > 100 && bytes.length <= CP_LIMITS.fileBytes && Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-';
}

export const PDF_LIMITS = {
  /** Wall clock per parse (worker terminated after this). */
  wallMs: 25_000,
  /** V8 heap per parse worker. */
  heapMb: 512,
  /** Process growth allowed while a parse runs (catches inflated buffers outside the V8 heap). */
  rssBudgetMb: 320,
  /** Parses at once, and how many may wait behind them. */
  concurrency: 2,
  queue: 16,
} as const;

export const PDF_UNSAFE_MESSAGE = 'This PDF couldn’t be read safely: it is too large or too complex once unpacked. Save it again (for example with “Print to PDF”) or split it, then upload it again.';
export const PDF_BUSY_MESSAGE = 'Too many PDFs are being read right now. Try again in a minute.';

/** A parse that was stopped (time, memory) or refused (queue full). The message is safe to show. */
export class PdfUnsafeError extends Error {
  readonly code: 'pdf_unsafe' | 'pdf_busy';
  constructor(code: 'pdf_unsafe' | 'pdf_busy' = 'pdf_unsafe', detail?: string) {
    super(code === 'pdf_busy' ? PDF_BUSY_MESSAGE : PDF_UNSAFE_MESSAGE);
    this.name = 'PdfUnsafeError';
    this.code = code;
    if (detail) this.cause = detail;
  }
}

type Job =
  | { kind: 'count' }
  | { kind: 'text'; maxPages: number; maxChars: number }
  | { kind: 'outline' };

/**
 * The worker script (CommonJS, run with eval: true). pdf.js is resolved from the app's own node_modules
 * at run time; eval is off inside pdf.js (isEvalSupported: false) and fonts, XFA and system fonts are not loaded.
 */
const WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const { createRequire } = require('node:module');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const send = (m) => parentPort.postMessage(m);
const tick = (p, ms, what) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(what + ' timed out')), ms);
  p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});
(async () => {
  const spec = 'pdfjs-dist/legacy/build/pdf.mjs';
  let url = spec;
  try { url = pathToFileURL(createRequire(path.join(process.cwd(), 'package.json')).resolve(spec)).href; } catch (e) { /* bare specifier */ }
  const pdfjs = await import(url);
  const { job, bytes } = workerData;
  const task = pdfjs.getDocument({ data: bytes, disableFontFace: true, useSystemFonts: false, enableXfa: false, isEvalSupported: false, stopAtErrors: false, verbosity: 0 });
  try {
    const doc = await tick(task.promise, 20000, 'open');
    if (job.kind === 'count') return send({ ok: true, value: doc.numPages });
    if (job.kind === 'outline') {
      const outline = (await tick(doc.getOutline(), 10000, 'outline')) || [];
      const entries = [];
      for (const o of outline.slice(0, 500)) {
        let dest = o.dest;
        if (typeof dest === 'string') dest = await tick(doc.getDestination(dest), 5000, 'destination');
        const ref = Array.isArray(dest) ? dest[0] : null;
        if (!ref || typeof ref !== 'object') continue;
        const idx = await tick(doc.getPageIndex(ref), 5000, 'page index');
        entries.push({ title: String(o.title || ''), page: idx + 1 });
      }
      return send({ ok: true, value: { entries, pageCount: doc.numPages } });
    }
    const pages = [];
    let used = 0;
    let truncated = doc.numPages > job.maxPages;
    for (let i = 1; i <= Math.min(doc.numPages, job.maxPages); i++) {
      const page = await tick(doc.getPage(i), 10000, 'page');
      const content = await tick(page.getTextContent(), 15000, 'text');
      let text = '';
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue;
        text += item.str + (item.hasEOL ? '\n' : ' ');
        if (text.length > job.maxChars * 2) break;
      }
      text = text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, ' ').replace(/[ \t]+/g, ' ').trim();
      if (used + text.length > job.maxChars) {
        text = text.slice(0, Math.max(0, job.maxChars - used));
        truncated = true;
      }
      used += text.length;
      pages.push({ page: i, text });
      page.cleanup();
      if (used >= job.maxChars) break;
    }
    send({ ok: true, value: { pages, pageCount: doc.numPages, truncated } });
  } finally {
    await task.destroy().catch(() => undefined);
  }
})().catch((err) => send({ ok: false, name: String((err && err.name) || 'Error'), message: String((err && err.message) || err).slice(0, 300) }));
`;

// ------------------------------------------------------------------ concurrency gate

const gate = (() => {
  const g = globalThis as typeof globalThis & { __appyPdfGate?: { active: number; waiting: (() => void)[] } };
  return (g.__appyPdfGate ??= { active: 0, waiting: [] });
})();

async function acquire(): Promise<() => void> {
  if (gate.active >= PDF_LIMITS.concurrency) {
    if (gate.waiting.length >= PDF_LIMITS.queue) throw new PdfUnsafeError('pdf_busy');
    await new Promise<void>((resolve) => gate.waiting.push(resolve));
  } else gate.active++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = gate.waiting.shift();
    if (next) next(); // the slot passes straight to the next parse
    else gate.active--;
  };
}

/** Run one pdf.js job in a fresh worker thread with the limits above. */
async function runPdfJob<T>(bytes: Uint8Array, job: Job): Promise<T> {
  const release = await acquire();
  try {
    return await new Promise<T>((resolve, reject) => {
      const copy = new Uint8Array(bytes); // the worker takes ownership of its own copy
      const worker = new Worker(/* webpackIgnore: true */ /* turbopackIgnore: true */ WORKER_SOURCE, {
        eval: true,
        workerData: { job, bytes: copy },
        transferList: [copy.buffer],
        resourceLimits: { maxOldGenerationSizeMb: PDF_LIMITS.heapMb, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
        stdout: false,
        stderr: false,
      });
      const rss0 = process.memoryUsage.rss();
      let done = false;
      const finish = (fn: () => void) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearInterval(watch);
        void worker.terminate().catch(() => undefined);
        fn();
      };
      const stop = (why: string) => finish(() => {
        console.warn(`[pdf] parse stopped: ${why}`);
        reject(new PdfUnsafeError('pdf_unsafe', why));
      });
      const timer = setTimeout(() => stop(`over ${PDF_LIMITS.wallMs / 1000} s`), PDF_LIMITS.wallMs);
      const watch = setInterval(() => {
        const grew = (process.memoryUsage.rss() - rss0) / 1048576;
        if (grew > PDF_LIMITS.rssBudgetMb) stop(`memory grew by ${Math.round(grew)} MB`);
      }, 25);
      worker.on('message', (m: { ok: boolean; value?: T; name?: string; message?: string }) =>
        finish(() => {
          if (m.ok) return resolve(m.value as T);
          const err = new Error(m.message || 'PDF could not be read');
          err.name = m.name || 'Error'; // e.g. PasswordException, InvalidPDFException
          reject(err);
        }),
      );
      worker.on('error', (err: Error & { code?: string }) => (err.code === 'ERR_WORKER_OUT_OF_MEMORY' ? stop('out of memory') : finish(() => reject(err))));
      worker.on('exit', (code) => (code !== 0 ? stop(`worker exited with code ${code}`) : finish(() => reject(new Error('PDF worker ended without a result')))));
    });
  } finally {
    release();
  }
}

/** Page count of a readable PDF, or null when the file cannot be parsed as one (or not safely). */
export async function pdfPageCount(bytes: Uint8Array): Promise<number | null> {
  if (!looksLikePdf(bytes)) return null;
  try {
    const n = await runPdfJob<number>(bytes, { kind: 'count' });
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Text per page (first `maxPages` pages, at most `maxChars` characters in all). Throws PdfUnsafeError when
 * the parse is stopped (time, memory, busy), or pdf.js's own error (name kept, e.g. PasswordException).
 */
export async function extractPdfText(bytes: Uint8Array, maxPages: number = CP_LIMITS.aiPages, maxChars: number = CP_LIMITS.aiCharsPerFile): Promise<{ pages: PdfPage[]; pageCount: number; truncated: boolean }> {
  return runPdfJob(bytes, { kind: 'text', maxPages, maxChars });
}

/**
 * The PDF's top-level bookmarks (outline) in order, each with the page it points to, and the page count.
 * Used for our own rendered proposals (to find the pricing and terms pages), never for uploads.
 */
export async function pdfOutlinePages(bytes: Uint8Array): Promise<{ entries: { title: string; page: number }[]; pageCount: number }> {
  return runPdfJob(bytes, { kind: 'outline' });
}
