import type { Metadata } from 'next';

/** Public view-only pages for copy recipients (Agreements): private links, never indexed or followed. */
export const metadata: Metadata = {
  title: 'Document (view only) · Appointmentlyy',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

export default function CopyViewLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-app text-fg">{children}</div>;
}
