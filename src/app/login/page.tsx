'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Lock,
  Mail,
  CheckCircle2,
  Eye,
  EyeOff,
  Send,
  KeyRound,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  X,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import {
  setStoredSession,
  UserRole,
  formatRepNameFromEmail,
  verifyUserPassword,
  changeUserPassword,
  getStoredPasswordMap,
} from '@/lib/session';

const KNOWN_TENANTS: Record<string, { name: string; code: string; defaultRep: string }> = {
  'appointmentlyy.com': { name: 'Appointmentlyy', code: 'APPOINTMENTLYY', defaultRep: 'Emil Halili' },
  'apexglobalbpo.ph': { name: 'Apex Global BPO', code: 'APEX-GLOBAL', defaultRep: 'Julian Vance' },
  'apexglobal.ph': { name: 'Apex Global BPO', code: 'APEX-GLOBAL', defaultRep: 'Julian Vance' },
  'shorepartners.ph': { name: 'ShorePartners BPO', code: 'SHORE-PARTNERS', defaultRep: 'Sarah Jenkins' },
  'cloudstaff.ph': { name: 'CloudStaff Outsourcing', code: 'CLOUD-STAFF', defaultRep: 'Marcus Vance' },
  'vanguard.ph': { name: 'Vanguard BPO Solutions', code: 'VANGUARD-PH', defaultRep: 'Paolo Reyes' },
  'taskforce.ph': { name: 'TaskForce Manila', code: 'TASKFORCE-MNL', defaultRep: 'Nicole Bautista' },
};

function resolveTenant(email: string) {
  const parts = email.trim().toLowerCase().split('@');
  if (parts.length < 2) {
    return { name: 'Appointmentlyy', code: 'APPOINTMENTLYY', defaultRep: 'Emil Halili' };
  }
  const domain = parts[1];
  if (KNOWN_TENANTS[domain]) {
    return KNOWN_TENANTS[domain];
  }
  const root = domain.split('.')[0];
  const formatted = root.charAt(0).toUpperCase() + root.slice(1);
  return {
    name: `${formatted} BPO`,
    code: `${root.toUpperCase()}-TENANT`,
    defaultRep: formatRepNameFromEmail(email),
  };
}

type AuthTab = 'password' | 'email-link' | 'change-password';

interface DispatchedEmailPreview {
  emailSubject: string;
  emailHtml: string;
  loginUrl: string;
  emailDelivered: boolean;
  deliveryWarning?: string;
  recipient: {
    email: string;
    repName: string;
    role: UserRole;
    workspaceName: string;
  };
}

function SdrLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<AuthTab>('password');
  const [email, setEmail] = useState('emil@appointmentlyy.com');
  const [password, setPassword] = useState('••••••••••••');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole>('Super Admin');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasCustomPwd, setHasCustomPwd] = useState(false);

  // Email Login / New User Onboarding state
  const [emailKind, setEmailKind] = useState<'invite' | 'login'>('invite');
  const [workspaceOverride, setWorkspaceOverride] = useState('Appointmentlyy');
  const [dispatchedPreview, setDispatchedPreview] = useState<DispatchedEmailPreview | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Change Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'email' || tabParam === 'invite') {
      setActiveTab('email-link');
    } else if (tabParam === 'password' || tabParam === 'change-password') {
      setActiveTab('change-password');
    }
  }, [searchParams]);

  useEffect(() => {
    const map = getStoredPasswordMap();
    const clean = email.trim().toLowerCase();
    setHasCustomPwd(Boolean(map[clean]));
    const resolved = resolveTenant(email);
    setWorkspaceOverride(resolved.name);
  }, [email, activeTab]);

  const clearAlerts = () => {
    setSuccessMsg(null);
    setErrorMsg(null);
  };

  const handlePasswordLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    clearAlerts();
    if (!email.trim()) {
      setErrorMsg('Please enter your work email.');
      return;
    }

    const check = verifyUserPassword(email, password);
    if (!check.valid) {
      setErrorMsg(check.error || 'Invalid password.');
      return;
    }

    setIsSubmitting(true);
    const tenant = resolveTenant(email);
    const repName = formatRepNameFromEmail(email) || tenant.defaultRep;

    setStoredSession({
      role,
      tenantName: tenant.name,
      tenantCode: tenant.code,
      email: email.trim(),
      repName,
      isAuthenticated: true,
    });

    setSuccessMsg(`Authenticated as ${repName}. Entering ${tenant.name}...`);

    setTimeout(() => {
      if (role === 'Super Admin' || role === 'Admin') {
        router.push('/admin');
      } else {
        router.push('/cockpit');
      }
    }, 350);
  };

  const handleSendLoginEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    if (!email.trim()) {
      setErrorMsg('Please enter a recipient work email.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          kind: emailKind,
          role,
          workspaceName: workspaceOverride.trim() || resolveTenant(email).name,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Could not generate login email.');
        setIsSubmitting(false);
        return;
      }

      const preview: DispatchedEmailPreview = {
        emailSubject: data.emailSubject,
        emailHtml: data.emailHtml,
        loginUrl: data.loginUrl,
        emailDelivered: Boolean(data.emailDelivered),
        deliveryWarning: data.deliveryWarning,
        recipient: data.recipient,
      };
      setDispatchedPreview(preview);
      setShowEmailModal(true);
      setSuccessMsg(
        data.emailDelivered
          ? `Login email dispatched to ${email.trim()}. Opening email preview...`
          : `Login email generated for ${email.trim()}. Opening interactive email preview...`
      );
    } catch {
      setErrorMsg('Network error while generating login email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();

    const result = changeUserPassword(email, currentPassword, newPassword, confirmPassword);
    if (!result.ok) {
      setErrorMsg(result.error || 'Could not update password.');
      return;
    }

    setPassword(newPassword);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setHasCustomPwd(true);
    setSuccessMsg(
      `Password updated for ${email.trim()}. You can now sign in with your new password.`
    );
    setTimeout(() => {
      setActiveTab('password');
    }, 900);
  };

  const setQuickProfile = (demoEmail: string, demoRole: UserRole) => {
    clearAlerts();
    setEmail(demoEmail);
    setRole(demoRole);
    const map = getStoredPasswordMap();
    const custom = map[demoEmail.toLowerCase()];
    setPassword(custom ? custom.password : '••••••••••••');
  };

  const handleCopyLoginUrl = () => {
    if (!dispatchedPreview?.loginUrl) return;
    navigator.clipboard.writeText(dispatchedPreview.loginUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-zinc-900 flex flex-col justify-between font-sans px-4 selection:bg-zinc-900 selection:text-white">
      {/* Ultra-Minimalist Brand Header with Official Appointmentlyy Logo */}
      <header className="w-full max-w-md mx-auto pt-9 pb-3 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center group">
          <img
            src="/appointmentlyy-logo.png"
            alt="Appointmentlyy Official Logo"
            className="h-8 sm:h-9 w-auto object-contain transition-opacity group-hover:opacity-90"
          />
        </Link>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-100 border border-zinc-200/80 font-mono text-[10px] text-zinc-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            SDR OS
          </span>
        </div>
      </header>

      {/* Main Minimalist Card */}
      <main className="w-full max-w-md mx-auto my-auto py-6">
        <div className="bg-white rounded-2xl p-7 sm:p-8 border border-zinc-200/90 shadow-xs">
          {/* Card Title */}
          <div className="mb-6">
            <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 mb-1">
              {activeTab === 'password'
                ? 'WORKSPACE_AUTH'
                : activeTab === 'email-link'
                ? 'TECHY_EMAIL_DISPATCH'
                : 'CREDENTIAL_SECURITY'}
            </div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-950">
              {activeTab === 'password' && 'Sign in to Appointmentlyy SDR'}
              {activeTab === 'email-link' && 'Send One-Click Login Email'}
              {activeTab === 'change-password' && 'Change Account Password'}
            </h1>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              {activeTab === 'password' &&
                'Enter your credentials to launch AI Boris Calling Cockpit & Operations.'}
              {activeTab === 'email-link' &&
                'Send new or existing users a minimalist techy login email with an instant sign-in button.'}
              {activeTab === 'change-password' &&
                'Update the password for your Appointmentlyy SDR account.'}
            </p>
          </div>

          {/* 3-Mode Minimalist Switcher */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-100/90 rounded-xl text-[11px] font-medium mb-6">
            <button
              type="button"
              onClick={() => {
                clearAlerts();
                setActiveTab('password');
              }}
              className={`py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'password'
                  ? 'bg-white text-zinc-950 font-semibold shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <Lock className="w-3 h-3" />
              <span>Password</span>
            </button>

            <button
              type="button"
              onClick={() => {
                clearAlerts();
                setActiveTab('email-link');
              }}
              className={`py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'email-link'
                  ? 'bg-white text-zinc-950 font-semibold shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <Mail className="w-3 h-3" />
              <span>Login Email</span>
            </button>

            <button
              type="button"
              onClick={() => {
                clearAlerts();
                setActiveTab('change-password');
              }}
              className={`py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'change-password'
                  ? 'bg-white text-zinc-950 font-semibold shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <KeyRound className="w-3 h-3" />
              <span>Password Reset</span>
            </button>
          </div>

          {/* TAB 1: PASSWORD SIGN IN */}
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              {/* Quick Demo Profiles */}
              <div className="p-2 bg-zinc-50/80 border border-zinc-200/70 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-400 px-1">
                  <span>Quick Profiles</span>
                  <span>1-click</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQuickProfile('emil@appointmentlyy.com', 'Super Admin')}
                    className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors border cursor-pointer ${
                      email.toLowerCase().includes('emil')
                        ? 'bg-zinc-950 text-white border-zinc-950 font-medium'
                        : 'bg-white text-zinc-700 border-zinc-200/80 hover:bg-zinc-100'
                    }`}
                  >
                    <div className="font-semibold truncate">Emil Halili</div>
                    <div className="text-[10px] opacity-70 font-mono">Super Admin</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setQuickProfile('julian.vance@apexglobalbpo.ph', 'Manager')}
                    className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors border cursor-pointer ${
                      email.toLowerCase().includes('julian')
                        ? 'bg-zinc-950 text-white border-zinc-950 font-medium'
                        : 'bg-white text-zinc-700 border-zinc-200/80 hover:bg-zinc-100'
                    }`}
                  >
                    <div className="font-semibold truncate">Julian Vance</div>
                    <div className="text-[10px] opacity-70 font-mono">Apex Global BPO</div>
                  </button>
                </div>
              </div>

              {/* Work Email */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Work Email
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-950 transition-colors"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-semibold text-zinc-700">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      clearAlerts();
                      setActiveTab('change-password');
                    }}
                    className="text-[11px] text-zinc-500 hover:text-zinc-950 underline underline-offset-2 cursor-pointer"
                  >
                    Change password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-9 pr-9 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-950 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 p-0.5 cursor-pointer"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                {hasCustomPwd && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-600 font-mono">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Custom password active for this account</span>
                  </div>
                )}
              </div>

              {/* Role Clearance */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Workspace Clearance
                </label>
                <div className="grid grid-cols-4 gap-1 p-1 bg-zinc-100 rounded-xl text-[11px] font-medium">
                  {(['Rep', 'Supervisor', 'Manager', 'Super Admin'] as UserRole[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                        role === r
                          ? 'bg-white text-zinc-950 font-semibold shadow-2xs'
                          : 'text-zinc-500 hover:text-zinc-900'
                      }`}
                    >
                      {r === 'Super Admin' ? 'Admin' : r}
                    </button>
                  ))}
                </div>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-1 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* TAB 2: SEND TECHY LOGIN EMAIL (NEW USER INVITE / MAGIC LINK) */}
          {activeTab === 'email-link' && (
            <form onSubmit={handleSendLoginEmail} className="space-y-4">
              {/* Template Mode */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Email Template Type
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-100 rounded-xl text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setEmailKind('invite')}
                    className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                      emailKind === 'invite'
                        ? 'bg-white text-zinc-950 font-semibold shadow-2xs'
                        : 'text-zinc-500 hover:text-zinc-900'
                    }`}
                  >
                    New User Welcome Invite
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmailKind('login')}
                    className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                      emailKind === 'login'
                        ? 'bg-white text-zinc-950 font-semibold shadow-2xs'
                        : 'text-zinc-500 hover:text-zinc-900'
                    }`}
                  >
                    One-Click Magic Login
                  </button>
                </div>
              </div>

              {/* Recipient Email */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Recipient Work Email
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="new.user@clientcompany.com"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-950 transition-colors"
                  />
                </div>
              </div>

              {/* Workspace & Role */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                    Workspace Name
                  </label>
                  <input
                    type="text"
                    value={workspaceOverride}
                    onChange={(e) => setWorkspaceOverride(e.target.value)}
                    placeholder="Appointmentlyy"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                    Assigned Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full px-2.5 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-950"
                  >
                    <option value="Super Admin">Super Admin</option>
                    <option value="Admin">Client Admin</option>
                    <option value="Manager">Manager</option>
                    <option value="Supervisor">Supervisor</option>
                    <option value="Rep">SDR Rep</option>
                  </select>
                </div>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Dispatching Login Email...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Techy Login Email & Open Preview</span>
                  </>
                )}
              </button>

              {dispatchedPreview && (
                <button
                  type="button"
                  onClick={() => setShowEmailModal(true)}
                  className="w-full py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200/80 text-zinc-800 font-medium text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-zinc-600" />
                  <span>View Dispatched Techy Email Template</span>
                </button>
              )}
            </form>
          )}

          {/* TAB 3: CHANGE PASSWORD */}
          {activeTab === 'change-password' && (
            <form onSubmit={handleChangePassword} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Account Email
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-950"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Current Password{' '}
                  <span className="text-zinc-400 font-normal">(optional for initial setup)</span>
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Current password"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-950"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  New Password <span className="text-zinc-400 font-normal">(min. 8 characters)</span>
                </label>
                <div className="relative">
                  <KeyRound className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new strong password"
                    className="w-full pl-9 pr-9 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-950"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 p-0.5 cursor-pointer"
                  >
                    {showNewPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Confirm New Password
                </label>
                <div className="relative">
                  <KeyRound className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-950"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Update Password</span>
              </button>
            </form>
          )}
        </div>
      </main>

      {/* Minimalist Techy Footer */}
      <footer className="w-full max-w-md mx-auto py-6 text-center font-mono text-[10px] tracking-wider text-zinc-400">
        © 2026 APPOINTMENTLYY AI · ULTRA-MINIMALIST OUTBOUND SYSTEMS
      </footer>

      {/* Interactive Techy Login Email Preview Modal */}
      {showEmailModal && dispatchedPreview && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => setShowEmailModal(false)}
        >
          <div
            className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Email Client Header */}
            <div className="px-5 py-3.5 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {dispatchedPreview.emailDelivered ? 'RESEND_DISPATCHED' : 'LIVE_EMAIL_TEMPLATE'}
                </span>
                <div className="text-xs text-zinc-300 font-medium truncate">
                  {dispatchedPreview.emailSubject}
                </div>
              </div>
              <button
                onClick={() => setShowEmailModal(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Metadata Bar */}
            <div className="px-5 py-2.5 bg-zinc-900/60 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400 font-mono">
              <div>
                <span className="text-zinc-500">To:</span>{' '}
                <span className="text-zinc-200">{dispatchedPreview.recipient.email}</span> ·{' '}
                <span className="text-zinc-500">Role:</span>{' '}
                <span className="text-emerald-400">{dispatchedPreview.recipient.role}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLoginUrl}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] transition cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Copied Link</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Magic Link</span>
                    </>
                  )}
                </button>
                <a
                  href={dispatchedPreview.loginUrl}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-sans font-bold text-[11px] transition"
                >
                  <span>Click Login Button Now</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Rendered HTML Email Body */}
            <div className="flex-1 overflow-y-auto bg-[#09090b] p-2 sm:p-4">
              <iframe
                title="Appointmentlyy Techy Login Email Preview"
                srcDoc={dispatchedPreview.emailHtml}
                className="w-full h-[500px] border-0 rounded-xl bg-[#09090b]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SdrLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center text-xs text-zinc-400 font-mono">
          LOADING_LOGIN...
        </div>
      }
    >
      <SdrLoginContent />
    </Suspense>
  );
}
