import type { Metadata } from 'next';

/** Public signer pages (Agreements): private links, never indexed or followed. */
export const metadata: Metadata = {
  title: 'Document for signature · Appointmentlyy',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

export default function SignerLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-app text-fg">{children}</div>;
}
