import type { Permission } from '@/lib/permissions';
import type { AdminControlSection } from '@/components/AdminControlCentre';

export interface AdminNavItem {
  id: string;
  label: string;
  href: string;
  permission: Permission;
  /** Section rendered by the shared AdminControlCentre instance (kept mounted across sections). */
  controlSection?: AdminControlSection;
  /** Old names, so ⌘K finds them. */
  keywords?: string;
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

/**
 * Admin settings shell (redesign spec 3.4). Every management tool lives here, at most
 * two clicks away: Admin, then the section.
 * DESIGN-NOTE: sections without an existing tool (General, Teams, Pipeline stages,
 * Buyer personas, Cadences, Import/export, DNC) are left out until they exist, rather
 * than shipping empty pages.
 */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { id: 'members', label: 'Members & seats', href: '/admin/members', permission: 'adminOrg', controlSection: 'people', keywords: 'people seats users invite' },
      { id: 'rep-roster', label: 'Rep roster', href: '/admin/rep-roster', permission: 'admin', controlSection: 'reps', keywords: 'sales reps floor performance' },
      { id: 'certification', label: 'Certification', href: '/admin/reps', permission: 'admin', keywords: 'reps certification trials certificate' },
      { id: 'roles', label: 'Roles & permissions', href: '/admin/roles', permission: 'adminOrg', controlSection: 'access', keywords: 'module access permission matrix' },
    ],
  },
  {
    label: 'Sales setup',
    items: [
      { id: 'playbooks', label: 'Playbooks', href: '/admin/frameworks', permission: 'admin', keywords: 'upload playbook ingestion ai vectorizer frameworks' },
      { id: 'call-outcomes', label: 'Call outcomes', href: '/admin/call-outcomes', permission: 'admin', keywords: 'call dispositions campaign rules' },
      { id: 'training', label: 'Training modules', href: '/admin/training', permission: 'admin', controlSection: 'modules', keywords: 'modules courses' },
    ],
  },
  {
    label: 'Data',
    items: [
      { id: 'lead-credits', label: 'Lead credits & quota', href: '/admin/lead-credits', permission: 'admin', keywords: 'icp quota top up credits records stage master engine key' },
      { id: 'leads', label: 'Leads & cadences', href: '/admin/leads', permission: 'admin', controlSection: 'leads', keywords: 'leads cadence crm csv' },
      { id: 'campaign-leads', label: 'Campaign leads', href: '/admin/campaigns/enterprise-outbound/leads', permission: 'admin', keywords: 'campaign batch assign' },
    ],
  },
  {
    label: 'Automation',
    items: [{ id: 'workflows', label: 'Workflows', href: '/admin/workflows', permission: 'admin', keywords: 'workflow studio automation' }],
  },
  {
    label: 'Integrations',
    items: [
      { id: 'crm', label: 'CRM & field mapping', href: '/admin/crm', permission: 'adminOrg', keywords: 'universal crm mapper hubspot salesforce' },
      { id: 'mcp', label: 'MCP server & webhooks', href: '/admin/mcp', permission: 'adminOrg', keywords: 'mcp ingress api developer gateway' },
      { id: 'ai-providers', label: 'AI providers', href: '/admin/ai-providers', permission: 'adminOrg', keywords: 'byok ai vault keys' },
    ],
  },
  {
    label: 'Account',
    items: [
      { id: 'domains', label: 'Branding & domains', href: '/admin/domains', permission: 'adminOrg', keywords: 'custom domains white-label dns' },
      { id: 'billing', label: 'Billing', href: '/admin/billing', permission: 'adminOrg', keywords: 'billing invoicing invoices plan' },
      { id: 'support', label: 'Support', href: '/admin/support', permission: 'admin', keywords: 'support tickets help desk' },
      { id: 'audit', label: 'Audit log', href: '/admin/audit', permission: 'adminOrg', controlSection: 'audit', keywords: 'audit trail security events' },
    ],
  },
];

/** Platform Console (Super Admin only): cross-tenant tools. */
export const PLATFORM_NAV: AdminNavGroup[] = [
  {
    label: 'Platform',
    items: [
      { id: 'tenants', label: 'Tenants', href: '/platform/tenants', permission: 'platform', controlSection: 'tenants', keywords: 'tenants client access provisioning new workspace' },
      { id: 'support-desk', label: 'Support desk', href: '/platform/support', permission: 'platform', keywords: 'ticket triage admin desk' },
      { id: 'ops-intel', label: 'Operations intel', href: '/platform/ops-intel', permission: 'platform', keywords: 'executive assistant' },
      { id: 'job-signals', label: 'Job signals radar', href: '/platform/job-signals', permission: 'platform', keywords: 'job radar hiring signals' },
      { id: 'flags', label: 'Feature flags', href: '/platform/flags', permission: 'platform', keywords: 'flags rollout' },
    ],
  },
];

export function findNavItem(groups: AdminNavGroup[], pathname: string): AdminNavItem | undefined {
  const all = groups.flatMap((g) => g.items);
  // Longest matching prefix wins (e.g. /admin/campaigns/... vs /admin).
  return all
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`) || (i.id === 'campaign-leads' && pathname.startsWith('/admin/campaigns')))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
