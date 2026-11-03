/**
 * Appointmentlyy SDR — Multi-Tenant Custom Domain & White-Label Store
 *
 * Production Primary Host: app.appointmentlyy.com
 * Branded CNAME Alias:     cname.appointmentlyy.com (or cname.vercel-dns.com)
 * Customer Custom Domains: e.g., app.customerwebsiteurl.com, sdr.apexglobalbpo.com
 */

export type DnsVerificationState =
  | 'unconfigured'
  | 'pending_dns'
  | 'issuing_ssl'
  | 'active'
  | 'error';

export type SslCertificateState = 'none' | 'provisioning' | 'active' | 'error';

export interface WhiteLabelBranding {
  workspaceDisplayName: string;
  logoInitials: string;
  accentColor: 'zinc' | 'emerald' | 'blue' | 'indigo' | 'violet';
  supportEmail: string;
  loginHeadline: string;
  hidePoweredByBadge: boolean;
}

export interface TenantCustomDomainConfig {
  tenantCode: string;
  tenantName: string;
  primaryPlatformHost: string;      // "app.appointmentlyy.com"
  customDomain: string;             // e.g. "app.apexglobalbpo.com" or "app.customerwebsiteurl.com"
  subdomainPrefix: string;          // e.g. "app"
  rootDomain: string;               // e.g. "apexglobalbpo.com"
  cnameTarget: string;              // "cname.appointmentlyy.com"
  fallbackVercelTarget: string;     // "cname.vercel-dns.com"
  txtVerificationName: string;      // "_appointmentlyy-verify.apexglobalbpo.com"
  txtVerificationValue: string;     // "appy-verify=..."
  dnsStatus: DnsVerificationState;
  sslStatus: SslCertificateState;
  detectedCnameRecords?: string[];
  lastVerifiedAt?: string;
  statusMessage?: string;
  providerMode?: 'vercel_api' | 'cloudflare_saas' | 'dns_direct';
  branding: WhiteLabelBranding;
  updatedAt: string;
}

export const PRIMARY_PLATFORM_HOST =
  process.env.NEXT_PUBLIC_PRIMARY_APP_DOMAIN || 'app.appointmentlyy.com';

export const BRANDED_CNAME_TARGET =
  process.env.NEXT_PUBLIC_BRANDED_CNAME_TARGET || 'cname.appointmentlyy.com';

export const VERCEL_CNAME_TARGET = 'cname.vercel-dns.com';

const CUSTOM_DOMAINS_STORAGE_KEY = 'appointmentlyy_custom_domains_v1';
const SIMULATED_HOST_STORAGE_KEY = 'appointmentlyy_simulated_custom_host_v1';
const CUSTOM_DOMAINS_BROADCAST = 'appointmentlyy_custom_domains_sync';

export function normalizeHostname(raw: string): string {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
}

export function splitCustomDomainParts(hostname: string): {
  subdomainPrefix: string;
  rootDomain: string;
} {
  const clean = normalizeHostname(hostname);
  const parts = clean.split('.').filter(Boolean);
  if (parts.length >= 3) {
    return {
      subdomainPrefix: parts[0],
      rootDomain: parts.slice(1).join('.'),
    };
  }
  return {
    subdomainPrefix: 'app',
    rootDomain: clean || 'customerwebsiteurl.com',
  };
}

export function generateVerificationToken(tenantCode: string, domain: string): string {
  const cleanTenant = tenantCode.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanDom = normalizeHostname(domain).replace(/[^a-z0-9]/g, '').slice(0, 14);
  return `appy-verify-${cleanTenant}-${cleanDom}-9f82b4c1`;
}

