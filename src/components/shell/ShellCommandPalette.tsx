'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PanelLeft, Settings, Sparkles, Wrench } from 'lucide-react';
import { CommandPalette, type CommandItem } from '@/components/ui';
import { useSession } from '@/lib/session';
import { can } from '@/lib/permissions';
import { ADMIN_NAV, PLATFORM_NAV } from '@/lib/adminNav';
import { useShell } from './ShellContext';
import { useVisibleNav } from './useVisibleNav';

const TOOL_SHORTCUTS = [
  { id: 'icp', navId: 'lead-finder', label: 'ICP List Builder', href: '/lead-finder', keywords: 'lead finder prospects' },
  { id: 'sparring', navId: 'practice', label: 'Sparring Arena', href: '/practice', keywords: 'practice ai buyer roleplay' },
  { id: 'cold-email', navId: 'outreach', label: 'Cold Email Studio', href: '/outreach/email', keywords: 'outreach email' },
  { id: 'linkedin', navId: 'outreach', label: 'LinkedIn Studio', href: '/outreach/linkedin', keywords: 'outreach post' },
  { id: 'floor', navId: 'live-floor', label: 'Floor Monitor', href: '/live-floor', keywords: 'live floor listen whisper' },
];

/**
 * ⌘K: jump to a page or run an action.
 * DESIGN-NOTE: lead search plugs in here once a client-side lead index is exposed (Phase 4, Contacts).
 */
export function ShellCommandPalette() {
  const router = useRouter();
  const { role } = useSession();
  const { paletteOpen, setPaletteOpen, toggleCollapsed, copilotOpen, setCopilotOpen } = useShell();
  const nav = useVisibleNav();

  const items: CommandItem[] = React.useMemo(() => {
    const pages: CommandItem[] = nav.map((n) => {
      const Icon = n.icon;
      return {
        id: `nav-${n.id}`,
        group: 'Go to',
        label: n.label,
        icon: <Icon />,
        keywords: n.keywords,
        onRun: () => router.push(n.href),
      };
    });
    // Direct entries for the core tools, under the names reps already know.
    const tools: CommandItem[] = TOOL_SHORTCUTS.filter((t) => nav.some((n) => n.id === t.navId)).map((t) => ({
      id: `tool-${t.id}`,
      group: 'Tools',
      label: t.label,
      icon: <Wrench />,
      keywords: t.keywords,
      onRun: () => router.push(t.href),
    }));
    const sections = [
      ...ADMIN_NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: 'Admin' }))),
      ...PLATFORM_NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: 'Platform Console' }))),
    ];
    const admin: CommandItem[] = sections.filter((t) => can(role, t.permission)).map((t) => ({
      id: `admin-${t.id}`,
      group: t.group,
      label: t.label,
      icon: <Settings />,
      keywords: t.keywords,
      onRun: () => router.push(t.href),
    }));
    const actions: CommandItem[] = [
      {
        id: 'act-copilot',
        group: 'Actions',
        label: copilotOpen ? 'Close AI Copilot' : 'Open AI Copilot',
        icon: <Sparkles />,
        hint: 'Ctrl J',
        onRun: () => setCopilotOpen(!copilotOpen),
      },
      { id: 'act-sidebar', group: 'Actions', label: 'Collapse or expand sidebar', icon: <PanelLeft />, hint: '[', onRun: toggleCollapsed },
      {
        id: 'act-settings',
        group: 'Actions',
        label: 'Settings',
        icon: <Settings />,
        keywords: 'appearance theme dark mode light mode system preferences',
        onRun: () => router.push('/settings'),
      },
    ];
    return [...pages, ...tools, ...actions, ...admin];
  }, [nav, role, router, copilotOpen, setCopilotOpen, toggleCollapsed]);

  return <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={items} />;
}
