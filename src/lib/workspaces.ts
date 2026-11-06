/**
 * Workspaces a Super Admin can switch into. Moved here from the old top header.
 * DESIGN-NOTE: this is still a static demo list. Replace it with the tenants API when one exists.
 */
export interface Workspace {
  name: string;
  code: string;
}

/** The platform's own workspace. Being in any other workspace as Super Admin means impersonating. */
export const HOME_WORKSPACE: Workspace = { name: 'Appointmentlyy', code: 'APPOINTMENTLYY' };

export const WORKSPACES: Workspace[] = [
  HOME_WORKSPACE,
  { name: 'Apex Global BPO', code: 'APEX-GLOBAL' },
  { name: 'ShorePartners BPO', code: 'SHORE-PARTNERS' },
  { name: 'CloudStaff Outsourcing', code: 'CLOUD-STAFF' },
  { name: 'Vanguard BPO Solutions', code: 'VANGUARD-PH' },
];

const RECENTS_KEY = 'appy_recent_workspaces';

export function getRecentWorkspaceCodes(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function pushRecentWorkspace(code: string) {
  if (typeof window === 'undefined') return;
  const next = [code, ...getRecentWorkspaceCodes().filter((c) => c !== code)].slice(0, 5);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
}
