import { AppShell } from '@/components/shell/AppShell';

/** Every signed-in app screen shares one shell. Login, certificates and /design sit outside this group. */
export default function AppLayout({ children }: LayoutProps<'/'>) {
  return <AppShell>{children}</AppShell>;
}
