'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Shield, 
  BookOpen, 
  Users, 
  FileSpreadsheet, 
  ArrowLeft,
  LayoutGrid
} from 'lucide-react';

export default function AdminNavigationHeader({ activeSection }: { activeSection?: string }) {
  const pathname = usePathname();

  const adminNav = [
    { 
      label: 'Tenant Overview', 
      href: '/admin', 
      match: '/admin',
      exact: true,
      icon: LayoutGrid 
    },
    { 
      label: 'Playbook Ingestion', 
      href: '/admin/frameworks', 
      match: '/admin/frameworks',
      icon: BookOpen 
    },
    { 
      label: 'Leads & Cadence', 
      href: '/admin/campaigns/enterprise-outbound/leads', 
      match: '/admin/campaigns',
      icon: FileSpreadsheet 
    },
    { 
      label: 'Reps & Certification', 
      href: '/admin/reps', 
      match: '/admin/reps',
      icon: Users 
    },
  ];

  return (
    <header className="border-b border-zinc-200 bg-white sticky top-0 z-30">
      {/* Top Bar */}
      <div className="h-12 px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-zinc-900" />
          <span className="font-bold text-xs tracking-tight text-zinc-900">
            Control Centre
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 font-mono font-medium">
            Admin
          </span>
        </div>

        <Link
          href="/dialer"
          className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          <span>Calling Floor</span>
        </Link>
      </div>

      {/* Tabs */}
      <div className="h-9 px-6 flex items-center gap-5 text-xs font-medium overflow-x-auto border-t border-zinc-100">
        {adminNav.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.exact 
            ? pathname === tab.match 
            : pathname.startsWith(tab.match);

          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={`h-full flex items-center gap-1.5 border-b-2 transition-colors ${
                isActive
                  ? 'border-zinc-950 text-zinc-950 font-semibold'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </header>
  );
}
