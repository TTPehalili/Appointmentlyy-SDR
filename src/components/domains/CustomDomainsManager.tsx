'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';
import { useSession } from '@/lib/session';
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

const SUBDOMAIN_PRESETS = ['app', 'sdr', 'portal', 'dialer', 'outbound'];

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

  useEffect(() => {
    if (!isSuperAdmin) {
      setSelectedTenantCode((session.tenantCode || 'APPOINTMENTLYY').toUpperCase());
    }
  }, [session.tenantCode, isSuperAdmin]);

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

  return (
    <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-[#FAFAFA] font-sans antialiased text-zinc-900">

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        <main className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-[1440px] w-full mx-auto">
          {/* 1. TOP ARCHITECTURE & PRODUCTION HOST BANNER */}
          <div className="bg-white border border-zinc-200/90 rounded-2xl p-6 shadow-2xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-950 text-white text-[10px] font-mono font-bold uppercase tracking-wider">
                    <Globe className="w-3 h-3 text-emerald-400" />
                    <span>WHITE-LABEL CUSTOM DOMAIN ENGINE</span>
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-[11px] font-semibold">
                    Primary Production Host: https://{PRIMARY_PLATFORM_HOST}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-700 font-mono text-[11px]">
                    CNAME Alias: {BRANDED_CNAME_TARGET}
                  </span>
                </div>
                <h1 className="text-xl font-bold tracking-tight text-zinc-950">
                  Customer Custom Domains &amp; White-Label DNS Setup
                </h1>
                <p className="text-xs text-zinc-500 max-w-3xl leading-relaxed">
                  Let your customers host their dedicated Appointmentlyy SDR workspace on their own subdomain (e.g.,{' '}
                  <code className="px-1.5 py-0.5 rounded bg-zinc-100 font-mono text-zinc-900">
                    app.customerwebsiteurl.com
                  </code>
                  ). Customers simply add one <code className="font-mono">CNAME</code> record pointing to{' '}
                  <code className="px-1.5 py-0.5 rounded bg-zinc-100 font-mono text-zinc-900">
                    {BRANDED_CNAME_TARGET}
                  </code>
                  , and SSL (TLS 1.3) + tenant workspace routing activate automatically.
                </p>
              </div>

              {/* Super Admin Tenant Selector */}
              {isSuperAdmin && (
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 flex flex-col gap-1.5 min-w-[260px]">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
                    Super Admin — Select Client Workspace
                  </span>
                  <select
                    value={selectedTenantCode}
                    onChange={(e) => setSelectedTenantCode(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-white border border-zinc-300 text-xs font-bold text-zinc-950 focus:outline-none cursor-pointer"
                  >
                    {Object.values(allConfigs).map((cfg) => (
                      <option key={cfg.tenantCode} value={cfg.tenantCode}>
                        {cfg.tenantName} ({cfg.customDomain})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Active Simulation Banner if previewing a customer's custom domain */}
            {simulatedHost && (
              <div className="p-3.5 rounded-xl bg-zinc-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span>
                    <strong>Custom Domain Preview Active:</strong> You are currently viewing the app as if accessed via{' '}
                    <code className="px-2 py-0.5 rounded bg-zinc-800 text-emerald-400 font-mono">
                      https://{simulatedHost}
                    </code>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSimulatedCustomHost(null);
                    setSimulatedHostState(null);
                  }}
                  className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs cursor-pointer shrink-0"
                >
                  Exit Custom Domain Preview
                </button>
              </div>
            )}

            {toastMessage && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{toastMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setToastMessage(null)}
                  className="text-emerald-700 hover:text-emerald-950 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* 2. STEP-BY-STEP CUSTOMER CUSTOM DOMAIN WIZARD */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* LEFT 7 COLUMNS: STEP 1 (DOMAIN INPUT) + STEP 2 (DNS CNAME/TXT RECORDS) */}
            <div className="lg:col-span-7 space-y-6">
              {/* STEP 1: Enter Custom Subdomain */}
              <div className="bg-white border border-zinc-200/90 rounded-2xl p-6 space-y-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-zinc-950 text-white font-mono text-xs font-bold flex items-center justify-center">
                      1
                    </span>
                    <h2 className="text-sm font-bold text-zinc-950">
                      Assign Customer Subdomain (e.g., app.customerwebsiteurl.com)
                    </h2>
                  </div>

                  {/* Live Status Pill */}
                  <span
                    className={`px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold border ${
                      activeConfig.dnsStatus === 'active'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {activeConfig.dnsStatus === 'active'
                      ? '✓ DNS & SSL Active'
                      : '⏳ Pending DNS CNAME'}
                  </span>
                </div>

                {/* Quick Subdomain Prefix Pills */}
                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  <span className="text-zinc-400">Recommended prefixes:</span>
                  {SUBDOMAIN_PRESETS.map((prefix) => (
                    <button
                      key={prefix}
                      type="button"
                      onClick={() => setDomainInput(`${prefix}.${rootDomain}`)}
                      className={`px-2.5 py-1 rounded-lg font-mono text-[11px] border transition cursor-pointer ${
                        subdomainPrefix === prefix
                          ? 'bg-zinc-950 text-white border-zinc-950 font-bold'
                          : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:border-zinc-400'
                      }`}
                    >
                      {prefix}.{rootDomain}
                    </button>
                  ))}
                </div>

                {/* Domain Input Box */}
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <div className="relative flex-1">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-xs text-zinc-400">
                      https://
                    </span>
                    <input
                      type="text"
                      value={domainInput}
                      onChange={(e) => setDomainInput(e.target.value)}
                      placeholder="app.customerwebsiteurl.com"
                      disabled={!canManageDomain}
                      className="w-full pl-16 pr-4 py-2.5 rounded-xl border border-zinc-300 bg-white font-mono text-xs font-bold text-zinc-950 focus:outline-none focus:border-zinc-950"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveDomainAndBranding}
                    disabled={!canManageDomain}
                    className="px-5 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 text-white text-xs font-bold transition cursor-pointer shrink-0"
                  >
                    Save Domain &amp; Generate DNS
                  </button>
                </div>
              </div>

              {/* STEP 2: Copy-Paste Customer DNS Records (GoDaddy / Cloudflare / Namecheap / Route53) */}
              <div className="bg-white border border-zinc-200/90 rounded-2xl p-6 space-y-4 shadow-2xs">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-zinc-950 text-white font-mono text-xs font-bold flex items-center justify-center">
                      2
                    </span>
                    <div>
                      <h2 className="text-sm font-bold text-zinc-950">
                        Customer DNS Configuration Records
                      </h2>
                      <p className="text-[11px] text-zinc-500">
                        Add these records in your customer&apos;s DNS provider (Cloudflare, GoDaddy, Namecheap, AWS Route53, or Google Cloud DNS)
                      </p>
                    </div>
                  </div>
                </div>

                {/* DNS Records Table */}
                <div className="border border-zinc-200 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-mono uppercase text-zinc-500">
                        <th className="py-2.5 px-3.5">Type</th>
                        <th className="py-2.5 px-3.5">Host / Name</th>
                        <th className="py-2.5 px-3.5">Value / Points To</th>
                        <th className="py-2.5 px-3.5">TTL</th>
                        <th className="py-2.5 px-3.5 text-right">Copy</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 font-mono text-[11px]">
                      {/* Record 1: Primary CNAME */}
                      <tr className="bg-emerald-50/20">
                        <td className="py-3 px-3.5">
                          <span className="px-2 py-0.5 rounded bg-zinc-950 text-white font-bold text-[10px]">
                            CNAME
                          </span>
                        </td>
                        <td className="py-3 px-3.5 font-bold text-zinc-950">
                          {subdomainPrefix}
                          <span className="block text-[10px] font-normal text-zinc-400">
                            ({domainInput})
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-emerald-800 font-bold">
                          {BRANDED_CNAME_TARGET}
                          <span className="block text-[10px] font-normal text-zinc-400">
                            or {VERCEL_CNAME_TARGET}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-zinc-500">Auto / 300s</td>
                        <td className="py-3 px-3.5 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(BRANDED_CNAME_TARGET, 'cname_val')
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-zinc-200 hover:border-zinc-900 text-zinc-800 font-sans font-semibold text-[11px] cursor-pointer"
                          >
                            {copiedField === 'cname_val' ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy Target</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Record 2: Optional TXT Ownership Verification */}
                      <tr>
                        <td className="py-3 px-3.5">
                          <span className="px-2 py-0.5 rounded bg-zinc-200 text-zinc-800 font-bold text-[10px]">
                            TXT
                          </span>
                        </td>
                        <td className="py-3 px-3.5 font-semibold text-zinc-800">
                          _appointmentlyy-verify
                          <span className="block text-[10px] font-normal text-zinc-400">
                            ({activeConfig.txtVerificationName})
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-zinc-600 break-all max-w-[240px]">
                          {activeConfig.txtVerificationValue}
                        </td>
                        <td className="py-3 px-3.5 text-zinc-500">Auto / 300s</td>
                        <td className="py-3 px-3.5 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                activeConfig.txtVerificationValue,
                                'txt_val'
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-zinc-200 hover:border-zinc-900 text-zinc-800 font-sans font-semibold text-[11px] cursor-pointer"
                          >
                            {copiedField === 'txt_val' ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy TXT</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* STEP 3: Verify DNS Propagation & Provision SSL */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-zinc-100">
                  <div className="text-xs text-zinc-600">
                    <span className="font-semibold text-zinc-900">Status:</span>{' '}
                    {activeConfig.statusMessage}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={verifying || !canManageDomain}
                      onClick={() => handleVerifyDnsAndSsl(false)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 text-white text-xs font-bold transition cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 text-emerald-400 ${
                          verifying ? 'animate-spin' : ''
                        }`}
                      />
                      <span>
                        {verifying ? 'Checking DNS...' : 'Verify Live DNS & SSL'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={verifying || !canManageDomain}
                      onClick={() => handleVerifyDnsAndSsl(true)}
                      title="Simulate instant DNS verification & SSL certificate activation for demo testing"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-semibold transition cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Instant Demo Activate</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT 5 COLUMNS: STEP 3 (WHITE-LABEL BRANDING) + LIVE SIMULATOR */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white border border-zinc-200/90 rounded-2xl p-6 space-y-4 shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-zinc-950 text-white font-mono text-xs font-bold flex items-center justify-center">
                    3
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-zinc-950">
                      White-Label Workspace Branding
                    </h2>
                    <p className="text-[11px] text-zinc-500">
                      Customize what reps &amp; managers see when visiting{' '}
                      <code className="font-mono">{domainInput}</code>
                    </p>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">
                      Workspace Header Brand Name
                    </label>
                    <input
                      type="text"
                      value={displayNameInput}
                      onChange={(e) => setDisplayNameInput(e.target.value)}
                      placeholder="e.g., Apex Global Outbound Cloud"
                      className="w-full px-3 py-2 rounded-xl border border-zinc-300 bg-white text-zinc-950 font-semibold focus:outline-none focus:border-zinc-950"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">
                        Logo Badge Initials (1–2 chars)
                      </label>
                      <input
                        type="text"
                        maxLength={2}
                        value={initialsInput}
                        onChange={(e) =>
                          setInitialsInput(e.target.value.toUpperCase())
                        }
                        className="w-full px-3 py-2 rounded-xl border border-zinc-300 bg-white font-mono font-bold text-zinc-950 focus:outline-none focus:border-zinc-950"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">
                        IT / Helpdesk Support Email
                      </label>
                      <input
                        type="email"
                        value={supportEmailInput}
                        onChange={(e) => setSupportEmailInput(e.target.value)}
                        placeholder="support@customerwebsiteurl.com"
                        className="w-full px-3 py-2 rounded-xl border border-zinc-300 bg-white font-mono text-zinc-900 focus:outline-none focus:border-zinc-950"
                      />
                    </div>
                  </div>

                  <label className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-200 cursor-pointer">
                    <div>
                      <span className="font-semibold text-zinc-900 block">
                        Hide &ldquo;Powered by Appointmentlyy&rdquo; Badge
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        100% white-label header when accessed from{' '}
                        <code className="font-mono">{domainInput}</code>
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={hidePoweredBy}
                      onChange={(e) => setHidePoweredBy(e.target.checked)}
                      className="rounded border-zinc-300 cursor-pointer"
                    />
                  </label>
                </div>

                {/* Live Browser URL Bar Preview Card */}
                <div className="p-4 rounded-xl bg-zinc-950 text-white space-y-3">
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                    <span>LIVE CUSTOM DOMAIN HEADER PREVIEW</span>
                    <span className="text-emerald-400">🔒 TLS 1.3 HTTPS</span>
                  </div>

                  {/* Mock Browser URL Bar */}
                  <div className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center gap-2 font-mono text-xs text-zinc-200">
                    <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="text-emerald-400">https://</span>
                    <span className="font-bold text-white truncate">
                      {domainInput || 'app.customerwebsiteurl.com'}
                    </span>
                    <span className="text-zinc-500">/cockpit</span>
                  </div>

                  {/* Mock White-Label Top Header */}
                  <div className="p-3 rounded-lg bg-white text-zinc-900 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-zinc-950 text-white font-bold text-xs flex items-center justify-center">
                        {initialsInput || 'CW'}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-zinc-950">
                          {displayNameInput || 'Customer SDR Workspace'}
                        </div>
                        {!hidePoweredBy && (
                          <div className="text-[10px] text-zinc-400 font-mono">
                            Powered by Appointmentlyy
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-[10px] font-semibold">
                      {activeConfig.tenantName}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSaveDomainAndBranding}
                      className="flex-1 py-2 rounded-lg bg-white hover:bg-zinc-100 text-zinc-950 font-bold text-xs transition cursor-pointer"
                    >
                      Save Branding
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleSimulateCustomDomain(activeConfig)}
                      className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>
                        {simulatedHost === activeConfig.customDomain
                          ? 'Exit Domain Preview'
                          : 'Test Custom Domain Live'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3. SUPER ADMIN MULTI-CLIENT DOMAIN DIRECTORY & PRODUCTION DEPLOYMENT GUIDE */}
          <div className="bg-white border border-zinc-200/90 rounded-2xl p-6 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-bold text-zinc-950">
                  Connected Customer Custom Domains Registry
                </h2>
                <p className="text-xs text-zinc-500">
                  All customer subdomains routed through{' '}
                  <code className="font-mono text-zinc-800">src/proxy.ts</code> to{' '}
                  <code className="font-mono text-zinc-800">
                    https://{PRIMARY_PLATFORM_HOST}
                  </code>
                </p>
              </div>
            </div>

            <div className="border border-zinc-200 rounded-xl overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-mono uppercase text-zinc-500">
                    <th className="py-2.5 px-4">Tenant Workspace</th>
                    <th className="py-2.5 px-4">Custom Domain</th>
                    <th className="py-2.5 px-4">CNAME Target</th>
                    <th className="py-2.5 px-4">White-Label Brand</th>
                    <th className="py-2.5 px-4">DNS &amp; SSL Status</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {Object.values(allConfigs).map((cfg) => {
                    const isSimulated = simulatedHost === cfg.customDomain;
                    return (
                      <tr key={cfg.tenantCode} className="hover:bg-zinc-50/70">
                        <td className="py-3 px-4 font-semibold text-zinc-950">
                          {cfg.tenantName}
                          <span className="block text-[10px] font-mono text-zinc-400">
                            {cfg.tenantCode}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-zinc-900">
                          https://{cfg.customDomain}
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-500">
                          {cfg.cnameTarget}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1.5 font-medium text-zinc-800">
                            <span className="w-5 h-5 rounded bg-zinc-900 text-white font-mono text-[10px] font-bold flex items-center justify-center">
                              {cfg.branding.logoInitials}
                            </span>
                            <span>{cfg.branding.workspaceDisplayName}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold border ${
                              cfg.dnsStatus === 'active'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            {cfg.dnsStatus === 'active'
                              ? '● SSL Active (TLS 1.3)'
                              : '◐ Pending Customer CNAME'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => setSelectedTenantCode(cfg.tenantCode)}
                            className="px-2.5 py-1 rounded-lg border border-zinc-200 hover:border-zinc-900 text-zinc-700 font-semibold text-[11px] cursor-pointer"
                          >
                            Configure
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleSimulateCustomDomain(cfg)}
                            className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] cursor-pointer ${
                              isSimulated
                                ? 'bg-emerald-600 text-white'
                                : 'bg-zinc-950 text-white hover:bg-zinc-800'
                            }`}
                          >
                            {isSimulated ? 'Previewing Now' : 'Simulate Visit'}
                          </button>
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

