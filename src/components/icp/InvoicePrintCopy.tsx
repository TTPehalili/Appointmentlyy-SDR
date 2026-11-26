'use client';

import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import MinimalistInvoiceCard, { type MinimalistInvoiceCardProps } from '@/components/icp/MinimalistInvoiceCard';

/** Print copies currently shown, oldest first. Only the newest one carries data-print-active. */
const shownCopies: HTMLElement[] = [];
function syncActiveCopy() {
  shownCopies.forEach((el, i) => {
    if (i === shownCopies.length - 1) el.setAttribute('data-print-active', '');
    else el.removeAttribute('data-print-active');
  });
}

/**
 * A print-only copy of an invoice document, rendered straight into <body>. While it is active, printing the page
 * (a Print / PDF button or Ctrl+P) prints this document and nothing else: globals.css hides every other child of
 * <body> in print, so no editor, ledger, dialog or app chrome comes out, and the app's inner scroll area cannot clip
 * it to one page. Hidden on screen. Print always uses the light theme.
 *
 * The print rules only apply to the copy that carries data-print-active. With cacheComponents a page you leave stays
 * mounted inside a hidden <Activity>, and so does this portal node: the layout-effect cleanup (run synchronously when
 * the page is hidden, or when the copy unmounts) removes the attribute so other pages print normally, and the effect
 * sets it again on return. If two copies are ever shown at once, only the most recently shown one is active.
 */
export default function InvoicePrintCopy(props: MinimalistInvoiceCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    shownCopies.push(el);
    syncActiveCopy();
    return () => {
      const i = shownCopies.indexOf(el);
      if (i >= 0) shownCopies.splice(i, 1);
      el.removeAttribute('data-print-active');
      syncActiveCopy();
    };
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div ref={ref} className="invoice-print-root" data-testid="invoice-print">
      <MinimalistInvoiceCard {...props} />
    </div>,
    document.body,
  );
}
