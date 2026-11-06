'use client';

import React, { useState, useEffect, useMemo, useCallback, useSyncExternalStore } from 'react';
import { ShieldCheck, CreditCard, KeyRound, Check } from 'lucide-react';
import { useSession } from '@/lib/session';
import {
  TenantQuotaState,
  getTenantQuota,
  getAllTenantQuotas,
  getAvailablePullBalance,
  creditTenantRecords,
  normalizeTenantKey,
  getSuperAdminMasterDataKey,
  setSuperAdminMasterDataKey,
  subscribeToQuotaStore,
} from '@/lib/icpQuotaStore';
import QuotaTopUpModal from './QuotaTopUpModal';
import { Button, Badge, Meter } from '@/components/ui';

/**
 * Super Admin's selected client workspace, shared by Lead Finder and Admin > Lead credits
 * so both screens act on the same workspace. Kept for the browser tab only (sessionStorage);
 * non-Super-Admins always use their own workspace, exactly as before.
 */
const TARGET_TENANT_SESSION_KEY = 'appointmentlyy_icp_target_tenant';
const TARGET_TENANT_EVENT = 'appointmentlyy:icp-target-tenant';

function subscribeTargetTenant(callback: () => void) {
  window.addEventListener(TARGET_TENANT_EVENT, callback);
  return () => window.removeEventListener(TARGET_TENANT_EVENT, callback);
}

function readTargetTenant(): string | null {
  try {
    return window.sessionStorage.getItem(TARGET_TENANT_SESSION_KEY);
  } catch {
    return null;
  }
}

export function useIcpTargetTenant(isSuperAdmin: boolean, ownTenantCode: string) {
  const stored = useSyncExternalStore(subscribeTargetTenant, readTargetTenant, () => null);
  const targetTenantCode = isSuperAdmin ? stored || ownTenantCode : ownTenantCode;

  const setTargetTenantCode = useCallback((code: string) => {
    try {
      window.sessionStorage.setItem(TARGET_TENANT_SESSION_KEY, code);
    } catch {
      /* storage unavailable */
    }
    window.dispatchEvent(new Event(TARGET_TENANT_EVENT));
  }, []);

  return [targetTenantCode, setTargetTenantCode] as const;
}

