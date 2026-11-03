/**
 * Appointmentlyy ICP Data Cloud — Multi-Tenant Quota & Invoice Ledger
 *
 * Commercial & Billing Rules:
 * - Month 1 (New Client Onboarding — $2,500.00 One-Time Setup):
 *   • $2,500.00 Setup Fee (only charge in Month 1)
 *   • Month 1 Platform Access (BYOK): Included ($0.00)
 *   • Month 1 ICP Data Cloud Bonus: 8,000 Verified Records included ($0.00)
 *     paced at 2,000 records / week × 4 weeks.
 * - Month 2+ (Recurring BYOK Platform Access — $249.00/mo):
 *   • $249.00/mo covers Platform Access with BYOK (excludes free ICP credits)
 *   • Clients choose & pay for ICP Volume Packs:
 *     - +2,000 Verified Records = $50.00 USD
 *     - +5,000 Verified Records = $75.00 USD
 *     - +10,000 Verified Records = $150.00 USD
 */

export type BillingCycleStage = 'month1' | 'month2+';

export interface TopUpPackage {
  id: 'pack_2k' | 'pack_5k' | 'pack_10k';
  records: 2000 | 5000 | 10000;
  priceUsd: 50 | 75 | 150;
  label: string;
  badge?: string;
  costPerRecord: string;
}

export const ICP_TOPUP_PACKAGES: TopUpPackage[] = [
  {
    id: 'pack_2k',
    records: 2000,
    priceUsd: 50,
    label: '+2,000 Verified Records',
    costPerRecord: '$0.025 / record',
  },
  {
    id: 'pack_5k',
    records: 5000,
    priceUsd: 75,
    label: '+5,000 Verified Records',
    badge: 'Most Popular',
    costPerRecord: '$0.015 / record',
  },
  {
    id: 'pack_10k',
    records: 10000,
    priceUsd: 150,
    label: '+10,000 Verified Records',
    badge: 'Best Value',
    costPerRecord: '$0.015 / record',
  },
];

export const WISE_PAYMENT_LINK = 'https://wise.com/pay/me/emilhalilih';
export const WISE_TAG = '@emilhalilih';
export const WISE_QR_PATH = '/images/wise-qr-emilhalilih.jpg';
export const OFFICIAL_LOGO_PATH = '/appointmentlyy-logo.png';

export interface TenantQuotaState {
  tenantCode: string;
  tenantName: string;
  adminName: string;
  adminEmail: string;
  billingStage: BillingCycleStage; // 'month1' gets 2k/wk (8k/mo); 'month2+' gets 0 free base + paid volume packs
  currentWeekNumber: 1 | 2 | 3 | 4;
  weeklyAllowance: number;         // 2000 in Month 1, 0 in Month 2+
  weeklyUsed: number;              // Used in current 7-day rolling window
  monthlyIncludedAllowance: number;// 8000 in Month 1, 0 in Month 2+
  monthlyBaseUsed: number;         // Total used from the Month 1 8,000 pool
  bonusTopUpBalance: number;       // Extra paid credits (+2k, +5k, +10k) that roll over
  totalLifetimePulled: number;
  weekResetDateIso: string;        // Next Monday 00:00 UTC
  repsRoster: string[];            // Tenant's active SDR reps for equal distribution
  updatedAt: string;
}

export interface InvoiceLineItem {
  description: string;
  subtext?: string;
  amountUsd: number;
  isIncludedBonus?: boolean;
}

export type InvoiceScenarioType = 'onboarding_month1' | 'renewal_month2' | 'icp_topup' | 'custom';

export interface SystemInvoice {
  id: string;
  invoiceNumber: string; // e.g. "INV-2026-1001"
  tenantCode: string;
  tenantName: string;
  clientContactName: string;
  clientEmail: string;
  scenario: InvoiceScenarioType;
  issueDate: string;
  dueDate: string;
  status: 'Paid' | 'Awaiting Wise Transfer' | 'Past Due' | 'Draft';
  totalAmountUsd: number;
  creditsToProvision: number; // e.g. 8000 for Month 1 onboarding, or 2000/5000/10000 for topup
  creditsProvisioned: boolean;
  ticketId?: string;
  lineItems: InvoiceLineItem[];
  notes?: string;
  createdAt: string;
}

const QUOTA_STORAGE_KEY = 'appointmentlyy_icp_tenant_quotas_v1';
const INVOICES_STORAGE_KEY = 'appointmentlyy_system_invoices_v1';
const MASTER_KEY_STORAGE = 'appointmentlyy_data_cloud_master_key_v1';
const QUOTA_BROADCAST = 'appointmentlyy_icp_quota_sync';

