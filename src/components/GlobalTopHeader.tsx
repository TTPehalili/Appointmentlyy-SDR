'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { 
  Search, 
  BookOpen, 
  Bell, 
  ChevronDown, 
  CheckCircle2, 
  LogOut,
  Building2,
  User,
  Shield,
  X,
  Target,
  Swords,
  Headphones,
  Radio,
  Workflow,
  BarChart3,
  Check,
  UploadCloud,
  LifeBuoy
} from 'lucide-react';
import { useSession, UserRole } from '@/lib/session';
import LinkedinIcon from '@/components/icons/LinkedinIcon';

interface NavCommand {
  title: string;
  category: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const COMMANDS: NavCommand[] = [
  { title: 'Playbook Ingestion & Script Customizer (AI)', category: 'Administration', href: '/admin/frameworks', icon: UploadCloud },
  { title: 'AI Boris Calling Cockpit', category: 'Calling Floor', href: '/cockpit', icon: Swords },
  { title: 'AI Sparring Arena', category: 'Training', href: '/sparring', icon: Headphones },
  { title: 'LinkedIn Thought Leadership & Viral Studio', category: 'Social Outbound', href: '/linkedin', icon: LinkedinIcon },
  { title: 'Live Floor Monitoring', category: 'Supervision', href: '/monitoring', icon: Radio },
  { title: 'Mission & Targets Hub', category: 'Overview', href: '/', icon: Target },
  { title: 'Workflow Automation Studio', category: 'Automation', href: '/workflows', icon: Workflow },
  { title: 'Performance & Quotas', category: 'Analytics', href: '/analytics', icon: BarChart3 },
  { title: 'Support & Trouble Tickets', category: 'Management', href: '/tickets', icon: LifeBuoy },
  { title: 'User Guide & Playbooks', category: 'Enablement', href: '/guide', icon: BookOpen },
  { title: 'Admin Control Centre', category: 'Administration', href: '/admin', icon: Shield },
];

const TENANTS_LIST = [
  { name: 'Apex Global BPO', code: 'APEX-GLOBAL' },
  { name: 'ShorePartners BPO', code: 'SHORE-PARTNERS' },
  { name: 'CloudStaff Outsourcing', code: 'CLOUD-STAFF' },
  { name: 'Vanguard BPO Solutions', code: 'VANGUARD-PH' },
];

export default function GlobalTopHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { session, role, tenantName, repName, email, updateSession, logout } = useSession();