/** Admin > Data > Lead credits & quota: workspace provisioning, quota tiles and top-ups (moved from Lead Finder). */
export default function LeadCreditsAdmin() {
  const { session, role, tenantName, repName, email } = useSession();
  const isSuperAdmin = role === 'Super Admin';

  // Active target tenant
  const [targetTenantCode, setTargetTenantCode] = useIcpTargetTenant(
    isSuperAdmin,
    normalizeTenantKey(session.tenantCode || tenantName)
  );

  const [allQuotas, setAllQuotas] = useState<Record<string, TenantQuotaState>>(() =>
    getAllTenantQuotas()
  );
  const activeQuota = useMemo(
    () => allQuotas[targetTenantCode] || getTenantQuota(targetTenantCode, tenantName),
    [allQuotas, targetTenantCode, tenantName]
  );
  const balance = useMemo(() => getAvailablePullBalance(activeQuota), [activeQuota]);

  // Top-up modal state
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);

  // Super Admin Master Key drawer
  const [showMasterKeyPanel, setShowMasterKeyPanel] = useState(false);
  const [masterKeyInput, setMasterKeyInput] = useState(() => getSuperAdminMasterDataKey());
  const [masterKeySavedToast, setMasterKeySavedToast] = useState(false);

  // Subscribe to store updates (pulls in Lead Finder, other tabs)
  useEffect(() => {
    const unsubQuota = subscribeToQuotaStore(() => {
      setAllQuotas(getAllTenantQuotas());
    });
    return () => {
      unsubQuota();
    };
  }, []);

  const weeklyPct =
    activeQuota.weeklyAllowance > 0
      ? Math.min(
          100,
          Math.round((activeQuota.weeklyUsed / activeQuota.weeklyAllowance) * 100)
        )
      : 100;

  const monthlyPct =
    activeQuota.monthlyIncludedAllowance > 0
      ? Math.min(
          100,
          Math.round(
            (activeQuota.monthlyBaseUsed / activeQuota.monthlyIncludedAllowance) *
              100
          )
        )
      : 100;

  return (
    <div className="space-y-6">
      {/* SUPER ADMIN PROVISIONING STRIP */}
      {isSuperAdmin && (
        <div className="bg-surface rounded-lg px-4 py-3 border border-line shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-body-strong text-fg">
                <ShieldCheck className="w-4 h-4 text-fg-secondary" />
                Super admin
              </span>
              <span className="text-small text-fg-secondary">
                Client workspace
              </span>
              <select
                value={targetTenantCode}
                onChange={(e) => setTargetTenantCode(e.target.value)}
                aria-label="Client workspace"
                className="focus-ring h-8 px-2.5 rounded-sm bg-surface border border-line-strong text-small text-fg cursor-pointer"
              >
                {Object.values(allQuotas).map((q) => (
                  <option key={q.tenantCode} value={q.tenantCode}>
                    {q.tenantName} ({q.tenantCode}) &bull;{' '}
                    {q.billingStage === 'month1'
                      ? 'Month 1 (2k/wk Included)'
                      : 'Month 2+ ($249 BYOK + Volume)'}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const nextStage =
                    activeQuota.billingStage === 'month1'
                      ? 'month2+'
                      : 'month1';
                  creditTenantRecords(activeQuota.tenantCode, 0, {
                    setBillingStage: nextStage,
                    resetMonth1: nextStage === 'month1',
                  });
                  setAllQuotas(getAllTenantQuotas());
                }}
              >
                <span className="text-fg-secondary">Stage:</span>
                <span>
                  {activeQuota.billingStage === 'month1'
                    ? 'Month 1 (free 8k)'
                    : 'Month 2+ (paid packs)'}
                </span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  creditTenantRecords(activeQuota.tenantCode, 2000);
                  setAllQuotas(getAllTenantQuotas());
                }}
              >
                Credit 2,000 records
              </Button>

              <Button
                variant="ghost"
                size="sm"
                icon={<KeyRound />}
                aria-expanded={showMasterKeyPanel}
                onClick={() => setShowMasterKeyPanel(!showMasterKeyPanel)}
              >
                Master engine key
              </Button>
            </div>
          </div>

          {showMasterKeyPanel && (
            <div className="mt-3 pt-3 border-t border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-small text-fg-secondary">
                <span className="text-body-strong text-fg">
                  Master data engine API key:
                </span>{' '}
                hidden on the server. Powers all client workspaces via{' '}
                <code className="font-mono text-fg">/api/intelligence/icp</code>.
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={masterKeyInput}
                  onChange={(e) => setMasterKeyInput(e.target.value)}
                  placeholder="Paste master x-api-key..."
                  aria-label="Master data engine API key"
                  className="focus-ring w-64 h-8 px-3 rounded-sm bg-surface border border-line-strong text-small text-fg font-mono placeholder:text-fg-disabled"
                />
                <Button
                  variant="primary"
                  size="sm"
                  icon={masterKeySavedToast ? <Check /> : undefined}
                  onClick={() => {
                    setSuperAdminMasterDataKey(masterKeyInput);
                    setMasterKeySavedToast(true);
                    setTimeout(() => setMasterKeySavedToast(false), 2000);
                  }}
                >
                  {masterKeySavedToast ? 'Saved' : 'Save'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* QUOTA: usage vs. allowance */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-h2 text-fg">{activeQuota.tenantName}</h2>
            <p className="text-small text-fg-secondary mt-0.5">
              Lead Finder quota for this workspace. Pulls in Lead Finder deduct from it.
            </p>
          </div>
          <Button
            variant="brand"
            icon={<CreditCard />}
            onClick={() => setIsTopUpModalOpen(true)}
          >
            Top up quota
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Tile 1: Weekly pace */}
          <div className="rounded-lg border border-line bg-surface shadow-xs p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-small text-fg-secondary">
                Weekly allowance
              </span>
              <span className="text-caption text-fg-tertiary">
                {activeQuota.billingStage === 'month1'
                  ? `Week ${activeQuota.currentWeekNumber} of 4, resets Monday`
                  : 'Month 2+ paid volume'}
              </span>
            </div>
            {activeQuota.billingStage === 'month1' ? (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-kpi tabular-nums text-fg">
                    {activeQuota.weeklyUsed.toLocaleString()}{' '}
                    <span className="text-body font-normal text-fg-tertiary">
                      / {activeQuota.weeklyAllowance.toLocaleString()}
                    </span>
                  </span>
                  <span className="text-small tabular-nums text-fg-secondary">
                    {balance.weeklyRemaining.toLocaleString()} remaining
                  </span>
                </div>
                <Meter value={weeklyPct / 100} label="Weekly allowance used" />
              </>
            ) : (
              <div className="text-small text-fg-secondary pt-1">
                $249/mo BYOK active. Pulls deduct from your top-up balance.
              </div>
            )}
          </div>

          {/* Tile 2: Month 1 base pool */}
          <div className="rounded-lg border border-line bg-surface shadow-xs p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-small text-fg-secondary">
                Month 1 included pool
              </span>
              <span className="text-caption tabular-nums text-fg-tertiary">
                4 weeks × 2,000
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-kpi tabular-nums text-fg">
                {activeQuota.monthlyBaseUsed.toLocaleString()}{' '}
                <span className="text-body font-normal text-fg-tertiary">
                  / 8,000
                </span>
              </span>
              <span className="text-small tabular-nums text-fg-secondary">
                {balance.monthlyBaseRemaining.toLocaleString()} left
              </span>
            </div>
            <Meter value={monthlyPct / 100} label="Month 1 pool used" />
          </div>

          {/* Tile 3: Total available now + bonus credits */}
          <div className="rounded-lg border border-line bg-surface shadow-xs p-4 flex items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="text-small text-fg-secondary flex flex-wrap items-center gap-2">
                <span className="whitespace-nowrap">Available to pull now</span>
                {balance.bonusRemaining > 0 && (
                  <Badge tone="success">
                    +{balance.bonusRemaining.toLocaleString()} bonus
                  </Badge>
                )}
              </div>
              <div className="text-kpi tabular-nums text-fg">
                {balance.totalPullableNow.toLocaleString()}{' '}
                <span className="text-body font-normal text-fg-tertiary">
                  records
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsTopUpModalOpen(true)}
            >
              Add volume
            </Button>
          </div>
        </div>
      </section>

      {/* Modal: Tap Up Quota (+2k/$50, +5k/$75, +10k/$150) */}
      <QuotaTopUpModal
        isOpen={isTopUpModalOpen}
        onClose={() => setIsTopUpModalOpen(false)}
        tenantCode={activeQuota.tenantCode}
        tenantName={activeQuota.tenantName}
        clientContactName={repName || activeQuota.adminName}
        clientEmail={email || activeQuota.adminEmail}
      />
    </div>
  );
}