function getNextMondayIso(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  const nextMon = new Date(now);
  nextMon.setDate(now.getDate() + diff);
  nextMon.setHours(0, 0, 0, 0);
  return nextMon.toISOString();
}

export const INITIAL_TENANT_QUOTAS: Record<string, TenantQuotaState> = {
  'APPOINTMENTLYY': {
    tenantCode: 'APPOINTMENTLYY',
    tenantName: 'Appointmentlyy',
    adminName: 'Emil Halili',
    adminEmail: 'emil@appointmentlyy.com',
    billingStage: 'month1',
    currentWeekNumber: 1,
    weeklyAllowance: 50000,
    weeklyUsed: 240,
    monthlyIncludedAllowance: 200000,
    monthlyBaseUsed: 240,
    bonusTopUpBalance: 10000,
    totalLifetimePulled: 1420,
    weekResetDateIso: getNextMondayIso(),
    repsRoster: ['Emil Halili', 'Julian Vance', 'Sarah Jenkins', 'Marcus Chen'],
    updatedAt: new Date().toISOString(),
  },
  'APEX-GLOBAL': {
    tenantCode: 'APEX-GLOBAL',
    tenantName: 'Apex Global BPO',
    adminName: 'Julian Vance',
    adminEmail: 'julian@apexglobalbpo.com',
    billingStage: 'month1',
    currentWeekNumber: 2,
    weeklyAllowance: 2000,
    weeklyUsed: 650,
    monthlyIncludedAllowance: 8000,
    monthlyBaseUsed: 2650,
    bonusTopUpBalance: 0,
    totalLifetimePulled: 2650,
    weekResetDateIso: getNextMondayIso(),
    repsRoster: ['Julian Vance', 'Sofia Reyes', 'Marco Santos', 'Liam O\'Connor'],
    updatedAt: new Date().toISOString(),
  },
  'SHORE-PARTNERS': {
    tenantCode: 'SHORE-PARTNERS',
    tenantName: 'ShorePartners BPO',
    adminName: 'Sarah Jenkins',
    adminEmail: 'sjenkins@shorepartners.ph',
    billingStage: 'month1',
    currentWeekNumber: 1,
    weeklyAllowance: 2000,
    weeklyUsed: 400,
    monthlyIncludedAllowance: 8000,
    monthlyBaseUsed: 400,
    bonusTopUpBalance: 2000,
    totalLifetimePulled: 2400,
    weekResetDateIso: getNextMondayIso(),
    repsRoster: ['Sarah Jenkins', 'Miguel Cruz', 'Hannah Lim', 'David Tan'],
    updatedAt: new Date().toISOString(),
  },
  'CLOUD-STAFF': {
    tenantCode: 'CLOUD-STAFF',
    tenantName: 'CloudStaff Outsourcing',
    adminName: 'Marcus Vance',
    adminEmail: 'marcus@cloudstaff.ph',
    billingStage: 'month2+',
    currentWeekNumber: 1,
    weeklyAllowance: 0,
    weeklyUsed: 0,
    monthlyIncludedAllowance: 0,
    monthlyBaseUsed: 8000,
    bonusTopUpBalance: 3850,
    totalLifetimePulled: 9150,
    weekResetDateIso: getNextMondayIso(),
    repsRoster: ['Marcus Vance', 'Bianca Navarro', 'Kevin Mendoza', 'Chloe Villanueva'],
    updatedAt: new Date().toISOString(),
  },
  'VANGUARD-PH': {
    tenantCode: 'VANGUARD-PH',
    tenantName: 'Vanguard BPO Solutions',
    adminName: 'Paolo Reyes',
    adminEmail: 'paolo@vanguard.ph',
    billingStage: 'month1',
    currentWeekNumber: 1,
    weeklyAllowance: 2000,
    weeklyUsed: 120,
    monthlyIncludedAllowance: 8000,
    monthlyBaseUsed: 120,
    bonusTopUpBalance: 0,
    totalLifetimePulled: 120,
    weekResetDateIso: getNextMondayIso(),
    repsRoster: ['Paolo Reyes', 'Andrea Gomez', 'Rafael Dizon', 'Bea Alonzo'],
    updatedAt: new Date().toISOString(),
  },
};

