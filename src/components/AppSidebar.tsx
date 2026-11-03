'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Swords, 
  Headphones, 
  BookOpen, 
  Radio, 
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  Workflow,
  BarChart3,
  Bot,
  Building2,
  Lock,
  Mail,
  Inbox,
  Users,
  UploadCloud,
  LifeBuoy,
  FolderKanban
} from 'lucide-react';
import { useSession } from '@/lib/session';
import LinkedinIcon from '@/components/icons/LinkedinIcon';

export default function AppSidebar() {
  const pathname = usePathname();
  const { session, role, isAdmin, tenantName, repName } = useSession();

  // State: 'expanded' (w-56) or 'icons' (w-14)
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('sdr_sidebar_collapsed');
    if (saved === 'true') {
      setCollapsed(true);
    }
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sdr_sidebar_collapsed', String(next));
  };

  // Nav Groups
  const frontlineItems = [
    { label: 'Calling Floor', href: '/cockpit', icon: Swords },
    { label: 'Global Contacts', href: '/contacts', icon: Users },
    { label: 'ICP List Builder', href: '/icp-builder', icon: FolderKanban },
    { label: 'Sparring Arena', href: '/sparring', icon: Headphones },
    { label: 'LinkedIn Studio', href: '/linkedin', icon: LinkedinIcon },
    { label: 'Cold Email Studio', href: '/email', icon: Mail },
    { label: 'Unified Inbox', href: '/inbox', icon: Inbox },
    { label: 'Performance', href: '/analytics', icon: BarChart3 },
    { label: 'Playbooks & Guide', href: '/guide', icon: BookOpen },
  ];

  const managementItems = [
    { label: 'Support Tickets', href: '/tickets', icon: LifeBuoy },
    { label: 'Upload Playbook', href: '/admin/frameworks', icon: UploadCloud },
    { label: 'Floor Monitor', href: '/monitoring', icon: Radio },
    { label: 'Workflow Studio', href: '/workflows', icon: Workflow },
    { label: 'Operations Intel', href: '/assistant', icon: Bot },
    { label: 'Admin Control', href: '/admin', icon: ShieldCheck },
  ];

  const isItemActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={`bg-zinc-50/90 border-r border-zinc-200 shrink-0 select-none z-40 flex flex-col justify-between py-3 transition-all duration-150 ease-in-out ${
        collapsed ? 'w-15 px-2' : 'w-56 px-3'
      }`}
    >
      {/* Top Section */}
      <div className="flex flex-col gap-4">
        {/* Workspace Brand / Header */}
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between px-1'}`}>
          <Link href="/" className="flex items-center gap-2 group overflow-hidden">
            <div className="h-7 w-7 rounded-md bg-zinc-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
              A
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-xs text-zinc-900 truncate tracking-tight">
                  {tenantName}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  SDR Workspace
                </span>
              </div>
            )}
          </Link>

          {!collapsed && (
            <button
              onClick={toggleCollapsed}
              className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 transition-colors"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {collapsed && (
          <div className="flex justify-center">
            <button
              onClick={toggleCollapsed}
              className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 transition-colors"
              title="Expand sidebar"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Frontline Navigation */}
        <nav className="flex flex-col gap-0.5">
          {!collapsed && (
            <div className="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Tools
            </div>
          )}
          {frontlineItems.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`flex items-center rounded-lg text-xs font-medium transition-colors ${
                  collapsed
                    ? 'justify-center h-9 w-9 mx-auto'
                    : 'gap-2.5 px-2.5 py-2'
                } ${
                  active
                    ? 'bg-zinc-900 text-white font-semibold shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/50'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Management Navigation (Admin & Manager) */}
        {isAdmin && (
          <nav className="flex flex-col gap-0.5 pt-2 border-t border-zinc-200/60">
            {!collapsed && (
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Management
              </div>
            )}
            {managementItems.map((item) => {
              const Icon = item.icon;
              const active = isItemActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center rounded-lg text-xs font-medium transition-colors ${
                    collapsed
                      ? 'justify-center h-9 w-9 mx-auto'
                      : 'gap-2.5 px-2.5 py-2'
                  } ${
                    active
                      ? 'bg-zinc-900 text-white font-semibold shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/50'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      {/* Bottom User Capsule */}
      <div className={`pt-2 border-t border-zinc-200/80 ${collapsed ? 'flex justify-center' : 'px-1'}`}>
        {!collapsed ? (
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-6 w-6 rounded bg-zinc-200 text-zinc-800 flex items-center justify-center font-bold text-[10px] shrink-0">
                {repName.charAt(0)}
              </div>
              <div className="flex flex-col min-w-0 leading-tight">
                <span className="font-semibold text-zinc-900 truncate text-[11px]">{repName}</span>
                <span className="text-[10px] text-zinc-400 font-mono truncate">{role}</span>
              </div>
            </div>
          </div>
        ) : (
          <div
            title={`${repName} (${role})`}
            className="h-6 w-6 rounded bg-zinc-200 text-zinc-800 flex items-center justify-center font-bold text-[10px]"
          >
            {repName.charAt(0)}
          </div>
        )}
      </div>
    </aside>
  );
}
