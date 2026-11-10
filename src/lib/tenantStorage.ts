/**
 * Browser storage that belongs to one person in one workspace.
 *
 * Only one person+workspace's data is "live" in localStorage at a time. When the signed-in person
 * or workspace changes, the live data is packed into an archive for its owner and the new owner's
 * archive (if any) is unpacked. So:
 * - nobody sees another person's or another workspace's contacts, inbox, pipeline or settings;
 * - switching workspace or signing out never deletes data that so far only lives in this browser.
 *
 * Device preferences (theme, sidebar, Copilot panel, practice voice) are not touched.
 * When adding a new localStorage key that holds workspace data, add it to DATA_KEYS.
 */

const SESSION_KEYS = [
  'user_role',
  'sdr_user_email',
  'sdr_rep_name',
  'sdr_tenant_name',
  'sdr_tenant_code',
  'sdr_tenant_headcount',
  'sdr_is_authenticated',
  'appointmentlyy_user_email',
  'appointmentlyy_tenant_name',
  'appointmentlyy_tenant_code',
  'appointmentlyy_user_role',
];

const DATA_KEYS = [
  'appointmentlyy_sdr_global_contacts_v4',
  'appointmentlyy_sdr_icp_folders_v4',
  'appointmentlyy_sdr_pipeline_stages_v1',
  'appointmentlyy_sdr_activity_log_v1',
  'appointmentlyy_callback_tasks_v1',
  'appointmentlyy_call_dispositions_v1',
  'appointmentlyy_icp_tenant_quotas_v1',
  'appointmentlyy_system_invoices_v1',
  'appointmentlyy_data_cloud_master_key_v1',
  'appointmentlyy_custom_domains_v1',
  'appointmentlyy_simulated_custom_host_v1',
  'appointmentlyy_outbound_frameworks',
  'appointmentlyy_anti_sales_ctas',
  'appointmentlyy_role_permissions_v1',
  'appointmentlyy_user_passwords_v1',
  'sdr_unified_inbox_emails',
  'sdr_target_recipient_email',
  'sdr_active_csv_leads',
  'appy_vicidial_agent_user',
  'appy_vicidial_outcome_codes',
  'appy_recent_workspaces',
  'appy_tenant_brand',
];
const DATA_PREFIXES = ['tenant_'];

const SESSION_STORAGE_KEYS = ['appointmentlyy_icp_target_tenant'];
const SESSION_STORAGE_PREFIXES = ['eval-'];

/** Whose data is currently live in this browser: "email|TENANT". */
export const STORAGE_OWNER_KEY = 'appy_storage_owner';
const ARCHIVE_PREFIX = 'appy_ws_archive::';

const ownerOf = (email: string, tenantCode: string) => `${email.trim().toLowerCase()}|${tenantCode}`;

function dataKeys(): string[] {
  const keys = new Set(DATA_KEYS.filter((k) => localStorage.getItem(k) !== null));
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && DATA_PREFIXES.some((p) => k.startsWith(p))) keys.add(k);
  }
  return [...keys];
}

/** Pack the live workspace data under its owner's archive key. */
function archive(owner: string) {
  const keys = dataKeys();
  if (keys.length === 0) return;
  const snapshot: Record<string, string> = {};
  for (const k of keys) snapshot[k] = localStorage.getItem(k) as string;
  try {
    localStorage.setItem(ARCHIVE_PREFIX + owner, JSON.stringify(snapshot));
  } catch (err) {
    // Storage full: the data can't be kept for later, but it must still leave the live slots.
    console.warn('[tenantStorage] could not archive workspace data for', owner, err);
  }
}

function restore(owner: string) {
  const raw = localStorage.getItem(ARCHIVE_PREFIX + owner);
  if (!raw) return;
  try {
    const snapshot = JSON.parse(raw) as Record<string, string>;
    for (const [k, v] of Object.entries(snapshot)) {
      if (DATA_KEYS.includes(k) || DATA_PREFIXES.some((p) => k.startsWith(p))) localStorage.setItem(k, v);
    }
    localStorage.removeItem(ARCHIVE_PREFIX + owner);
  } catch (err) {
    console.warn('[tenantStorage] could not restore workspace data for', owner, err);
  }
}

function clearLive() {
  for (const k of dataKeys()) localStorage.removeItem(k);
  for (const k of SESSION_KEYS) localStorage.removeItem(k);
  for (const k of SESSION_STORAGE_KEYS) sessionStorage.removeItem(k);
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const k = sessionStorage.key(i);
    if (k && SESSION_STORAGE_PREFIXES.some((p) => k.startsWith(p))) sessionStorage.removeItem(k);
  }
}

/** Owner of the live data, including browsers from before the owner marker existed. */
function currentOwner(): string | null {
  const marked = localStorage.getItem(STORAGE_OWNER_KEY);
  if (marked) return marked;
  const email = localStorage.getItem('sdr_user_email');
  const tenant = localStorage.getItem('sdr_tenant_code');
  return email && tenant ? ownerOf(email, tenant) : null;
}

export function getStorageOwner(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_OWNER_KEY);
  } catch {
    return null;
  }
}

/** Sign-out: put this person's data away (kept for their next sign-in) and empty the live slots. */
export function clearTenantStorage() {
  if (typeof window === 'undefined') return;
  try {
    const owner = currentOwner();
    if (owner) archive(owner);
    clearLive();
    localStorage.removeItem(STORAGE_OWNER_KEY);
  } catch {
    // storage unavailable (private mode): nothing to clear
  }
}

/**
 * Call with the identity the server confirmed. If the live data belongs to someone else or another
 * workspace, it is archived and this owner's data restored. Returns true when the live data changed
 * (screens holding old data in memory should reload).
 */
export function claimTenantStorage(email: string, tenantCode: string): boolean {
  if (typeof window === 'undefined') return false;
  const owner = ownerOf(email, tenantCode);
  try {
    const current = currentOwner();
    if (current === owner) {
      localStorage.setItem(STORAGE_OWNER_KEY, owner);
      return false;
    }
    if (current) archive(current);
    clearLive();
    restore(owner);
    localStorage.setItem(STORAGE_OWNER_KEY, owner);
    return true;
  } catch {
    return false;
  }
}