export const INITIAL_SYSTEM_INVOICES: SystemInvoice[] = [
  {
    id: 'inv_seed_1001',
    invoiceNumber: 'INV-2026-1001',
    tenantCode: 'APEX-GLOBAL',
    tenantName: 'Apex Global BPO',
    clientContactName: 'Julian Vance',
    clientEmail: 'julian@apexglobalbpo.com',
    scenario: 'onboarding_month1',
    issueDate: 'Oct 20, 2026',
    dueDate: 'Oct 20, 2026',
    status: 'Paid',
    totalAmountUsd: 2500,
    creditsToProvision: 8000,
    creditsProvisioned: true,
    lineItems: [
      {
        description: 'Platform Setup & Workspace Deployment',
        subtext: 'One-time onboarding & multi-tenant SDR workspace configuration',
        amountUsd: 2500,
      },
      {
        description: 'Monthly Platform Access (BYOK) — Month 1',
        subtext: 'Included in Month 1 ($249.00/mo begins Month 2)',
        amountUsd: 0,
        isIncludedBonus: true,
      },
      {
        description: 'ICP Data Cloud — 8,000 Verified Records (Month 1)',
        subtext: '2,000 records/week × 4 weeks included in Month 1',
        amountUsd: 0,
        isIncludedBonus: true,
      },
    ],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
  },
  {
    id: 'inv_seed_1002',
    invoiceNumber: 'INV-2026-1002',
    tenantCode: 'CLOUD-STAFF',
    tenantName: 'CloudStaff Outsourcing',
    clientContactName: 'Marcus Vance',
    clientEmail: 'marcus@cloudstaff.ph',
    scenario: 'renewal_month2',
    issueDate: 'Nov 01, 2026',
    dueDate: 'Nov 05, 2026',
    status: 'Paid',
    totalAmountUsd: 324,
    creditsToProvision: 5000,
    creditsProvisioned: true,
    lineItems: [
      {
        description: 'Monthly Platform Access (BYOK)',
        subtext: 'Monthly workspace subscription (excludes ICP credits)',
        amountUsd: 249,
      },
      {
        description: 'ICP Data Cloud — +5,000 Verified Records',
        subtext: 'Monthly ICP list building volume add-on ($75 tier)',
        amountUsd: 75,
      },
    ],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
  },
  {
    id: 'inv_seed_1003',
    invoiceNumber: 'INV-2026-1003',
    tenantCode: 'SHORE-PARTNERS',
    tenantName: 'ShorePartners BPO',
    clientContactName: 'Sarah Jenkins',
    clientEmail: 'sjenkins@shorepartners.ph',
    scenario: 'icp_topup',
    issueDate: 'Nov 02, 2026',
    dueDate: 'Nov 04, 2026',
    status: 'Awaiting Wise Transfer',
    totalAmountUsd: 75,
    creditsToProvision: 5000,
    creditsProvisioned: false,
    ticketId: 'TKT-2026-1049',
    lineItems: [
      {
        description: 'ICP Data Cloud Quota Tap-Up — +5,000 Verified Records',
        subtext: 'Additional verified B2B decision-maker records credited upon confirmation',
        amountUsd: 75,
      },
    ],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
  },
];

/**
 * Normalize tenant code key
 */
export function normalizeTenantKey(codeOrName?: string): string {
  if (!codeOrName) return 'APEX-GLOBAL';
  const clean = codeOrName.trim().toUpperCase();
  if (clean === 'APEX' || clean.includes('APEX')) return 'APEX-GLOBAL';
  if (clean.includes('SHORE')) return 'SHORE-PARTNERS';
  if (clean.includes('CLOUD')) return 'CLOUD-STAFF';
  if (clean.includes('VANGUARD')) return 'VANGUARD-PH';
  if (clean.includes('APPOINTMENTLYY')) return 'APPOINTMENTLYY';
  return clean;
}

/**
 * Read all tenant quota states
 */
export function getAllTenantQuotas(): Record<string, TenantQuotaState> {
  if (typeof window === 'undefined') return INITIAL_TENANT_QUOTAS;
  try {
    const raw = localStorage.getItem(QUOTA_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(INITIAL_TENANT_QUOTAS));
      return INITIAL_TENANT_QUOTAS;
    }
    return { ...INITIAL_TENANT_QUOTAS, ...JSON.parse(raw) };
  } catch {
    return INITIAL_TENANT_QUOTAS;
  }
}

/**
 * Save all tenant quota states and broadcast
 */
export function saveAllTenantQuotas(quotas: Record<string, TenantQuotaState>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(quotas));
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(QUOTA_BROADCAST);
      ch.postMessage({ type: 'QUOTA_UPDATED', quotas });
      ch.close();
    }
  } catch (err) {
    console.warn('[IcpQuotaStore] Failed to save tenant quotas:', err);
  }
}

