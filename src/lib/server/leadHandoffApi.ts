/** Shared helpers for the /api/leads/handoffs route handlers (route files may only export handlers). */
import { PLATFORM_TENANT_CODE } from '@/lib/roles';
import { hasRank, type ServerSession } from '@/lib/server/session';

export { fail, json, readJsonObject, requireSession } from '@/lib/server/emailTemplateApi';

/**
 * Who may send leads to a teammate: Admin and above in their own workspace. In the platform's own
 * workspace (shared by the owner, staff and the demo logins) only platform staff may, so a demo
 * Admin login can never push leads into a colleague's Contacts.
 */
export function canSendHandoffs(s: ServerSession): boolean {
  if (s.tenantCode === PLATFORM_TENANT_CODE) return s.isPlatformAdmin;
  return hasRank(s, 'Admin');
}

/** Shown to the sender when the store cannot be reached (for example the table has not been created yet). */
export const HANDOFF_UNAVAILABLE =
  'Assigning leads to a teammate is not available right now. Nothing was sent. Please try again later, or export a CSV for now.';
