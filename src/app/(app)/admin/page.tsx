'use client';

import { SectionRedirect } from '@/components/shell/SectionRedirect';
import { ADMIN_NAV } from '@/lib/adminNav';

export default function AdminIndexPage() {
  return <SectionRedirect groups={ADMIN_NAV} />;
}
