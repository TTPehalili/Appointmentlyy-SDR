'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { DEFAULT_BRAND_500, checkBrandColor, deriveBrandTokens, normalizeHex } from '@/lib/theme';
import {
  Globe,
  ShieldCheck,
  Lock,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Server,
  Building2,
  Palette,
  ArrowRight,
  Eye,
  X,
  Phone,
} from 'lucide-react';
import { useSession } from '@/lib/session';
import { DEMO_LOGIN, apiJson, refreshServerIdentity } from '@/lib/authClient';
import {
  TenantCustomDomainConfig,
  PRIMARY_PLATFORM_HOST,
  BRANDED_CNAME_TARGET,
  VERCEL_CNAME_TARGET,
  getAllCustomDomainConfigs,
  getTenantCustomDomainConfig,
  upsertTenantCustomDomainConfig,
  getSimulatedCustomHost,
  setSimulatedCustomHost,
  subscribeToCustomDomains,
  splitCustomDomainParts,
} from '@/lib/customDomainStore';
import { Badge, Button, IconButton, PageHeader, SegmentedControl, StatusDot } from '@/components/ui';

const SUBDOMAIN_PRESETS = ['app', 'sdr', 'portal', 'dialer', 'outbound'];

/** Numbered step header for the setup cards (presentation only). */
function StepHeader({ n, title, description, right }: { n: number; title: string; description?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <span className="mt-0.5 size-6 shrink-0 rounded-full border border-line-strong text-caption tabular-nums text-fg flex items-center justify-center">
          {n}
        </span>
        <div className="min-w-0">
          <h2 className="text-h3 text-fg">{title}</h2>
          {description && <p className="text-small text-fg-secondary mt-0.5">{description}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export default function CustomDomainsManager() {
  const { session, role, tenantName, updateSession } = useSession();
  const isSuperAdmin = role === 'Super Admin';
  const canManageDomain =
    role === 'Super Admin' || role === 'Admin' || role === 'Manager';

  const [allConfigs, setAllConfigs] = useState<
    Record<string, TenantCustomDomainConfig>
  >(() => getAllCustomDomainConfigs());

  const [selectedTenantCode, setSelectedTenantCode] = useState<string>(
    () => (session.tenantCode || 'APPOINTMENTLYY').toUpperCase()
  );

  // The configured workspace follows the shell's workspace switcher (redesign Phase 3:
  // no per-page tenant selectors). Super Admin switches workspace to edit a client's domain.
  useEffect(() => {
    setSelectedTenantCode((session.tenantCode || 'APPOINTMENTLYY').toUpperCase());
  }, [session.tenantCode]);

  const activeConfig = useMemo(
    () =>
      allConfigs[selectedTenantCode] ||
      getTenantCustomDomainConfig(selectedTenantCode, tenantName),
    [allConfigs, selectedTenantCode, tenantName]
  );

  const [domainInput, setDomainInput] = useState<string>(
    () => activeConfig.customDomain || 'app.customerwebsiteurl.com'
  );
  const [displayNameInput, setDisplayNameInput] = useState<string>(
    () => activeConfig.branding.workspaceDisplayName
  );
  const [initialsInput, setInitialsInput] = useState<string>(
    () => activeConfig.branding.logoInitials
  );
  const [supportEmailInput, setSupportEmailInput] = useState<string>(
    () => activeConfig.branding.supportEmail
  );
  const [hidePoweredBy, setHidePoweredBy] = useState<boolean>(
    () => activeConfig.branding.hidePoweredByBadge
  );
  // White-label brand colour (Phase 6). Empty = Appointmentlyy crimson.
  const [brandColorInput, setBrandColorInput] = useState<string>(
    () => activeConfig.branding.brandColor ?? ''
  );
  const brandHex = normalizeHex(brandColorInput);
  const brandCheck = brandColorInput.trim() ? checkBrandColor(brandColorInput) : null;
  // Role tokens (--action-brand etc.) resolve from --brand-* on :root, so a scoped preview
  // must override them too; on the real app the tokens are set on <html> itself.
  const previewVars = useMemo(() => {
    const t = deriveBrandTokens(brandHex ?? DEFAULT_BRAND_500);
    return {
      ...t,
      '--action-brand': t['--brand-600'],
      '--action-brand-hover': t['--brand-700'],
      '--action-brand-fg': t['--brand-contrast'],
      '--brand-text': t['--brand-600'],
      '--bg-selected': t['--brand-50'],
    } as unknown as React.CSSProperties;
  }, [brandHex]);

  // Real builds: the brand lives on the server (Admin › Branding), so every member of the
  // workspace gets it on any device. Load it into the form once.
  const [brandSaving, setBrandSaving] = useState(false);
  const [canEditBrand, setCanEditBrand] = useState(DEMO_LOGIN);
  // Lead Finder pull progress style (workspace-wide, saved with the brand). Unset = playful.
  const [leadFinderAnimation, setLeadFinderAnimation] = useState<'playful' | 'professional'>('playful');
  useEffect(() => {
    if (DEMO_LOGIN) return;
    let alive = true;
    apiJson<{
      branding: {
        brandColor?: string;
        displayName?: string;
        logoInitials?: string;
        supportEmail?: string;
        leadFinderAnimation?: 'playful' | 'professional';
      };
      canEdit: boolean;
      tenantName: string;
    }>(
      '/api/tenant/branding',
    ).then((res) => {
      if (!alive || !res.success) return;
      setCanEditBrand(res.canEdit);
      setBrandColorInput(res.branding.brandColor ?? '');
      setDisplayNameInput(res.branding.displayName ?? res.tenantName);
      setInitialsInput(res.branding.logoInitials ?? '');
      setSupportEmailInput(res.branding.supportEmail ?? '');
      setLeadFinderAnimation(res.branding.leadFinderAnimation === 'professional' ? 'professional' : 'playful');
    });
    return () => {
      alive = false;
    };
  }, [session.tenantCode]);

  const handleSaveBrand = async () => {
    if (brandCheck && !brandCheck.ok) {
      setToastMessage(`Brand colour not saved: ${brandCheck.message}`);
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }
    setBrandSaving(true);
    const res = await apiJson('/api/tenant/branding', {
      method: 'PATCH',
      body: {
        brandColor: brandHex ?? '',
        displayName: displayNameInput.trim(),
        logoInitials: initialsInput.trim(),
        supportEmail: supportEmailInput.trim(),
        leadFinderAnimation,
      },
    });
    setBrandSaving(false);
    if (!res.success) {
      setToastMessage(res.error || 'Could not save the brand.');
    } else {
      await refreshServerIdentity(); // re-themes the app for everyone on their next load, and here now
      setToastMessage('Brand saved. Everyone in this workspace sees it next time they open the app.');
    }
    setTimeout(() => setToastMessage(null), 3500);
  };

  const [verifying, setVerifying] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [simulatedHost, setSimulatedHostState] = useState<string | null>(() =>
    getSimulatedCustomHost()
  );

  // Sync form inputs when selected tenant changes
  useEffect(() => {
    setDomainInput(activeConfig.customDomain);
    setDisplayNameInput(activeConfig.branding.workspaceDisplayName);
    setInitialsInput(activeConfig.branding.logoInitials);
    setSupportEmailInput(activeConfig.branding.supportEmail);
    setHidePoweredBy(activeConfig.branding.hidePoweredByBadge);
    setBrandColorInput(activeConfig.branding.brandColor ?? '');
  }, [activeConfig.tenantCode]);

  useEffect(() => {
    const unsub = subscribeToCustomDomains((updated) => {
      setAllConfigs(updated);
      setSimulatedHostState(getSimulatedCustomHost());
    });
    return () => unsub();
  }, []);

  const { subdomainPrefix, rootDomain } = useMemo(
    () => splitCustomDomainParts(domainInput),
    [domainInput]
  );

  const copyToClipboard = (value: string, key: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 1800);
  };

  // Save Custom Domain & Generate DNS Records
  const handleSaveDomainAndBranding = () => {
    if (!canManageDomain) return;
    // Reject brand colours that can't reach 3:1 for UI glyphs (spec 7.3).
    if (brandCheck && !brandCheck.ok) {
      setToastMessage(`Brand colour not saved: ${brandCheck.message}`);
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }
    const updated = upsertTenantCustomDomainConfig(activeConfig.tenantCode, {
      tenantName: activeConfig.tenantName,
      customDomain: domainInput,
      dnsStatus:
        activeConfig.customDomain === domainInput.trim().toLowerCase()
          ? activeConfig.dnsStatus
          : 'pending_dns',
      sslStatus:
        activeConfig.customDomain === domainInput.trim().toLowerCase()
          ? activeConfig.sslStatus
          : 'provisioning',
      branding: {
        ...activeConfig.branding,
        workspaceDisplayName: displayNameInput.trim() || `${activeConfig.tenantName} SDR`,
        logoInitials:
          initialsInput.trim().slice(0, 2).toUpperCase() ||
          activeConfig.branding.logoInitials,
        supportEmail: supportEmailInput.trim(),
        hidePoweredByBadge: hidePoweredBy,
        brandColor: brandHex ?? undefined,
      },
    });
    setAllConfigs(getAllCustomDomainConfigs());
    setToastMessage(
      `Saved ${updated.customDomain} & generated CNAME/TXT records for ${updated.tenantName}.`
    );
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Verify Live DNS CNAME + Provision SSL via /api/domains/verify
  const handleVerifyDnsAndSsl = async (simulateVerified = false) => {
    if (!canManageDomain) return;
    setVerifying(true);
    try {
      const res = await fetch('/api/domains/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customDomain: domainInput,
          tenantCode: activeConfig.tenantCode,
          action: 'register',
          simulateVerified,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to verify custom domain.');
      }

      const updated = upsertTenantCustomDomainConfig(activeConfig.tenantCode, {
        customDomain: data.customDomain,
        dnsStatus: data.dnsStatus,
        sslStatus: data.sslStatus,
        detectedCnameRecords: data.detectedCnameRecords,
        lastVerifiedAt: data.lastVerifiedAt,
        statusMessage: data.statusMessage,
        providerMode: data.providerMode,
        branding: {
          ...activeConfig.branding,
          workspaceDisplayName: displayNameInput.trim() || `${activeConfig.tenantName} SDR`,
          logoInitials:
            initialsInput.trim().slice(0, 2).toUpperCase() ||
            activeConfig.branding.logoInitials,
          supportEmail: supportEmailInput.trim(),
          hidePoweredByBadge: hidePoweredBy,
        },
      });
      setAllConfigs(getAllCustomDomainConfigs());
      setToastMessage(updated.statusMessage || 'Domain status updated.');
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err: unknown) {
      setToastMessage(
        err instanceof Error ? err.message : 'Error verifying domain DNS.'
      );
      setTimeout(() => setToastMessage(null), 3500);
    } finally {
      setVerifying(false);
    }
  };

  // Simulate visiting the app from the customer's custom domain (e.g. https://app.customerwebsiteurl.com)
  const handleToggleSimulateCustomDomain = (targetConfig: TenantCustomDomainConfig) => {
    if (simulatedHost === targetConfig.customDomain) {
      setSimulatedCustomHost(null);
      setSimulatedHostState(null);
      setToastMessage(`Returned to primary platform host (${PRIMARY_PLATFORM_HOST})`);
    } else {
      setSimulatedCustomHost(targetConfig.customDomain);
      setSimulatedHostState(targetConfig.customDomain);
      updateSession({
        tenantCode: targetConfig.tenantCode,
        tenantName: targetConfig.tenantName,
      });
      setToastMessage(
        `Now simulating custom domain visit: https://${targetConfig.customDomain} (${targetConfig.branding.workspaceDisplayName})`
      );
    }
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Presentation only: map the stored DNS state to a status badge.
  const dnsBadge = (status: TenantCustomDomainConfig['dnsStatus'], verifiedLabel: string, pendingLabel: string) =>
    status === 'active' ? (
      <Badge tone="success"><CheckCircle2 className="h-3 w-3" aria-hidden />{verifiedLabel}</Badge>
    ) : status === 'error' ? (
      <Badge tone="danger"><AlertTriangle className="h-3 w-3" aria-hidden />Error</Badge>
    ) : (
      <Badge tone="warning"><span className="size-1.5 rounded-full bg-warning-400" aria-hidden />{pendingLabel}</Badge>
    );

  const inputClass =
    'focus-ring w-full h-9 rounded-sm border border-line-strong bg-surface text-body text-fg focus:outline-none placeholder:text-fg-disabled disabled:opacity-50';
  const labelClass = 'block mb-1.5 text-small font-medium text-fg';

  const renderCopyButton = (value: string, field: string, label: string) => (
    <IconButton
      size="sm"
      variant="secondary"
      label={copiedField === field ? 'Copied' : label}
      onClick={() => copyToClipboard(value, field)}
    >
      {copiedField === field ? <Check className="text-success-fg" /> : <Copy className="text-fg-secondary" />}
    </IconButton>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-app font-sans antialiased text-fg">

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6 max-w-[1440px] w-full mx-auto">
          {/* 1. Page header */}
          <div className="space-y-4">
            <PageHeader
              className="pb-0"
              title="Branding & domains"
              description="Put this workspace on your own brand and subdomain. One CNAME record, SSL is automatic."
              meta={
                <span className="text-small text-fg-tertiary">
                  Production host <span className="font-mono text-fg-secondary">{PRIMARY_PLATFORM_HOST}</span>
                </span>
              }
            />

            {/* Active Simulation Banner if previewing a customer's custom domain */}
            {simulatedHost && (
              <div className="px-4 py-3 rounded-lg bg-selected border border-brand-600/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-body">
                <div className="flex items-center gap-2.5">
                  <span className="size-2 rounded-full bg-success-500 animate-pulse-soft shrink-0" aria-hidden />
                  <span className="text-fg">
                    <span className="font-medium">Custom domain preview is on.</span> You are viewing the app as if opened from{' '}
                    <span className="font-mono">https://{simulatedHost}</span>
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setSimulatedCustomHost(null);
                    setSimulatedHostState(null);
                  }}
                >
                  Exit preview
                </Button>
              </div>
            )}

            {toastMessage && (
              <div role="status" className="px-4 py-3 rounded-lg bg-success-bg border border-success-500/30 text-success-fg text-body flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />
                  <span>{toastMessage}</span>
                </div>
                <IconButton label="Dismiss" size="sm" onClick={() => setToastMessage(null)} className="text-success-fg hover:text-success-fg">
                  <X />
                </IconButton>
              </div>
            )}
          </div>

          {/* 2. Steps + live preview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT: STEP 1 (BRAND) + STEP 2 (DOMAIN + DNS) */}
            <div className="lg:col-span-8 space-y-6">

              {/* STEP 1: White-label branding */}
              <div className="bg-surface border border-line rounded-lg p-6 space-y-5 shadow-xs">
                <StepHeader
                  n={1}
                  title="Brand"
                  description={<>What reps and managers see when they open <span className="font-mono">{domainInput}</span></>}
                />

                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>
                      Workspace name
                    </label>
                    <input
                      type="text"
                      value={displayNameInput}
                      onChange={(e) => setDisplayNameInput(e.target.value)}
                      placeholder="e.g., Apex Global Outbound Cloud"
                      className={`${inputClass} px-3`}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>
                        Logo initials <span className="font-normal text-fg-tertiary">(1 or 2 letters)</span>
                      </label>
                      <input
                        type="text"
                        maxLength={2}
                        value={initialsInput}
                        onChange={(e) =>
                          setInitialsInput(e.target.value.toUpperCase())
                        }
                        className={`${inputClass} px-3`}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Support email
                      </label>
                      <input
                        type="email"
                        value={supportEmailInput}
                        onChange={(e) => setSupportEmailInput(e.target.value)}
                        placeholder="support@customerwebsiteurl.com"
                        className={`${inputClass} px-3`}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="brand-colour-hex" className={labelClass}>
                      Brand colour <span className="font-normal text-fg-tertiary">(buttons, active states, focus rings)</span>
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="color"
                        aria-label="Pick brand colour"
                        value={brandHex ?? DEFAULT_BRAND_500}
                        onChange={(e) => setBrandColorInput(e.target.value.toUpperCase())}
                        className="focus-ring h-9 w-12 cursor-pointer rounded-sm border border-line-strong bg-surface p-1"
                      />
                      <input
                        id="brand-colour-hex"
                        type="text"
                        value={brandColorInput}
                        onChange={(e) => setBrandColorInput(e.target.value)}
                        placeholder={`${DEFAULT_BRAND_500} (Appointmentlyy crimson)`}
                        aria-invalid={brandCheck ? !brandCheck.ok : undefined}
                        aria-describedby="brand-colour-check"
                        className={`${inputClass} max-w-56 px-3 font-mono`}
                      />
                      {brandColorInput && (
                        <Button variant="ghost" size="sm" onClick={() => setBrandColorInput('')}>
                          Use default
                        </Button>
                      )}
                    </div>
                    <p id="brand-colour-check" className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-small" aria-live="polite">
                      {brandCheck ? (
                        <>
                          <StatusDot
                            tone={!brandCheck.ok ? 'danger' : brandCheck.buttonText >= 4.5 ? 'success' : 'warning'}
                            label={brandCheck.message}
                          />
                          {brandHex && (
                            <span className="text-fg-tertiary tabular-nums">
                              Button text {brandCheck.buttonText.toFixed(1)}:1 · On page {brandCheck.onCanvas.toFixed(1)}:1
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-fg-tertiary">Using Appointmentlyy crimson.</span>
                      )}
                    </p>
                  </div>

                  <label className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg border border-line cursor-pointer hover:bg-subtle transition-colors">
                    <div>
                      <span className="text-body-strong text-fg block">
                        Hide &ldquo;Powered by Appointmentlyy&rdquo;
                      </span>
                      <span className="text-small text-fg-secondary">
                        Fully white-label header on{' '}
                        <span className="font-mono">{domainInput}</span>
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={hidePoweredBy}
                      onChange={(e) => setHidePoweredBy(e.target.checked)}
                      className="focus-ring size-4 rounded-sm border-line-strong accent-ink-900 cursor-pointer"
                    />
                  </label>

                  {!DEMO_LOGIN && (
                    <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 rounded-lg border border-line">
                      <div className="min-w-0">
                        <span className="text-body-strong text-fg block">
                          Lead Finder animation
                        </span>
                        <span className="text-small text-fg-secondary">
                          Playful adds a robot SDR and light humor. Professional keeps the same live numbers with a calm visual.
                        </span>
                      </div>
                      <SegmentedControl
                        label="Lead Finder animation"
                        size="sm"
                        value={leadFinderAnimation}
                        onChange={(v) => setLeadFinderAnimation(v === 'professional' ? 'professional' : 'playful')}
                        items={[
                          { value: 'playful', label: 'Playful' },
                          { value: 'professional', label: 'Professional' },
                        ]}
                      />
                    </div>
                  )}

                  {!DEMO_LOGIN && (
                    <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
                      {!canEditBrand && <span className="text-small text-fg-tertiary">Only workspace admins can change the brand.</span>}
                      <Button variant="primary" onClick={handleSaveBrand} loading={brandSaving} disabled={!canEditBrand}>
                        Save brand
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* STEP 2: Domain + DNS records */}
              <div className="bg-surface border border-line rounded-lg p-6 space-y-5 shadow-xs">
                <StepHeader
                  n={2}
                  title="Domain"
                  description="Pick a subdomain, then add the records below at your DNS provider (Cloudflare, GoDaddy, Namecheap, AWS Route53 or Google Cloud DNS)."
                  right={dnsBadge(activeConfig.dnsStatus, 'Verified', 'Pending DNS')}
                />

                {/* Quick Subdomain Prefix Pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-small text-fg-tertiary mr-1">Suggested:</span>
                  {SUBDOMAIN_PRESETS.map((prefix) => (
                    <button
                      key={prefix}
                      type="button"
                      onClick={() => setDomainInput(`${prefix}.${rootDomain}`)}
                      aria-pressed={subdomainPrefix === prefix}
                      className={`focus-ring h-7 px-2.5 rounded-full font-mono text-caption border transition-colors duration-150 cursor-pointer ${
                        subdomainPrefix === prefix
                          ? 'bg-selected text-fg border-brand-600/30'
                          : 'bg-surface text-fg-secondary border-line hover:bg-subtle'
                      }`}
                    >
                      {prefix}.{rootDomain}
                    </button>
                  ))}
                </div>

                {/* Domain Input Box */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-small text-fg-tertiary">
                      https://
                    </span>
                    <input
                      type="text"
                      value={domainInput}
                      onChange={(e) => setDomainInput(e.target.value)}
                      placeholder="app.customerwebsiteurl.com"
                      disabled={!canManageDomain}
                      aria-label="Custom subdomain"
                      className={`${inputClass} pl-20 pr-3 font-mono`}
                    />
                  </div>
                  <Button
                    variant="brand"
                    onClick={handleSaveDomainAndBranding}
                    disabled={!canManageDomain}
                  >
                    Save and generate DNS
                  </Button>
                </div>

                {/* DNS Records Table */}
                <div className="border border-line rounded-lg overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-subtle text-caption text-fg-tertiary">
                        <th className="h-9 px-3 font-medium">Type</th>
                        <th className="h-9 px-3 font-medium">Host</th>
                        <th className="h-9 px-3 font-medium">Points to</th>
                        <th className="h-9 px-3 font-medium">TTL</th>
                        <th className="h-9 px-3 font-medium text-right"><span className="sr-only">Copy</span></th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-small">
                      {/* Record 1: Primary CNAME */}
                      <tr className="border-t border-line">
                        <td className="py-3 px-3 align-top">
                          <span className="px-1.5 py-0.5 rounded-sm bg-subtle text-fg text-caption">
                            CNAME
                          </span>
                        </td>
                        <td className="py-3 px-3 align-top text-fg">
                          {subdomainPrefix}
                          <span className="block text-caption text-fg-tertiary">
                            ({domainInput})
                          </span>
                        </td>
                        <td className="py-3 px-3 align-top text-fg">
                          {BRANDED_CNAME_TARGET}
                          <span className="block text-caption text-fg-tertiary">
                            or {VERCEL_CNAME_TARGET}
                          </span>
                        </td>
                        <td className="py-3 px-3 align-top text-fg-tertiary font-sans whitespace-nowrap">Auto / 300s</td>
                        <td className="py-3 px-3 align-top text-right font-sans">
                          {renderCopyButton(BRANDED_CNAME_TARGET, 'cname_val', 'Copy target')}
                        </td>
                      </tr>

                      {/* Record 2: Optional TXT Ownership Verification */}
                      <tr className="border-t border-line">
                        <td className="py-3 px-3 align-top">
                          <span className="px-1.5 py-0.5 rounded-sm bg-subtle text-fg text-caption">
                            TXT
                          </span>
                        </td>
                        <td className="py-3 px-3 align-top text-fg">
                          _appointmentlyy-verify
                          <span className="block text-caption text-fg-tertiary">
                            ({activeConfig.txtVerificationName})
                          </span>
                        </td>
                        <td className="py-3 px-3 align-top text-fg-secondary break-all max-w-[240px]">
                          {activeConfig.txtVerificationValue}
                        </td>
                        <td className="py-3 px-3 align-top text-fg-tertiary font-sans whitespace-nowrap">Auto / 300s</td>
                        <td className="py-3 px-3 align-top text-right font-sans">
                          {renderCopyButton(activeConfig.txtVerificationValue, 'txt_val', 'Copy TXT')}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Verify DNS Propagation & Provision SSL */}
                <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-line">
                  <div className="text-small text-fg-secondary">
                    <span className="font-medium text-fg">Status:</span>{' '}
                    {activeConfig.statusMessage}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      disabled={verifying || !canManageDomain}
                      onClick={() => handleVerifyDnsAndSsl(true)}
                      title="Simulate instant DNS verification & SSL certificate activation for demo testing"
                      icon={<Sparkles />}
                    >
                      Demo activate
                    </Button>

                    <Button
                      variant="primary"
                      disabled={verifying || !canManageDomain}
                      onClick={() => handleVerifyDnsAndSsl(false)}
                      icon={<RefreshCw className={verifying ? 'animate-spin' : ''} />}
                    >
                      {verifying ? 'Checking DNS...' : 'Verify DNS and SSL'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT: LIVE PREVIEW */}
            <div className="lg:col-span-4 lg:sticky lg:top-0 space-y-6">
              <div className="bg-surface border border-line rounded-lg p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-h3 text-fg">Preview</h2>
                  <span className="inline-flex items-center gap-1 text-caption text-fg-tertiary">
                    <Lock className="w-3 h-3" aria-hidden />
                    TLS 1.3 HTTPS
                  </span>
                </div>

                <div className="rounded-lg border border-line overflow-hidden">
                  {/* Mock Browser URL Bar */}
                  <div className="px-3 py-2 bg-subtle border-b border-line flex items-center gap-2 font-mono text-caption text-fg-secondary">
                    <Lock className="w-3 h-3 text-fg-tertiary shrink-0" aria-hidden />
                    <span className="truncate">
                      <span className="text-fg-tertiary">https://</span>
                      <span className="text-fg">{domainInput || 'app.customerwebsiteurl.com'}</span>
                      <span className="text-fg-tertiary">/cockpit</span>
                    </span>
                  </div>

                  {/* Live preview: the tenant's sidebar and brand button, themed with the derived tokens */}
                  <div className="flex bg-app" style={previewVars}>
                    <div className="w-36 shrink-0 border-r border-line p-2">
                      <div className="mb-2 flex items-center gap-1.5 px-1">
                        <div className="size-6 rounded-sm bg-action text-action-fg text-caption flex items-center justify-center shrink-0">
                          {initialsInput || 'CW'}
                        </div>
                        <span className="truncate text-small font-medium text-fg">
                          {displayNameInput || 'Customer SDR Workspace'}
                        </span>
                      </div>
                      {['Home', 'Dialer', 'Inbox'].map((item, i) => (
                        <div
                          key={item}
                          className={`relative flex h-7 items-center rounded-sm px-2 text-small ${i === 1 ? 'bg-subtle font-medium text-fg' : 'text-fg-secondary'}`}
                        >
                          {i === 1 && <span className="absolute inset-y-1.5 -left-1 w-0.5 rounded-full bg-brand-500" aria-hidden />}
                          {item}
                        </div>
                      ))}
                      {!hidePoweredBy && (
                        <div className="mt-3 px-2 text-caption text-fg-tertiary">Powered by Appointmentlyy</div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col items-start gap-2 p-3">
                      <span className="text-small text-fg-secondary">Adam Reyes, Taskus</span>
                      <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-action-brand px-3 text-small font-medium text-action-brand-fg">
                        <Phone className="size-3.5" aria-hidden /> Call
                      </span>
                      <span className="text-caption text-brand-text">Link colour</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    className="flex-1"
                    variant="secondary"
                    onClick={handleSaveDomainAndBranding}
                  >
                    Save branding
                  </Button>
                  <Button
                    className="flex-1"
                    variant="secondary"
                    onClick={() => handleToggleSimulateCustomDomain(activeConfig)}
                    icon={<Eye className="text-fg-secondary" />}
                  >
                    {simulatedHost === activeConfig.customDomain
                      ? 'Exit domain preview'
                      : 'Test domain live'}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Connected domains registry */}
          <div className="bg-surface border border-line rounded-lg shadow-xs overflow-hidden">
            <div className="px-6 pt-5 pb-4">
              <h2 className="text-h3 text-fg">
                Connected domains
              </h2>
              <p className="text-small text-fg-secondary mt-0.5">
                All customer subdomains route through{' '}
                <span className="font-mono">src/proxy.ts</span> to{' '}
                <span className="font-mono">
                  https://{PRIMARY_PLATFORM_HOST}
                </span>
              </p>
            </div>

            <div className="overflow-x-auto border-t border-line">
              <table className="w-full text-left border-collapse text-body">
                <thead>
                  <tr className="bg-subtle text-caption text-fg-tertiary">
                    <th className="h-9 px-4 font-medium">Workspace</th>
                    <th className="h-9 px-4 font-medium">Custom domain</th>
                    <th className="h-9 px-4 font-medium">Brand</th>
                    <th className="h-9 px-4 font-medium">Status</th>
                    <th className="h-9 px-4 font-medium text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(allConfigs).map((cfg) => {
                    const isSimulated = simulatedHost === cfg.customDomain;
                    return (
                      <tr key={cfg.tenantCode} className="border-t border-line hover:bg-subtle transition-colors">
                        <td className="py-3 px-4">
                          <span className="text-body-strong text-fg">{cfg.tenantName}</span>
                          <span className="block text-caption font-mono text-fg-tertiary">
                            {cfg.tenantCode}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-small text-fg">
                          https://{cfg.customDomain}
                          <span className="block text-caption text-fg-tertiary">
                            CNAME {cfg.cnameTarget}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-2 text-fg">
                            <span className="size-5 rounded-sm bg-ink-950 text-ink-50 text-[10px] font-medium flex items-center justify-center shrink-0">
                              {cfg.branding.logoInitials}
                            </span>
                            <span>{cfg.branding.workspaceDisplayName}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {dnsBadge(cfg.dnsStatus, 'SSL active', 'Pending CNAME')}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedTenantCode(cfg.tenantCode)}
                            >
                              Configure
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleToggleSimulateCustomDomain(cfg)}
                              icon={isSimulated ? <span className="size-1.5 rounded-full bg-success-500" aria-hidden /> : undefined}
                            >
                              {isSimulated ? 'Previewing' : 'Simulate visit'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
