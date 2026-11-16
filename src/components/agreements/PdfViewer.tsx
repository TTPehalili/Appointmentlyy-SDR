'use client';

/**
 * Renders a PDF with pdf.js (pdfjs-dist) as a stack of canvases: no browser PDF plugin, no download
 * button. Reports the page in view and every page seen (for the signer's reading tracking).
 */
import * as React from 'react';
import { Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';

type PdfJs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((m) => {
      if (!m.GlobalWorkerOptions.workerPort) {
        m.GlobalWorkerOptions.workerPort = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' });
      }
      return m;
    });
  }
  return pdfjsPromise;
}

export function PdfViewer({
  data,
  onPages,
  onView,
  onRendered,
  className,
  label = 'Document',
}: {
  /** The PDF bytes (a copy is handed to pdf.js). */
  data: ArrayBuffer | null;
  onPages?: (count: number) => void;
  /** Page currently most in view, and all pages seen so far (1-based). */
  onView?: (page: number, seen: number[]) => void;
  /** Called once per document, after the first page has actually been drawn. */
  onRendered?: () => void;
  className?: string;
  label?: string;
}) {
  const wrap = React.useRef<HTMLDivElement>(null);
  const [count, setCount] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [width, setWidth] = React.useState(0);
  const docRef = React.useRef<import('pdfjs-dist').PDFDocumentProxy | null>(null);
  const canvases = React.useRef<(HTMLCanvasElement | null)[]>([]);
  const onPagesRef = React.useRef(onPages);
  const onViewRef = React.useRef(onView);
  const onRenderedRef = React.useRef(onRendered);
  const renderedFired = React.useRef(false);
  React.useEffect(() => {
    onPagesRef.current = onPages;
    onViewRef.current = onView;
    onRenderedRef.current = onRendered;
  });

  // Width of the column, so pages render sharp at any screen size.
  React.useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.clientWidth)));
    ro.observe(el);
    setWidth(Math.round(el.clientWidth));
    return () => ro.disconnect();
  }, []);

  // Load the document.
  React.useEffect(() => {
    if (!data) return;
    let cancelled = false;
    let task: { destroy(): Promise<void> } | null = null;
    renderedFired.current = false;
    setError(null);
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const loading = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) });
        task = loading;
        const doc = await loading.promise;
        if (cancelled) return;
        docRef.current = doc;
        setCount(doc.numPages);
        onPagesRef.current?.(doc.numPages);
      } catch {
        if (!cancelled) setError('The document could not be shown. Reload the page to try again.');
      }
    })();
    return () => {
      cancelled = true;
      docRef.current = null;
      if (task) void task.destroy();
    };
  }, [data]);

  // Draw every page at the current width.
  React.useEffect(() => {
    const doc = docRef.current;
    if (!doc || !count || !width) return;
    let cancelled = false;
    const tasks: { cancel(): void }[] = [];
    (async () => {
      for (let i = 1; i <= count && !cancelled; i++) {
        const page = await doc.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const cssW = Math.max(240, width);
        const scale = cssW / base.width;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vp = page.getViewport({ scale: scale * dpr });
        const canvas = canvases.current[i - 1];
        if (!canvas || cancelled) continue;
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
        const task = page.render({ canvas, viewport: vp });
        tasks.push(task);
        try {
          await task.promise;
          if (i === 1 && !cancelled && !renderedFired.current) {
            renderedFired.current = true;
            onRenderedRef.current?.();
          }
        } catch {
          // cancelled on resize/unmount
        }
      }
    })();
    return () => {
      cancelled = true;
      tasks.forEach((t) => t.cancel());
    };
  }, [count, width]);

  // Track pages in view.
  React.useEffect(() => {
    if (!count) return;
    const seen = new Set<number>();
    const ratios = new Map<number, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          const n = Number((en.target as HTMLElement).dataset.page);
          ratios.set(n, en.intersectionRatio);
          if (en.intersectionRatio >= 0.35) seen.add(n);
        }
        let best = 0;
        let bestR = 0;
        ratios.forEach((r, n) => {
          if (r > bestR) {
            bestR = r;
            best = n;
          }
        });
        if (best) seen.add(best);
        onViewRef.current?.(best, [...seen].sort((a, b) => a - b));
      },
      { threshold: [0, 0.2, 0.35, 0.6, 0.9] },
    );
    canvases.current.slice(0, count).forEach((c) => c && io.observe(c));
    return () => io.disconnect();
  }, [count]);

  return (
    <div ref={wrap} className={cn('w-full', className)} aria-label={label} role="document">
      {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-body text-danger-fg">{error}</p>}
      {!count && !error && (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="aspect-[1/1.414] w-full" />
        </div>
      )}
      <div className="flex flex-col items-center gap-4" onContextMenu={(e) => e.preventDefault()}>
        {Array.from({ length: count }, (_, i) => (
          <canvas
            key={i}
            ref={(el) => {
              canvases.current[i] = el;
            }}
            data-page={i + 1}
            aria-label={`Page ${i + 1} of ${count}`}
            className="block max-w-full rounded-sm bg-white shadow-sm ring-1 ring-line"
          />
        ))}
      </div>
    </div>
  );
}
