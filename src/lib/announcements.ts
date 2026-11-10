/**
 * Platform announcements (system upgrades, updates, feature releases) shown as a ribbon at the
 * top of the app. Shared by the browser (Platform Console editor, ribbon) and the server
 * (validation in /api/platform/announcements). No secrets here.
 */
import { TENANT_CODE_RE } from '@/lib/roles';

export type AnnouncementKind = 'feature' | 'update' | 'maintenance';
export type AnnouncementAudience = 'admins' | 'everyone' | 'workspaces';
export type AnnouncementStatus = 'scheduled' | 'live' | 'ended';

export const ANNOUNCEMENT_KINDS: { value: AnnouncementKind; label: string }[] = [
  { value: 'feature', label: 'New feature' },
  { value: 'update', label: 'Update' },
  { value: 'maintenance', label: 'Maintenance' },
];

export const TITLE_MAX = 80;
export const MESSAGE_MAX = 280;
export const LINK_LABEL_MAX = 30;
export const LINK_URL_MAX = 500;
export const MAX_WORKSPACES = 200;

export interface Announcement {
  id: string;
  title: string;
  message: string;
  linkUrl: string | null;
  linkLabel: string | null;
  kind: AnnouncementKind;
  audience: AnnouncementAudience;
  workspaceCodes: string[];
  publishAt: string;
  unpublishAt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** What the ribbon receives: display fields only. */
export interface ActiveAnnouncement {
  id: string;
  title: string;
  message: string;
  linkUrl: string | null;
  linkLabel: string | null;
  kind: AnnouncementKind;
  publishAt: string;
  unpublishAt: string;
}

export type AnnouncementInput = Pick<
  Announcement,
  'title' | 'message' | 'linkUrl' | 'linkLabel' | 'kind' | 'audience' | 'workspaceCodes' | 'publishAt' | 'unpublishAt'
>;

export function announcementStatus(a: Pick<Announcement, 'publishAt' | 'unpublishAt'>, now = Date.now()): AnnouncementStatus {
  if (now < Date.parse(a.publishAt)) return 'scheduled';
  if (now < Date.parse(a.unpublishAt)) return 'live';
  return 'ended';
}

/** http(s) URLs or same-site paths only (never javascript:, data:, protocol-relative…). */
export function isSafeLink(url: string): boolean {
  if (url.startsWith('/')) return !url.startsWith('//') && !url.includes('\\');
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

// Strip control characters (keeps it plain, single-paragraph text).
const clean = (v: unknown) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

export type ValidationResult =
  | { ok: true; value: AnnouncementInput }
  | { ok: false; field: keyof AnnouncementInput; error: string };

/** Validate and normalise an announcement (same rules in the editor and on the server). */
export function validateAnnouncement(raw: Record<string, unknown>): ValidationResult {
  const title = clean(raw.title);
  const message = clean(raw.message);
  const linkUrl = clean(raw.linkUrl);
  const linkLabel = clean(raw.linkLabel);
  const kind = String(raw.kind ?? 'update') as AnnouncementKind;
  const audience = String(raw.audience ?? 'admins') as AnnouncementAudience;
  const codes = Array.isArray(raw.workspaceCodes) ? raw.workspaceCodes.map((c) => String(c).trim().toUpperCase()).filter(Boolean) : [];
  const workspaceCodes = [...new Set(codes)];
  const publish = Date.parse(String(raw.publishAt ?? ''));
  const unpublish = Date.parse(String(raw.unpublishAt ?? ''));

  if (!title) return { ok: false, field: 'title', error: 'Enter a title.' };
  if (title.length > TITLE_MAX) return { ok: false, field: 'title', error: `Keep the title under ${TITLE_MAX} characters.` };
  if (!message) return { ok: false, field: 'message', error: 'Enter a message.' };
  if (message.length > MESSAGE_MAX) return { ok: false, field: 'message', error: `Keep the message under ${MESSAGE_MAX} characters.` };
  if (linkUrl && (linkUrl.length > LINK_URL_MAX || !isSafeLink(linkUrl)))
    return { ok: false, field: 'linkUrl', error: 'Use a full https:// link or a path that starts with /.' };
  if (linkLabel.length > LINK_LABEL_MAX) return { ok: false, field: 'linkLabel', error: `Keep the link label under ${LINK_LABEL_MAX} characters.` };
  if (!ANNOUNCEMENT_KINDS.some((k) => k.value === kind)) return { ok: false, field: 'kind', error: 'Pick a type.' };
  if (!['admins', 'everyone', 'workspaces'].includes(audience)) return { ok: false, field: 'audience', error: 'Pick an audience.' };
  if (audience === 'workspaces') {
    if (workspaceCodes.length === 0) return { ok: false, field: 'workspaceCodes', error: 'Pick at least one workspace.' };
    if (workspaceCodes.length > MAX_WORKSPACES || workspaceCodes.some((c) => !TENANT_CODE_RE.test(c)))
      return { ok: false, field: 'workspaceCodes', error: 'One of the workspace codes is not valid.' };
  }
  if (!Number.isFinite(publish)) return { ok: false, field: 'publishAt', error: 'Pick when it should appear.' };
  if (!Number.isFinite(unpublish)) return { ok: false, field: 'unpublishAt', error: 'Pick when it should disappear.' };
  if (unpublish <= publish) return { ok: false, field: 'unpublishAt', error: 'The end must be after the start.' };
  const fiveYears = 5 * 365 * 24 * 3600 * 1000;
  if (Math.abs(publish - Date.now()) > fiveYears || Math.abs(unpublish - Date.now()) > fiveYears)
    return { ok: false, field: 'unpublishAt', error: 'Pick dates within the next few years.' };

  return {
    ok: true,
    value: {
      title,
      message,
      linkUrl: linkUrl || null,
      linkLabel: linkUrl ? linkLabel || 'Learn more' : null,
      kind,
      audience,
      workspaceCodes: audience === 'workspaces' ? workspaceCodes : [],
      publishAt: new Date(publish).toISOString(),
      unpublishAt: new Date(unpublish).toISOString(),
    },
  };
}

/** Who sees an announcement. Platform staff count as admins. */
export function announcementMatches(
  a: Pick<Announcement, 'audience' | 'workspaceCodes'>,
  viewer: { role: string; isPlatformAdmin: boolean; tenantCode: string },
): boolean {
  if (a.audience === 'everyone') return true;
  if (a.audience === 'admins') return viewer.isPlatformAdmin || viewer.role === 'Admin' || viewer.role === 'Super Admin';
  return a.workspaceCodes.includes(viewer.tenantCode);
}

export function toActive(a: Announcement): ActiveAnnouncement {
  return {
    id: a.id,
    title: a.title,
    message: a.message,
    linkUrl: a.linkUrl,
    linkLabel: a.linkLabel,
    kind: a.kind,
    publishAt: a.publishAt,
    unpublishAt: a.unpublishAt,
  };
}