export const INITIAL_CUSTOM_DOMAIN_CONFIGS: Record<string, TenantCustomDomainConfig> = {
  APPOINTMENTLYY: {
    tenantCode: 'APPOINTMENTLYY',
    tenantName: 'Appointmentlyy',
    primaryPlatformHost: PRIMARY_PLATFORM_HOST,
    customDomain: 'app.appointmentlyy.com',
    subdomainPrefix: 'app',
    rootDomain: 'appointmentlyy.com',
    cnameTarget: BRANDED_CNAME_TARGET,
    fallbackVercelTarget: VERCEL_CNAME_TARGET,
    txtVerificationName: '_appointmentlyy-verify.appointmentlyy.com',
    txtVerificationValue: 'appy-verify-appointmentlyy-master-hq',
    dnsStatus: 'active',
    sslStatus: 'active',
    detectedCnameRecords: ['cname.vercel-dns.com'],
    lastVerifiedAt: new Date().toISOString(),
    statusMessage: 'Primary Appointmentlyy Production Host Active (TLS 1.3)',
    providerMode: 'vercel_api',
    branding: {
      workspaceDisplayName: 'Appointmentlyy SDR',
      logoInitials: 'A',
      accentColor: 'zinc',
      supportEmail: 'emil@appointmentlyy.com',
      loginHeadline: 'Appointmentlyy Outbound SDR Operating System',
      hidePoweredByBadge: false,
    },
    updatedAt: new Date().toISOString(),
  },
  'APEX-GLOBAL': {
    tenantCode: 'APEX-GLOBAL',
    tenantName: 'Apex Global BPO',
    primaryPlatformHost: PRIMARY_PLATFORM_HOST,
    customDomain: 'app.apexglobalbpo.com',
    subdomainPrefix: 'app',
    rootDomain: 'apexglobalbpo.com',
    cnameTarget: BRANDED_CNAME_TARGET,
    fallbackVercelTarget: VERCEL_CNAME_TARGET,
    txtVerificationName: '_appointmentlyy-verify.apexglobalbpo.com',
    txtVerificationValue: generateVerificationToken('APEX-GLOBAL', 'app.apexglobalbpo.com'),
    dnsStatus: 'active',
    sslStatus: 'active',
    detectedCnameRecords: [BRANDED_CNAME_TARGET],
    lastVerifiedAt: new Date().toISOString(),
    statusMessage: 'CNAME verified & Let’s Encrypt SSL certificate active',
    providerMode: 'vercel_api',
    branding: {
      workspaceDisplayName: 'Apex Global Outbound Cloud',
      logoInitials: 'AG',
      accentColor: 'emerald',
      supportEmail: 'it-ops@apexglobalbpo.com',
      loginHeadline: 'Apex Global BPO — Dedicated SDR Calling Floor',
      hidePoweredByBadge: true,
    },
    updatedAt: new Date().toISOString(),
  },
  'SHORE-PARTNERS': {
    tenantCode: 'SHORE-PARTNERS',
    tenantName: 'ShorePartners BPO',
    primaryPlatformHost: PRIMARY_PLATFORM_HOST,
    customDomain: 'app.shorepartnersbpo.com',
    subdomainPrefix: 'app',
    rootDomain: 'shorepartnersbpo.com',
    cnameTarget: BRANDED_CNAME_TARGET,
    fallbackVercelTarget: VERCEL_CNAME_TARGET,
    txtVerificationName: '_appointmentlyy-verify.shorepartnersbpo.com',
    txtVerificationValue: generateVerificationToken(
      'SHORE-PARTNERS',
      'app.shorepartnersbpo.com'
    ),
    dnsStatus: 'pending_dns',
    sslStatus: 'provisioning',
    statusMessage: 'Awaiting CNAME propagation from customer DNS provider',
    providerMode: 'dns_direct',
    branding: {
      workspaceDisplayName: 'ShorePartners Dialer Portal',
      logoInitials: 'SP',
      accentColor: 'blue',
      supportEmail: 'admin@shorepartnersbpo.com',
      loginHeadline: 'ShorePartners BPO Outbound Workspace',
      hidePoweredByBadge: false,
    },
    updatedAt: new Date().toISOString(),
  },
  'CLOUD-STAFF': {
    tenantCode: 'CLOUD-STAFF',
    tenantName: 'CloudStaff Outsourcing',
    primaryPlatformHost: PRIMARY_PLATFORM_HOST,
    customDomain: 'sdr.cloudstaffoutsourcing.com',
    subdomainPrefix: 'sdr',
    rootDomain: 'cloudstaffoutsourcing.com',
    cnameTarget: BRANDED_CNAME_TARGET,
    fallbackVercelTarget: VERCEL_CNAME_TARGET,
    txtVerificationName: '_appointmentlyy-verify.cloudstaffoutsourcing.com',
    txtVerificationValue: generateVerificationToken(
      'CLOUD-STAFF',
      'sdr.cloudstaffoutsourcing.com'
    ),
    dnsStatus: 'active',
    sslStatus: 'active',
    detectedCnameRecords: [BRANDED_CNAME_TARGET],
    lastVerifiedAt: new Date().toISOString(),
    statusMessage: 'Custom subdomain verified & SSL active',
    providerMode: 'cloudflare_saas',
    branding: {
      workspaceDisplayName: 'CloudStaff SDR Suite',
      logoInitials: 'CS',
      accentColor: 'indigo',
      supportEmail: 'ops@cloudstaffoutsourcing.com',
      loginHeadline: 'CloudStaff Outsourcing — Revenue Floor',
      hidePoweredByBadge: true,
    },
    updatedAt: new Date().toISOString(),
  },
};

export function getAllCustomDomainConfigs(): Record<string, TenantCustomDomainConfig> {
  if (typeof window === 'undefined') {
    return INITIAL_CUSTOM_DOMAIN_CONFIGS;
  }
  try {
    const raw = localStorage.getItem(CUSTOM_DOMAINS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(
        CUSTOM_DOMAINS_STORAGE_KEY,
        JSON.stringify(INITIAL_CUSTOM_DOMAIN_CONFIGS)
      );
      return INITIAL_CUSTOM_DOMAIN_CONFIGS;
    }
    const parsed = JSON.parse(raw);
    return { ...INITIAL_CUSTOM_DOMAIN_CONFIGS, ...parsed };
  } catch {
    return INITIAL_CUSTOM_DOMAIN_CONFIGS;
  }
}

