'use client';

import { SectionRedirect } from '@/components/shell/SectionRedirect';
import { PLATFORM_NAV } from '@/lib/adminNav';

export default function PlatformIndexPage() {
  return <SectionRedirect groups={PLATFORM_NAV} />;
}