  const [bneTime, setBneTime] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [tenantMenuOpen, setTenantMenuOpen] = useState(false);

  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const tenantMenuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Brisbane AEST Time Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: 'Australia/Brisbane',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      };
      setBneTime(new Intl.DateTimeFormat('en-AU', options).format(now));
    };

    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  // Cmd+K hotkey for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
        setUserMenuOpen(false);
        setNotificationsOpen(false);
        setTenantMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus search input on open
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (tenantMenuRef.current && !tenantMenuRef.current.contains(e.target as Node)) {
        setTenantMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleRoleSwitch = (newRole: UserRole) => {
    updateSession({ role: newRole });
    setUserMenuOpen(false);
  };

  const handleTenantSwitch = (t: { name: string; code: string }) => {
    updateSession({ tenantName: t.name, tenantCode: t.code });
    setTenantMenuOpen(false);
  };

  const handleSignOut = () => {
    logout();
    router.push('/login');
  };

  const filteredCommands = COMMANDS.filter((cmd) =>
    `${cmd.title} ${cmd.category}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <header className="h-13 bg-white border-b border-zinc-200 px-4 sm:px-6 flex items-center justify-between shrink-0 select-none z-30">
        {/* Left: Brand & Tenant Switcher */}
        <div className="flex items-center gap-3">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="h-7 w-7 rounded-md bg-zinc-900 text-white flex items-center justify-center font-black text-xs tracking-tighter">
              A
            </div>
            <span className="font-bold text-xs tracking-tight text-zinc-900 hidden md:inline">
              APPOINTMENTLYY <span className="font-normal text-zinc-400">SDR</span>
            </span>
          </Link>

          <div className="h-4 w-[1px] bg-zinc-200 hidden sm:block" />

          {/* Active Tenant Selector */}
          <div className="relative" ref={tenantMenuRef}>
            <button
              onClick={() => setTenantMenuOpen(!tenantMenuOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200/70 text-xs text-zinc-800 font-medium transition-colors"
            >
              <Building2 className="h-3.5 w-3.5 text-zinc-500" />
              <span className="max-w-[130px] truncate">{tenantName}</span>
              <ChevronDown className="h-3 w-3 text-zinc-400" />
            </button>

            {tenantMenuOpen && (
              <div className="absolute left-0 mt-1 w-56 bg-white border border-zinc-200 rounded-xl shadow-lg p-1.5 z-50">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Switch Workspace
                </div>
                {TENANTS_LIST.map((t) => (
                  <button
                    key={t.code}
                    onClick={() => handleTenantSwitch(t)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-zinc-100 transition-colors text-left"
                  >
                    <span className="truncate">{t.name}</span>
                    {tenantName === t.name && <Check className="h-3.5 w-3.5 text-zinc-900" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Brisbane Time */}
          {bneTime && (
            <span className="text-[11px] font-mono text-zinc-400 hidden lg:inline">
              {bneTime} AEST
            </span>
          )}
        </div>

        {/* Center: Minimalist Search Launcher */}
        <div className="flex-1 max-w-sm mx-4 hidden md:block">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200/60 border border-zinc-200/60 text-xs text-zinc-500 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-zinc-400" />
              <span>Jump to tool or lead...</span>
            </div>
            <kbd className="text-[10px] font-mono bg-white border border-zinc-200 px-1.5 py-0.2 rounded text-zinc-500">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right: Actions & User Account */}
        <div className="flex items-center gap-2">
          {/* Mobile search trigger */}
          <button
            onClick={() => setSearchOpen(true)}
            className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-600 md:hidden"
            title="Search"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Guide Shortcut */}
          <Link
            href="/guide"
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Guide</span>
          </Link>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-600 transition-colors relative"
              title="Notifications"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-zinc-900" />
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 mt-1 w-72 bg-white border border-zinc-200 rounded-xl shadow-lg p-3 z-50 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-100 mb-2 font-semibold">
                  <span>Floor Activity</span>
                  <span className="text-[10px] text-zinc-400">Live</span>
                </div>
                <div className="space-y-2">
                  <div className="p-2 rounded-lg bg-zinc-50 border border-zinc-100">
                    <div className="font-medium text-zinc-900">Julian Vance (Apex Global)</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">Callback confirmed for Thursday 2:00 PM</div>
                  </div>
                  <div className="p-2 rounded-lg bg-zinc-50 border border-zinc-100">
                    <div className="font-medium text-zinc-900">Leads CSV Loaded</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">Queue refreshed with 3 target accounts</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="h-4 w-[1px] bg-zinc-200" />

          {/* User Profile & Role Selector */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-lg hover:bg-zinc-100 transition-colors"
            >
              <div className="h-6 w-6 rounded-md bg-zinc-900 text-white flex items-center justify-center font-bold text-[10px] overflow-hidden">
                {repName.toLowerCase().includes('emil') ? (
                  <img
                    src="/images/emil-halili.gif"
                    alt={repName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  repName.charAt(0)
                )}
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-xs font-semibold text-zinc-900 leading-tight truncate max-w-[100px]">
                  {repName}
                </div>
                <div className="text-[10px] text-zinc-400 font-mono">
                  {role}
                </div>
              </div>
              <ChevronDown className="h-3 w-3 text-zinc-400" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-1 w-60 bg-white border border-zinc-200 rounded-xl shadow-xl p-2 z-50">
                <div className="px-2 py-1.5 border-b border-zinc-100 mb-1.5 flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-full overflow-hidden border border-zinc-200 bg-zinc-100 shrink-0">
                    <img
                      src="/images/emil-halili.gif"
                      alt={repName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-zinc-900 truncate">{repName}</div>
                    <div className="text-[11px] text-zinc-500 truncate">{email}</div>
                    <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-100 text-zinc-700 font-medium">
                      Role: {role}
                    </span>
                  </div>
                </div>

                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Switch Role (Testing)
                </div>
                {(
                  [
                    'Rep',
                    'Supervisor',
                    'Manager',
                    'Admin',
                    'Super Admin',
                  ] as UserRole[]
                ).map((r) => (
                  <button
                    key={r}
                    onClick={() => handleRoleSwitch(r)}
                    className="w-full flex items-center justify-between px-2.5 py-1 rounded-lg text-xs hover:bg-zinc-100 transition-colors text-left"
                  >
                    <span>
                      {r === 'Admin'
                        ? 'Client Admin'
                        : r === 'Super Admin'
                        ? 'Super Admin (Owner)'
                        : r}
                    </span>
                    {role === r && <Check className="h-3.5 w-3.5 text-zinc-900" />}
                  </button>
                ))}

                <div className="mt-1.5 pt-1.5 border-t border-zinc-100">
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Minimalist Command Palette (Cmd+K) Modal */}
      {searchOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-xs z-50 flex items-start justify-center pt-24 px-4"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl border border-zinc-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Input */}
            <div className="flex items-center gap-2.5 px-4 border-b border-zinc-200">
              <Search className="h-4 w-4 text-zinc-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tools, playbooks, workflows..."
                className="w-full py-3 text-xs bg-transparent text-zinc-900 focus:outline-none placeholder:text-zinc-400"
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 p-1 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {filteredCommands.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-400">
                  No matching tools found.
                </div>
              ) : (
                filteredCommands.map((cmd) => {
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.title}
                      onClick={() => {
                        setSearchOpen(false);
                        router.push(cmd.href);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs hover:bg-zinc-100 transition-colors text-left group"
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 text-zinc-500 group-hover:text-zinc-900" />
                        <span className="font-medium text-zinc-800 group-hover:text-zinc-950">
                          {cmd.title}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400 bg-zinc-50 px-2 py-0.5 rounded border border-zinc-200/60">
                        {cmd.category}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-zinc-100 bg-zinc-50/60 flex items-center justify-between text-[11px] text-zinc-400">
              <span>Navigation Shortcut</span>
              <span>ESC to close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
