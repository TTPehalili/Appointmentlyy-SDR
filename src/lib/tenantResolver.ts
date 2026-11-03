/**
 * Maps a work-email domain to a tenant workspace. Shared by the login, invite and verify flows.
 */
export interface ResolvedTenant {
  name: string;
  code: string;
}

const KNOWN_TENANTS: Record<string, ResolvedTenant> = {
  'appointmentlyy.com': { name: 'Appointmentlyy', code: 'APPOINTMENTLYY' },
  'apexglobalbpo.ph': { name: 'Apex Global BPO', code: 'APEX-GLOBAL' },
  'apexglobalbpo.com': { name: 'Apex Global BPO', code: 'APEX-GLOBAL' },
  'apexglobal.ph': { name: 'Apex Global BPO', code: 'APEX-GLOBAL' },
  'shorepartners.ph': { name: 'ShorePartners BPO', code: 'SHORE-PARTNERS' },
  'shorepartnersbpo.com': { name: 'ShorePartners BPO', code: 'SHORE-PARTNERS' },
  'cloudstaff.ph': { name: 'CloudStaff Outsourcing', code: 'CLOUD-STAFF' },
  'cloudstaffoutsourcing.com': { name: 'CloudStaff Outsourcing', code: 'CLOUD-STAFF' },
  'vanguard.ph': { name: 'Vanguard BPO Solutions', code: 'VANGUARD-PH' },
  'taskforce.ph': { name: 'TaskForce Manila', code: 'TASKFORCE-MNL' },
};

export function resolveTenantFromEmail(email: string): ResolvedTenant {
  const parts = email.trim().toLowerCase().split('@');
  if (parts.length < 2 || !parts[1]) {
    return { name: 'Appointmentlyy', code: 'APPOINTMENTLYY' };
  }
  const domain = parts[1];
  if (KNOWN_TENANTS[domain]) return KNOWN_TENANTS[domain];
  const root = domain.split('.')[0];
  const formatted = root.charAt(0).toUpperCase() + root.slice(1);
  return { name: formatted, code: `${root.toUpperCase()}-TENANT` };
}