/**
 * Get quota state for a specific tenant (auto-initializes Month 1 2k/wk if new)
 */
export function getTenantQuota(tenantCode?: string, tenantName?: string): TenantQuotaState {
  const key = normalizeTenantKey(tenantCode || tenantName);
  const all = getAllTenantQuotas();
  if (all[key]) return all[key];

  const fresh: TenantQuotaState = {
    tenantCode: key,
    tenantName: tenantName || key,
    adminName: 'Account Admin',
    adminEmail: `admin@${key.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
    billingStage: 'month1',
    currentWeekNumber: 1,
    weeklyAllowance: 2000,
    weeklyUsed: 0,
    monthlyIncludedAllowance: 8000,
    monthlyBaseUsed: 0,
    bonusTopUpBalance: 0,
    totalLifetimePulled: 0,
    weekResetDateIso: getNextMondayIso(),
    repsRoster: ['Rep 1', 'Rep 2', 'Rep 3', 'Rep 4'],
    updatedAt: new Date().toISOString(),
  };
  all[key] = fresh;
  saveAllTenantQuotas(all);
  return fresh;
}

/**
 * Compute how many records a tenant can pull right now
 */
export function getAvailablePullBalance(quota: TenantQuotaState): {
  weeklyRemaining: number;
  monthlyBaseRemaining: number;
  bonusRemaining: number;
  totalPullableNow: number;
} {
  const monthlyBaseRemaining = Math.max(0, quota.monthlyIncludedAllowance - quota.monthlyBaseUsed);
  const weeklyRemaining =
    quota.billingStage === 'month1'
      ? Math.min(monthlyBaseRemaining, Math.max(0, quota.weeklyAllowance - quota.weeklyUsed))
      : 0;
  const bonusRemaining = Math.max(0, quota.bonusTopUpBalance);
  return {
    weeklyRemaining,
    monthlyBaseRemaining,
    bonusRemaining,
    totalPullableNow: weeklyRemaining + bonusRemaining,
  };
}

/**
 * Deduct pulled records from a tenant's Weekly Allowance first, then Bonus Top-Up Balance
 */
export function deductTenantQuota(
  tenantCode: string,
  recordsCount: number
): { success: boolean; updatedQuota: TenantQuotaState; error?: string } {
  const key = normalizeTenantKey(tenantCode);
  const all = getAllTenantQuotas();
  const current = all[key] || getTenantQuota(key);
  const avail = getAvailablePullBalance(current);

  if (recordsCount > avail.totalPullableNow) {
    return {
      success: false,
      updatedQuota: current,
      error: `Insufficient weekly/top-up quota. Available now: ${avail.totalPullableNow.toLocaleString()} records (Requested: ${recordsCount.toLocaleString()}). Please tap up your quota.`,
    };
  }

  let remainingToDeduct = recordsCount;
  let nextWeeklyUsed = current.weeklyUsed;
  let nextMonthlyBaseUsed = current.monthlyBaseUsed;
  let nextBonus = current.bonusTopUpBalance;

  if (avail.weeklyRemaining > 0) {
    const fromWeekly = Math.min(avail.weeklyRemaining, remainingToDeduct);
    nextWeeklyUsed += fromWeekly;
    nextMonthlyBaseUsed += fromWeekly;
    remainingToDeduct -= fromWeekly;
  }

  if (remainingToDeduct > 0) {
    nextBonus = Math.max(0, nextBonus - remainingToDeduct);
  }

  const updated: TenantQuotaState = {
    ...current,
    weeklyUsed: nextWeeklyUsed,
    monthlyBaseUsed: nextMonthlyBaseUsed,
    bonusTopUpBalance: nextBonus,
    totalLifetimePulled: current.totalLifetimePulled + recordsCount,
    updatedAt: new Date().toISOString(),
  };

  all[key] = updated;
  saveAllTenantQuotas(all);
  return { success: true, updatedQuota: updated };
}

/**
 * Credit bonus Top-Up records (or Month 1 8,000 onboarding records) to a tenant
 */
export function creditTenantRecords(
  tenantCode: string,
  recordsToAdd: number,
  options?: { setBillingStage?: BillingCycleStage; resetMonth1?: boolean }
): TenantQuotaState {
  const key = normalizeTenantKey(tenantCode);
  const all = getAllTenantQuotas();
  const current = all[key] || getTenantQuota(key);

  const updated: TenantQuotaState = {
    ...current,
    billingStage: options?.setBillingStage || current.billingStage,
    weeklyAllowance:
      (options?.setBillingStage || current.billingStage) === 'month1' ? 2000 : 0,
    monthlyIncludedAllowance:
      (options?.setBillingStage || current.billingStage) === 'month1' ? 8000 : 0,
    weeklyUsed: options?.resetMonth1 ? 0 : current.weeklyUsed,
    monthlyBaseUsed: options?.resetMonth1 ? 0 : current.monthlyBaseUsed,
    bonusTopUpBalance: options?.resetMonth1
      ? current.bonusTopUpBalance
      : current.bonusTopUpBalance + recordsToAdd,
    updatedAt: new Date().toISOString(),
  };

  all[key] = updated;
  saveAllTenantQuotas(all);
  return updated;
}

/**
 * Update a tenant's SDR Rep Roster (used for Equal Rep Distribution)
 */
export function updateTenantRepsRoster(tenantCode: string, reps: string[]): TenantQuotaState {
  const key = normalizeTenantKey(tenantCode);
  const all = getAllTenantQuotas();
  const current = all[key] || getTenantQuota(key);
  const updated: TenantQuotaState = {
    ...current,
    repsRoster: reps,
    updatedAt: new Date().toISOString(),
  };
  all[key] = updated;
  saveAllTenantQuotas(all);
  return updated;
}

/**
 * Read all stored system invoices
 */
export function getStoredInvoices(): SystemInvoice[] {
  if (typeof window === 'undefined') return INITIAL_SYSTEM_INVOICES;
  try {
    const raw = localStorage.getItem(INVOICES_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(INITIAL_SYSTEM_INVOICES));
      return INITIAL_SYSTEM_INVOICES;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_SYSTEM_INVOICES;
  } catch {
    return INITIAL_SYSTEM_INVOICES;
  }
}

/**
 * Save system invoices
 */
export function saveStoredInvoices(invoices: SystemInvoice[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(invoices));
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(QUOTA_BROADCAST);
      ch.postMessage({ type: 'INVOICES_UPDATED', invoices });
      ch.close();
    }
  } catch (err) {
    console.warn('[IcpQuotaStore] Failed to save invoices:', err);
  }
}

/**
 * Add a newly generated System Invoice
 */
export function addSystemInvoice(invoice: SystemInvoice): SystemInvoice[] {
  const all = getStoredInvoices();
  const next = [invoice, ...all.filter((i) => i.id !== invoice.id)];
  saveStoredInvoices(next);
  return next;
}

/**
 * Mark a System Invoice as Paid and automatically provision its ICP credits to the tenant
 */
export function markInvoicePaidAndProvision(invoiceId: string): {
  invoice: SystemInvoice | null;
  updatedQuota: TenantQuotaState | null;
} {
  const invoices = getStoredInvoices();
  const idx = invoices.findIndex((i) => i.id === invoiceId || i.invoiceNumber === invoiceId);
  if (idx === -1) return { invoice: null, updatedQuota: null };

  const target = invoices[idx];
  let updatedQuota: TenantQuotaState | null = null;

  if (!target.creditsProvisioned && target.creditsToProvision > 0) {
    if (target.scenario === 'onboarding_month1') {
      updatedQuota = creditTenantRecords(target.tenantCode, 0, {
        setBillingStage: 'month1',
        resetMonth1: true,
      });
    } else {
      updatedQuota = creditTenantRecords(target.tenantCode, target.creditsToProvision);
    }
  }

  const updatedInvoice: SystemInvoice = {
    ...target,
    status: 'Paid',
    creditsProvisioned: true,
  };

  invoices[idx] = updatedInvoice;
  saveStoredInvoices(invoices);
  return { invoice: updatedInvoice, updatedQuota };
}

/**
 * Super Admin Master API Key helper (Client vault fallback to server env)
 */
export function getSuperAdminMasterDataKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(MASTER_KEY_STORAGE) || '';
}

export function setSuperAdminMasterDataKey(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MASTER_KEY_STORAGE, key.trim());
}

/**
 * Subscribe to real-time quota & invoice changes
 */
export function subscribeToQuotaStore(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleStorage = (e: StorageEvent) => {
    if (e.key === QUOTA_STORAGE_KEY || e.key === INVOICES_STORAGE_KEY) {
      callback();
    }
  };
  window.addEventListener('storage', handleStorage);

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(QUOTA_BROADCAST);
    channel.onmessage = () => callback();
  }

  return () => {
    window.removeEventListener('storage', handleStorage);
    if (channel) channel.close();
  };
}
