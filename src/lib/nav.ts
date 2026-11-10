import {
  BarChart3,
  Contact,
  GraduationCap,
  Inbox,
  Kanban,
  LifeBuoy,
  type LucideIcon,
  Mic,
  Phone,
  Radio,
  Search,
  Send,
  Settings,
} from 'lucide-react';
import type { Permission } from '@/lib/permissions';
import type { FeatureFlag } from '@/lib/featureFlags';

export type NavGroup = 'main' | 'prospect' | 'improve' | 'team' | 'footer';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  group: NavGroup;
  permission?: Permission;
  featureFlag?: FeatureFlag;
  /** Extra path prefixes that should mark this item active. */
  match?: string[];
  /** Words the ⌘K palette should also match. */
  keywords?: string;
}

/** Redesign spec 3.3: 9 rep items in 3 groups, Team (Manager+), then Help and Admin. */
export const NAV_ITEMS: NavItem[] = [
  { id: 'dialer', label: 'Dialer', icon: Phone, href: '/dialer', group: 'main', keywords: 'calling floor cockpit call' },
  { id: 'inbox', label: 'Inbox', icon: Inbox, href: '/inbox', group: 'main', keywords: 'email replies' },

  { id: 'contacts', label: 'Contacts', icon: Contact, href: '/contacts', group: 'prospect', keywords: 'leads people lists' },
  { id: 'pipeline', label: 'Pipeline', icon: Kanban, href: '/pipeline', group: 'prospect', keywords: 'deals board' },
  { id: 'lead-finder', label: 'Lead Finder', icon: Search, href: '/lead-finder', group: 'prospect', permission: 'leadFinder', keywords: 'icp list builder prospects' },
  { id: 'outreach', label: 'Outreach', icon: Send, href: '/outreach/email', group: 'prospect', match: ['/outreach'], keywords: 'cold email linkedin studio' },

  { id: 'practice', label: 'Practice', icon: Mic, href: '/practice', group: 'improve', keywords: 'sparring arena ai buyer' },
  { id: 'reports', label: 'Reports', icon: BarChart3, href: '/reports', group: 'improve', keywords: 'performance analytics' },

  { id: 'live-floor', label: 'Live floor', icon: Radio, href: '/live-floor', group: 'team', permission: 'team', keywords: 'floor monitor listen whisper' },
  { id: 'coaching', label: 'Coaching', icon: GraduationCap, href: '/coaching', group: 'team', permission: 'team', featureFlag: 'coaching' },

  { id: 'help', label: 'Help', icon: LifeBuoy, href: '/help', group: 'footer', keywords: 'guide playbooks' },
  { id: 'admin', label: 'Admin', icon: Settings, href: '/admin', group: 'footer', permission: 'admin', keywords: 'settings management' },
];

export const NAV_GROUP_LABELS: Partial<Record<NavGroup, string>> = {
  prospect: 'Prospect',
  improve: 'Improve',
  team: 'Team',
};

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === '/') return pathname === '/';
  const prefixes = [item.href, ...(item.match ?? [])];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
