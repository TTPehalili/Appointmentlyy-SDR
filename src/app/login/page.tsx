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
  ChevronDown,
} from 'lucide-react';
import {
  setStoredSession,
  UserRole,
  formatRepNameFromEmail,
  verifyUserPassword,
  changeUserPassword,
  getStoredPasswordMap,
} from '@/lib/session';
import { Badge, Button, Dialog, IconButton, buttonClasses } from '@/components/ui';
import { DEMO_LOGIN } from '@/lib/authClient';
import { claimTenantStorage } from '@/lib/tenantStorage';

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
        router.push('/dialer');
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

  const inputClass =
    'focus-ring w-full h-10 rounded-sm border border-line-strong bg-surface text-body text-fg placeholder:text-fg-disabled focus:outline-none transition-colors';
  const labelClass = 'block mb-1.5 text-small font-medium text-fg';
  const iconInInput = 'w-4 h-4 text-fg-tertiary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none';
  const segTrack = 'grid gap-0.5 p-0.5 rounded-md border border-line bg-subtle';
  const segBtn = (active: boolean) =>
    `focus-ring h-8 px-2 rounded-[6px] text-small font-medium transition-colors duration-150 flex items-center justify-center gap-1.5 cursor-pointer ${
      active ? 'bg-surface text-fg shadow-xs' : 'text-fg-secondary hover:text-fg'
    }`;

  const alerts = (
    <>
      {errorMsg && (
        <div role="alert" className="px-3 py-2.5 rounded-md bg-danger-bg border border-danger-fg/30 text-danger-fg text-small flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div role="status" className="px-3 py-2.5 rounded-md bg-success-bg border border-success-500/30 text-success-fg text-small flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />
          <span>{successMsg}</span>
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-app text-fg flex flex-col justify-between font-sans px-4">
      {/* Brand header with the official Appointmentlyy logo */}
      <header className="w-full max-w-md mx-auto pt-10 pb-3 flex items-center justify-center">
        <Link href="/" className="focus-ring inline-flex items-center rounded-sm">
          <img
            src="/appointmentlyy-logo.png"
            alt="Appointmentlyy"
            className="h-8 w-auto object-contain"
          />
        </Link>
      </header>

      {/* Main card */}
      <main className="w-full max-w-md mx-auto my-auto py-6">
        <div className="bg-surface rounded-xl p-8 border border-line shadow-xs">
          {/* Card Title */}
          <div className="mb-6">
            <h1 className="text-h1 text-fg">
              {activeTab === 'password' && 'Sign in'}
              {activeTab === 'email-link' && 'Send a login email'}
              {activeTab === 'change-password' && 'Change password'}
            </h1>
            <p className="text-body text-fg-secondary mt-1">
              {activeTab === 'password' &&
                'Welcome back. Sign in to your Appointmentlyy workspace.'}
              {activeTab === 'email-link' &&
                'Send a new or existing user an email with a one-click sign-in button.'}
              {activeTab === 'change-password' &&
                'Update the password for your Appointmentlyy SDR account.'}
            </p>
          </div>

          {/* Mode switcher */}
          <div className={`${segTrack} grid-cols-3 mb-6`}>
            <button
              type="button"
              onClick={() => {
                clearAlerts();
                setActiveTab('password');
              }}
              aria-pressed={activeTab === 'password'}
              className={segBtn(activeTab === 'password')}
            >
              <Lock className="w-3.5 h-3.5" aria-hidden />
              <span>Password</span>
            </button>

            <button
              type="button"
              onClick={() => {
                clearAlerts();
                setActiveTab('email-link');
              }}
              aria-pressed={activeTab === 'email-link'}
              className={segBtn(activeTab === 'email-link')}
            >
              <Mail className="w-3.5 h-3.5" aria-hidden />
              <span>Login email</span>
            </button>

            <button
              type="button"
              onClick={() => {
                clearAlerts();
                setActiveTab('change-password');
              }}
              aria-pressed={activeTab === 'change-password'}
              className={segBtn(activeTab === 'change-password')}
            >
              <KeyRound className="w-3.5 h-3.5" aria-hidden />
              <span>Reset</span>
            </button>
          </div>

          {/* TAB 1: PASSWORD SIGN IN */}
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              {/* Quick Demo Profiles */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-small text-fg-tertiary">
                  <span>Quick profiles</span>
                  <span className="text-caption">One click</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickProfile('emil@appointmentlyy.com', 'Super Admin')}
                    aria-pressed={email.toLowerCase().includes('emil')}
                    className={`focus-ring text-left px-3 py-2 rounded-md border transition-colors duration-150 cursor-pointer ${
                      email.toLowerCase().includes('emil')
                        ? 'bg-selected border-brand-600/30'
                        : 'bg-surface border-line hover:bg-subtle'
                    }`}
                  >
                    <div className="text-body-strong text-fg truncate">Emil Halili</div>
                    <div className="text-caption text-fg-tertiary">Super Admin</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setQuickProfile('julian.vance@apexglobalbpo.ph', 'Manager')}
                    aria-pressed={email.toLowerCase().includes('julian')}
                    className={`focus-ring text-left px-3 py-2 rounded-md border transition-colors duration-150 cursor-pointer ${
                      email.toLowerCase().includes('julian')
                        ? 'bg-selected border-brand-600/30'
                        : 'bg-surface border-line hover:bg-subtle'
                    }`}
                  >
                    <div className="text-body-strong text-fg truncate">Julian Vance</div>
                    <div className="text-caption text-fg-tertiary">Apex Global BPO</div>
                  </button>
                </div>
              </div>

              {/* Work Email */}
              <div>
                <label htmlFor="login-email" className={labelClass}>
                  Work email
                </label>
                <div className="relative">
                  <Mail className={iconInInput} aria-hidden />
                  <input
                    id="login-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className={`${inputClass} pl-9 pr-3`}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="login-password" className="block text-small font-medium text-fg">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      clearAlerts();
                      setActiveTab('change-password');
                    }}
                    className="focus-ring rounded-sm text-small text-fg-secondary hover:text-fg underline underline-offset-2 cursor-pointer"
                  >
                    Change password
                  </button>
                </div>
                <div className="relative">
                  <Lock className={iconInInput} aria-hidden />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className={`${inputClass} pl-9 pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-fg-tertiary hover:text-fg cursor-pointer"
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {hasCustomPwd && (
                  <div className="mt-1.5 flex items-center gap-1 text-small text-success-fg">
                    <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
                    <span>Custom password active for this account</span>
                  </div>
                )}
              </div>

              {/* Role Clearance */}
              <div>
                <span className={labelClass}>
                  Sign in as
                </span>
                <div className={`${segTrack} grid-cols-4`}>
                  {(['Rep', 'Supervisor', 'Manager', 'Super Admin'] as UserRole[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      aria-pressed={role === r}
                      className={segBtn(role === r)}
                    >
                      {r === 'Super Admin' ? 'Admin' : r}
                    </button>
                  ))}
                </div>
              </div>

              {alerts}

              <Button
                type="submit"
                variant="brand"
                size="lg"
                className="w-full mt-1"
                loading={isSubmitting}
              >
                {isSubmitting ? 'Signing in...' : 'Sign in'}
                {!isSubmitting && <ArrowRight aria-hidden />}
              </Button>
            </form>
          )}

          {/* TAB 2: SEND LOGIN EMAIL (NEW USER INVITE / MAGIC LINK) */}
          {activeTab === 'email-link' && (
            <form onSubmit={handleSendLoginEmail} className="space-y-4">
              {/* Template Mode */}
              <div>
                <span className={labelClass}>
                  Email type
                </span>
                <div className={`${segTrack} grid-cols-2`}>
                  <button
                    type="button"
                    onClick={() => setEmailKind('invite')}
                    aria-pressed={emailKind === 'invite'}
                    className={segBtn(emailKind === 'invite')}
                  >
                    New user invite
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmailKind('login')}
                    aria-pressed={emailKind === 'login'}
                    className={segBtn(emailKind === 'login')}
                  >
                    One-click login
                  </button>
                </div>
              </div>

              {/* Recipient Email */}
              <div>
                <label htmlFor="link-email" className={labelClass}>
                  Recipient work email
                </label>
                <div className="relative">
                  <Mail className={iconInInput} aria-hidden />
                  <input
                    id="link-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="new.user@clientcompany.com"
                    className={`${inputClass} pl-9 pr-3`}
                  />
                </div>
              </div>

              {/* Workspace & Role */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="link-workspace" className={labelClass}>
                    Workspace name
                  </label>
                  <input
                    id="link-workspace"
                    type="text"
                    value={workspaceOverride}
                    onChange={(e) => setWorkspaceOverride(e.target.value)}
                    placeholder="Appointmentlyy"
                    className={`${inputClass} px-3`}
                  />
                </div>
                <div>
                  <label htmlFor="link-role" className={labelClass}>
                    Role
                  </label>
                  <div className="relative">
                    <select
                      id="link-role"
                      value={role}
                      onChange={(e) => setRole(e.target.value as UserRole)}
                      className={`${inputClass} appearance-none pl-3 pr-9`}
                    >
                      <option value="Super Admin">Super Admin</option>
                      <option value="Admin">Client Admin</option>
                      <option value="Manager">Manager</option>
                      <option value="Supervisor">Supervisor</option>
                      <option value="Rep">SDR Rep</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-tertiary" aria-hidden />
                  </div>
                </div>
              </div>

              {alerts}

              <Button
                type="submit"
                variant="brand"
                size="lg"
                className="w-full"
                loading={isSubmitting}
                icon={isSubmitting ? undefined : <Send aria-hidden />}
              >
                {isSubmitting ? 'Sending login email...' : 'Send login email and preview'}
              </Button>

              {dispatchedPreview && (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => setShowEmailModal(true)}
                  icon={<Eye className="text-fg-secondary" aria-hidden />}
                >
                  View sent email
                </Button>
              )}
            </form>
          )}

          {/* TAB 3: CHANGE PASSWORD */}
          {activeTab === 'change-password' && (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label htmlFor="cp-email" className={labelClass}>
                  Account email
                </label>
                <div className="relative">
                  <Mail className={iconInInput} aria-hidden />
                  <input
                    id="cp-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className={`${inputClass} pl-9 pr-3`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="cp-current" className={labelClass}>
                  Current password{' '}
                  <span className="text-fg-tertiary font-normal">(optional for first setup)</span>
                </label>
                <div className="relative">
                  <Lock className={iconInInput} aria-hidden />
                  <input
                    id="cp-current"
                    type={showNewPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Current password"
                    className={`${inputClass} pl-9 pr-3`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="cp-new" className={labelClass}>
                  New password <span className="text-fg-tertiary font-normal">(at least 8 characters)</span>
                </label>
                <div className="relative">
                  <KeyRound className={iconInInput} aria-hidden />
                  <input
                    id="cp-new"
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new strong password"
                    className={`${inputClass} pl-9 pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-fg-tertiary hover:text-fg cursor-pointer"
                    aria-label={showNewPassword ? 'Hide passwords' : 'Show passwords'}
                  >
                    {showNewPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="cp-confirm" className={labelClass}>
                  Confirm new password
                </label>
                <div className="relative">
                  <KeyRound className={iconInInput} aria-hidden />
                  <input
                    id="cp-confirm"
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className={`${inputClass} pl-9 pr-3`}
                  />
                </div>
              </div>

              {alerts}

              <Button
                type="submit"
                variant="brand"
                size="lg"
                className="w-full"
                icon={<CheckCircle2 aria-hidden />}
              >
                Update password
              </Button>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-md mx-auto py-6 text-center text-caption text-fg-tertiary">
        © 2026 Appointmentlyy
      </footer>

      {/* Login email preview modal */}
      <Dialog
        open={showEmailModal && !!dispatchedPreview}
        onClose={() => setShowEmailModal(false)}
        title="Login email preview"
        size="lg"
        className="overflow-hidden"
        bare
      >
        {dispatchedPreview && (
          <div className="w-full overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Badge tone={dispatchedPreview.emailDelivered ? 'success' : 'neutral'}>
                  {dispatchedPreview.emailDelivered ? 'Sent' : 'Preview'}
                </Badge>
                <div className="text-body-strong text-fg truncate">
                  {dispatchedPreview.emailSubject}
                </div>
              </div>
              <IconButton label="Close" size="sm" onClick={() => setShowEmailModal(false)}>
                <X />
              </IconButton>
            </div>

            {/* Metadata Bar */}
            <div className="px-5 py-2.5 bg-subtle border-b border-line flex flex-wrap items-center justify-between gap-2 text-small text-fg-secondary">
              <div>
                <span className="text-fg-tertiary">To</span>{' '}
                <span className="font-mono text-fg">{dispatchedPreview.recipient.email}</span>
                <span className="text-fg-disabled"> · </span>
                <span className="text-fg-tertiary">Role</span>{' '}
                <span className="text-fg">{dispatchedPreview.recipient.role}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleCopyLoginUrl}
                  icon={copiedLink ? <Check className="text-success-fg" /> : <Copy className="text-fg-secondary" />}
                >
                  {copiedLink ? 'Copied link' : 'Copy login link'}
                </Button>
                <a
                  href={dispatchedPreview.loginUrl}
                  className={buttonClasses('primary', 'sm')}
                >
                  <span>Open login link</span>
                  <ExternalLink aria-hidden />
                </a>
              </div>
            </div>

            {/* Rendered HTML Email Body */}
            <div className="flex-1 overflow-y-auto bg-subtle p-2 sm:p-4">
              <iframe
                title="Appointmentlyy Techy Login Email Preview"
                srcDoc={dispatchedPreview.emailHtml}
                className="w-full h-[500px] border border-line rounded-lg bg-surface"
              />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

/**
 * Real sign-in. Members sign in with a password or an emailed link; "Forgot password?" emails a
 * reset link. Role and workspace come from their membership on the server, never from this page.
 */
type RealMode = 'password' | 'link' | 'forgot';

function RealLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<RealMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ kind: 'link' | 'reset'; to: string; demoUrl?: string } | null>(null);

  const go = (m: RealMode) => {
    setMode(m);
    setError(null);
  };

  const validEmail = () => {
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
      setError('Enter your work email.');
      return null;
    }
    return clean;
  };

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.success, data };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const clean = validEmail();
    if (!clean) return;
    if (mode === 'password' && !password) {
      setError('Enter your password.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'password') {
        const { ok, data } = await post('/api/auth/password/login', { email: clean, password });
        if (!ok) {
          setError(data.error || 'Could not sign in.');
          return;
        }
        const user = data.identity;
        claimTenantStorage(user.email, user.tenantCode);
        setStoredSession({
          email: user.email,
          role: user.role,
          tenantName: user.tenantName,
          tenantCode: user.tenantCode,
          repName: user.repName,
          isAuthenticated: true,
        });
        const next = searchParams.get('next');
        // Only same-site paths (blocks "//evil.com", "/\evil.com" and absolute URLs).
        let safeNext: string | null = null;
        if (next) {
          const target = new URL(next, window.location.origin);
          if (target.origin === window.location.origin) safeNext = target.pathname + target.search + target.hash;
        }
        router.replace(safeNext ?? (user.role === 'Super Admin' || user.role === 'Admin' ? '/admin' : '/dialer'));
        return;
      }
      const { ok, data } = await post(mode === 'link' ? '/api/auth/send-link' : '/api/auth/password/forgot', { email: clean });
      if (!ok) {
        setError(data.error || 'Something went wrong. Try again.');
        return;
      }
      setSent({ kind: mode === 'link' ? 'link' : 'reset', to: clean, demoUrl: data.loginUrl || data.resetUrl });
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'focus-ring w-full h-10 rounded-sm border border-line-strong bg-surface text-body text-fg placeholder:text-fg-disabled focus:outline-none transition-colors';
  const segBtn = (active: boolean) =>
    `focus-ring h-8 px-2 rounded-[6px] text-small font-medium transition-colors duration-150 flex items-center justify-center gap-1.5 cursor-pointer ${
      active ? 'bg-surface text-fg shadow-xs' : 'text-fg-secondary hover:text-fg'
    }`;

  return (
    <div className="min-h-screen bg-app text-fg flex flex-col justify-between font-sans px-4">
      <header className="w-full max-w-md mx-auto pt-10 pb-3 flex items-center justify-center">
        <img src="/appointmentlyy-logo.png" alt="Appointmentlyy" className="h-8 w-auto object-contain" />
      </header>

      <main className="w-full max-w-md mx-auto my-auto py-6">
        <div className="bg-surface rounded-xl p-8 border border-line shadow-xs">
          {sent ? (
            <div className="space-y-4 text-center" role="status">
              <div className="size-12 rounded-full bg-success-bg text-success-fg flex items-center justify-center mx-auto">
                {sent.kind === 'reset' ? <KeyRound className="w-6 h-6" aria-hidden /> : <Mail className="w-6 h-6" aria-hidden />}
              </div>
              <div>
                <h1 className="text-h2 text-fg">Check your inbox</h1>
                <p className="text-body text-fg-secondary mt-1">
                  {sent.kind === 'reset' ? (
                    <>
                      If <span className="font-medium text-fg">{sent.to}</span> has an Appointmentlyy account, we sent a link to choose a new
                      password. It expires in 30 minutes.
                    </>
                  ) : (
                    <>
                      If <span className="font-medium text-fg">{sent.to}</span> has access to an Appointmentlyy workspace, a sign-in link is on
                      its way. It expires in 15 minutes.
                    </>
                  )}
                </p>
              </div>
              {sent.demoUrl && (
                <a href={sent.demoUrl} className={buttonClasses('secondary', 'md', 'w-full')}>
                  Open the link (demo build)
                </a>
              )}
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setSent(null);
                  go('password');
                }}
              >
                Back to sign in
              </Button>
              <p className="text-small text-fg-tertiary">No email after a few minutes? Check spam, or ask your workspace admin.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div>
                <h1 className="text-h1 text-fg">{mode === 'forgot' ? 'Reset your password' : 'Sign in'}</h1>
                <p className="text-body text-fg-secondary mt-1">
                  {mode === 'forgot'
                    ? 'Enter your work email and we’ll send you a link to choose a new password.'
                    : 'Welcome back. Sign in to your Appointmentlyy workspace.'}
                </p>
              </div>

              {mode !== 'forgot' && (
                <div className="grid grid-cols-2 gap-0.5 p-0.5 rounded-md border border-line bg-subtle" role="group" aria-label="Sign-in method">
                  <button type="button" onClick={() => go('password')} aria-pressed={mode === 'password'} className={segBtn(mode === 'password')}>
                    <Lock className="w-3.5 h-3.5" aria-hidden />
                    Password
                  </button>
                  <button type="button" onClick={() => go('link')} aria-pressed={mode === 'link'} className={segBtn(mode === 'link')}>
                    <Mail className="w-3.5 h-3.5" aria-hidden />
                    Email me a link
                  </button>
                </div>
              )}

              <div>
                <label htmlFor="signin-email" className="block mb-1.5 text-small font-medium text-fg">
                  Work email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-fg-tertiary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
                  <input
                    id="signin-email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className={`${inputClass} pl-9 pr-3`}
                  />
                </div>
              </div>

              {mode === 'password' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="signin-password" className="block text-small font-medium text-fg">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => go('forgot')}
                      className="focus-ring rounded-sm text-small text-fg-secondary hover:text-fg underline underline-offset-2 cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-fg-tertiary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
                    <input
                      id="signin-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`${inputClass} pl-9 pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-fg-tertiary hover:text-fg cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div role="alert" className="px-3 py-2.5 rounded-md bg-danger-bg border border-danger-fg/30 text-danger-fg text-small flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" variant="brand" size="lg" className="w-full" loading={busy}>
                {mode === 'password' ? 'Sign in' : mode === 'link' ? 'Email me a sign-in link' : 'Send reset link'}
                {!busy && <ArrowRight aria-hidden />}
              </Button>

              {mode === 'forgot' ? (
                <button
                  type="button"
                  onClick={() => go('password')}
                  className="focus-ring block mx-auto rounded-sm text-small text-fg-secondary hover:text-fg underline underline-offset-2"
                >
                  Back to sign in
                </button>
              ) : (
                <p className="text-small text-fg-tertiary text-center">
                  {mode === 'password'
                    ? 'No password yet? Use “Email me a link”, then set one in Settings.'
                    : 'New here? Your workspace admin sends you an invite by email.'}
                </p>
              )}
            </form>
          )}
        </div>
      </main>

      <footer className="w-full max-w-md mx-auto py-6 text-center text-caption text-fg-tertiary">© 2026 Appointmentlyy</footer>
    </div>
  );
}

export default function SdrLoginPage() {
  if (!DEMO_LOGIN) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-app" />}>
        <RealLogin />
      </Suspense>
    );
  }
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-app flex items-center justify-center text-body text-fg-tertiary">
          Loading...
        </div>
      }
    >
      <SdrLoginContent />
    </Suspense>
  );
}