export function saveAllCustomDomainConfigs(
  configs: Record<string, TenantCustomDomainConfig>
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CUSTOM_DOMAINS_STORAGE_KEY, JSON.stringify(configs));
    window.dispatchEvent(new Event('storage'));
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(CUSTOM_DOMAINS_BROADCAST);
      bc.postMessage({ type: 'CUSTOM_DOMAINS_UPDATED', configs });
      bc.close();
    }
  } catch (err) {
    console.error('[CustomDomainStore] Failed to save domain configs:', err);
  }
}

export function getTenantCustomDomainConfig(
  tenantCode: string,
  tenantName: string = 'Customer Workspace'
): TenantCustomDomainConfig {
  const key = (tenantCode || 'APPOINTMENTLYY').trim().toUpperCase();
  const all = getAllCustomDomainConfigs();
  if (all[key]) return all[key];

  const defaultSlug = tenantName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 18) || 'customerwebsiteurl';
  const defaultDomain = `app.${defaultSlug}.com`;

  const created: TenantCustomDomainConfig = {
    tenantCode: key,
    tenantName,
    primaryPlatformHost: PRIMARY_PLATFORM_HOST,
    customDomain: defaultDomain,
    subdomainPrefix: 'app',
    rootDomain: `${defaultSlug}.com`,
    cnameTarget: BRANDED_CNAME_TARGET,
    fallbackVercelTarget: VERCEL_CNAME_TARGET,
    txtVerificationName: `_appointmentlyy-verify.${defaultSlug}.com`,
    txtVerificationValue: generateVerificationToken(key, defaultDomain),
    dnsStatus: 'unconfigured',
    sslStatus: 'none',
    statusMessage: 'Enter your custom domain (e.g., app.customerwebsiteurl.com) to generate DNS records.',
    branding: {
      workspaceDisplayName: `${tenantName} SDR`,
      logoInitials: tenantName
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'CW',
      accentColor: 'zinc',
      supportEmail: `support@${defaultSlug}.com`,
      loginHeadline: `${tenantName} — Outbound SDR Operating System`,
      hidePoweredByBadge: false,
    },
    updatedAt: new Date().toISOString(),
  };

  all[key] = created;
  saveAllCustomDomainConfigs(all);
  return created;
}

export function upsertTenantCustomDomainConfig(
  tenantCode: string,
  updates: Partial<TenantCustomDomainConfig>
): TenantCustomDomainConfig {
  const key = (tenantCode || 'APPOINTMENTLYY').trim().toUpperCase();
  const all = getAllCustomDomainConfigs();
  const existing = getTenantCustomDomainConfig(key, updates.tenantName);

  const nextCustomDomain = updates.customDomain
    ? normalizeHostname(updates.customDomain)
    : existing.customDomain;

  const { subdomainPrefix, rootDomain } = splitCustomDomainParts(nextCustomDomain);

  const updated: TenantCustomDomainConfig = {
    ...existing,
    ...updates,
    tenantCode: key,
    customDomain: nextCustomDomain,
    subdomainPrefix,
    rootDomain,
    txtVerificationName: `_appointmentlyy-verify.${rootDomain}`,
    txtVerificationValue: generateVerificationToken(key, nextCustomDomain),
    branding: {
      ...existing.branding,
      ...(updates.branding || {}),
    },
    updatedAt: new Date().toISOString(),
  };

  all[key] = updated;
  saveAllCustomDomainConfigs(all);
  return updated;
}

/**
 * Resolve a tenant configuration from an incoming Host header or simulated custom domain
 */
export function resolveTenantByHostname(
  rawHost: string
): TenantCustomDomainConfig | null {
  const cleanHost = normalizeHostname(rawHost);
  if (!cleanHost) return null;

  const all = getAllCustomDomainConfigs();
  const found = Object.values(all).find(
    (cfg) => normalizeHostname(cfg.customDomain) === cleanHost
  );
  return found || null;
}

/**
 * Simulated Custom Domain Preview Mode (allows testing how app.customerwebsiteurl.com behaves locally or on app.appointmentlyy.com)
 */
export function getSimulatedCustomHost(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(SIMULATED_HOST_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function setSimulatedCustomHost(hostname: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!hostname) {
      localStorage.removeItem(SIMULATED_HOST_STORAGE_KEY);
    } else {
      localStorage.setItem(SIMULATED_HOST_STORAGE_KEY, normalizeHostname(hostname));
    }
    window.dispatchEvent(new Event('storage'));
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(CUSTOM_DOMAINS_BROADCAST);
      bc.postMessage({ type: 'SIMULATED_HOST_UPDATED', hostname });
      bc.close();
    }
  } catch {
    // ignore
  }
}

export function subscribeToCustomDomains(
  callback: (configs: Record<string, TenantCustomDomainConfig>) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleStorage = () => {
    callback(getAllCustomDomainConfigs());
  };

  window.addEventListener('storage', handleStorage);
  let bc: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    bc = new BroadcastChannel(CUSTOM_DOMAINS_BROADCAST);
    bc.onmessage = () => {
      callback(getAllCustomDomainConfigs());
    };
  }

  return () => {
    window.removeEventListener('storage', handleStorage);
    if (bc) bc.close();
  };
}
