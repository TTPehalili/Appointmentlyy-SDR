/**
 * Server only. PDF checks and text extraction for the AI planner (pdfjs-dist, the legacy Node build).
 * Text is extracted per page so every proposed card can cite its source page. Nothing is rendered,
 * no fonts or scripts are loaded, and pages and characters are capped.
 */
import { CP_LIMITS } from '@/lib/clientProjects/types';

export interface PdfPage {
  page: number;
  text: string;
}

/** A PDF by its magic bytes ("%PDF-" at the very start), within the size cap. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length > 100 && bytes.length <= CP_LIMITS.fileBytes && Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-';
}

type PdfJs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  // Loaded by Node at run time, not bundled: the legacy build finds its own worker file next to itself in
  // node_modules. The specifier is assembled so the bundler leaves it alone (and the browser viewer's own
  // pdf.js bundle in components/agreements is untouched).
  const spec = ['pdfjs-dist', 'legacy', 'build', 'pdf.mjs'].join('/');
  pdfjsPromise ??= import(/* webpackIgnore: true */ /* turbopackIgnore: true */ spec) as Promise<PdfJs>;
  return pdfjsPromise;
}

async function openPdf(bytes: Uint8Array) {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes), // pdf.js takes ownership of the buffer: always a copy
    disableFontFace: true,
    useSystemFonts: false,
    enableXfa: false,
    stopAtErrors: false,
    verbosity: 0,
  });
  const close = () => task.destroy().catch(() => undefined);
  try {
    return { doc: await withTimeout(task.promise, 20_000), close };
  } catch (err) {
    await close();
    throw err;
  }
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('PDF processing timed out')), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });

/** Page count of a readable PDF, or null when the file cannot be parsed as one. */
export async function pdfPageCount(bytes: Uint8Array): Promise<number | null> {
  if (!looksLikePdf(bytes)) return null;
  try {
    const { doc, close } = await openPdf(bytes);
    const n = doc.numPages;
    await close();
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Text per page (first `maxPages` pages, at most `maxChars` characters in all). */
export async function extractPdfText(bytes: Uint8Array, maxPages: number = CP_LIMITS.aiPages, maxChars: number = CP_LIMITS.aiCharsPerFile): Promise<{ pages: PdfPage[]; pageCount: number; truncated: boolean }> {
  const { doc, close } = await openPdf(bytes);
  try {
    const pages: PdfPage[] = [];
    let used = 0;
    let truncated = doc.numPages > maxPages;
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
      const page = await withTimeout(doc.getPage(i), 10_000);
      const content = await withTimeout(page.getTextContent(), 15_000);
      let text = '';
      for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
        if (typeof item.str !== 'string') continue;
        text += item.str + (item.hasEOL ? '\n' : ' ');
      }
      text = text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, ' ').replace(/[ \t]+/g, ' ').trim();
      if (used + text.length > maxChars) {
        text = text.slice(0, Math.max(0, maxChars - used));
        truncated = true;
      }
      used += text.length;
      pages.push({ page: i, text });
      if (used >= maxChars) break;
    }
    return { pages, pageCount: doc.numPages, truncated };
  } finally {
    await close();
  }
}
