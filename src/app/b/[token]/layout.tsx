import type { Metadata } from 'next';

/** Shared client boards (Client Projects): private links, never indexed or followed. */
export const metadata: Metadata = {
  title: 'Project board · Appointmentlyy',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

export default function BoardLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-app text-fg">{children}</div>;
}
