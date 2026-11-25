/**
 * "Report a problem" screenshots: durable growth caps, 90-day retention and the storage alert (security condition 2
 * of the support review). Server only.
 *
 * - Caps are counted from the stored rows (supportTickets.ts › addAttachment), so they hold across restarts, deploys
 *   and server instances. They replace the per-process counters the upload route used to keep in memory.
 * - Retention: screenshots older than 90 days are deleted, at most once an hour per server process, a bounded batch
 *   at a time, after the response of a screenshot upload or a ticket list (Railway has no cron here). It only ever
 *   deletes screenshot rows older than the cutoff; ticket text and messages stay, with a note on the report.
 * - Alert: when a workspace passes 80% of its 30-day allowance, support@ is emailed once. "Once" is decided by a
 *   staff-only system note on one of the workspace's tickets with a fixed id (support_ticket_messages), not by memory.
 */
import crypto from 'node:crypto';
import { after } from 'next/server';
import {
  DAY_MS,
  QUOTA_WINDOW_MS,
  getSupportTicketStore,
  type AttachmentQuota,
  type NewMessageInput,
  type QuotaRefusal,
  type ShotUsage,
} from '@/lib/server/supportTickets';
import { SCREENSHOTS_REMOVED_NOTE, SUPPORT_LIMITS } from '@/lib/supportReport';
import { sendScreenshotQuotaAlert } from '@/lib/ticketEmailer';
import type { TroubleTicket } from '@/lib/ticketTypes';

const MB = 1024 * 1024;

/** The caps. A workspace: 200 MB and 2,000 screenshots in any 30 days. A person: 30 screenshots in any 24 hours. */
export const SCREENSHOT_WORKSPACE_BYTES_PER_30_DAYS = 200 * MB;
export const SCREENSHOT_WORKSPACE_SHOTS_PER_30_DAYS = 2000;
export const SCREENSHOT_USER_SHOTS_PER_DAY = 30;
/** support@ is emailed once when a workspace passes this share of either 30-day cap. */
export const SCREENSHOT_ALERT_FRACTION = 0.8;
/** Retention: run at most this often per process, deleting at most this many screenshots per run. */
export const SCREENSHOT_CLEANUP_EVERY_MS = 3_600_000;
export const SCREENSHOT_CLEANUP_BATCH = 200;

export interface ShotLimits {
  userShotsPerDay: number;
  workspaceShots: number;
  workspaceBytes: number;
  alertFraction: number;
  cleanupEveryMs: number;
  cleanupBatch: number;
}

const DEFAULT_LIMITS: ShotLimits = {
  userShotsPerDay: SCREENSHOT_USER_SHOTS_PER_DAY,
  workspaceShots: SCREENSHOT_WORKSPACE_SHOTS_PER_30_DAYS,
  workspaceBytes: SCREENSHOT_WORKSPACE_BYTES_PER_30_DAYS,
  alertFraction: SCREENSHOT_ALERT_FRACTION,
  cleanupEveryMs: SCREENSHOT_CLEANUP_EVERY_MS,
  cleanupBatch: SCREENSHOT_CLEANUP_BATCH,
};

let cachedLimits: ShotLimits | null = null;
/**
 * The caps in force. SUPPORT_SHOT_TEST_LIMITS (JSON, e.g. {"userShotsPerDay":4}) lowers them for the local test
 * suites ONLY: it is read only when tickets are in the local file store (no Supabase configured) and the process is
 * not on Railway, so it can never apply in production.
 */
export function shotLimits(): ShotLimits {
  if (cachedLimits) return cachedLimits;
  let limits = DEFAULT_LIMITS;
  const raw = (process.env.SUPPORT_SHOT_TEST_LIMITS || '').trim();
  const onRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);
  if (raw && !onRailway) {
    try {
      if (getSupportTicketStore().backend === 'file') {
        const o = JSON.parse(raw) as Record<string, unknown>;
        const pick = (k: keyof ShotLimits, min: number) => (typeof o[k] === 'number' && Number.isFinite(o[k]) && (o[k] as number) >= min ? (o[k] as number) : DEFAULT_LIMITS[k]);
        limits = {
          userShotsPerDay: pick('userShotsPerDay', 1),
          workspaceShots: pick('workspaceShots', 1),
          workspaceBytes: pick('workspaceBytes', 1),
          alertFraction: Math.min(1, pick('alertFraction', 0.01)),
          cleanupEveryMs: pick('cleanupEveryMs', 0),
          cleanupBatch: pick('cleanupBatch', 1),
        };
        console.warn('[tickets] TEST screenshot limits in force (local file store only):', JSON.stringify(limits));
      }
    } catch {
      limits = DEFAULT_LIMITS;
    }
  }
  cachedLimits = limits;
  return limits;
}

export function attachmentQuota(): AttachmentQuota {
  const l = shotLimits();
  return { perTicket: SUPPORT_LIMITS.screenshots, userPerDay: l.userShotsPerDay, workspaceShots: l.workspaceShots, workspaceBytes: l.workspaceBytes };
}

const mbText = (bytes: number) => `${bytes >= 10 * MB ? Math.round(bytes / MB) : Math.round((bytes / MB) * 10) / 10} MB`;

/** What the person is told when a screenshot is refused by a cap (the report itself was already saved). */
export function quotaRefusalMessage(reason: QuotaRefusal): string {
  const l = shotLimits();
  switch (reason) {
    case 'ticket_full':
      return `A report can have at most ${SUPPORT_LIMITS.screenshots} screenshots.`;
    case 'user_daily':
      return `You have reached the limit of ${l.userShotsPerDay} screenshots a day. Your report is saved without this one; you can describe what you saw in a reply.`;
    case 'workspace_shots':
    case 'workspace_bytes':
      return 'Your workspace has reached its screenshot storage limit for the last 30 days. Your report is saved without this one; you can describe what you saw in a reply.';
  }
}

/** A fixed UUID for a fixed purpose, so a second insert (from any server) collides instead of duplicating. */
export function stableUuid(key: string): string {
  const h = crypto.createHash('sha256').update(key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// ------------------------------------------------------------------ retention

let lastCleanup = 0;
let cleanupRunning = false;

const retentionNote = (ticketId: string): NewMessageInput & { id: string } => ({
  id: stableUuid(`support-screenshot-retention:${ticketId}`),
  senderName: 'Appointmentlyy',
  senderEmail: '',
  senderRole: 'system',
  isInternalNote: false,
  content: SCREENSHOTS_REMOVED_NOTE,
});

/** Deletes one bounded batch of screenshots older than 90 days. Returns how many were deleted. */
export async function runScreenshotRetention(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - SUPPORT_LIMITS.screenshotRetentionDays * DAY_MS).toISOString();
  return getSupportTicketStore().pruneScreenshots(cutoff, shotLimits().cleanupBatch, retentionNote);
}

/**
 * Call from a screenshot upload or a ticket list. At most once per hour per process, after the response has gone
 * out; never blocks or fails the request.
 */
export function scheduleScreenshotRetention(): void {
  try {
    const now = Date.now();
    if (cleanupRunning || now - lastCleanup < shotLimits().cleanupEveryMs) return;
    lastCleanup = now;
    cleanupRunning = true;
    after(async () => {
      try {
        const n = await runScreenshotRetention();
        if (n) console.log(`[tickets] retention: removed ${n} screenshot(s) older than ${SUPPORT_LIMITS.screenshotRetentionDays} days`);
      } catch (err) {
        console.warn('[tickets] retention run failed (will retry later):', err instanceof Error ? err.message : err);
      } finally {
        cleanupRunning = false;
      }
    });
  } catch (err) {
    cleanupRunning = false;
    console.warn('[tickets] retention not scheduled:', err instanceof Error ? err.message : err);
  }
}

// ------------------------------------------------------------------ growth alert

export const SHOT_ALERT_PREFIX = 'Screenshot storage alert:';

/**
 * After a stored screenshot: if the workspace has passed 80% of a 30-day cap, claim the alert (a staff-only system note
 * with a fixed id per workspace and 30-day period, skipped if the workspace had one in the last 30 days) and, only
 * for the request that claimed it, email support@. Runs after the response; never fails the upload.
 */
export function afterScreenshotStored(ticket: TroubleTicket, tenantCode: string, usage: ShotUsage): void {
  const l = shotLimits();
  const share = Math.max(usage.workspaceBytes / l.workspaceBytes, usage.workspaceShots / l.workspaceShots);
  if (!(share >= l.alertFraction)) return;
  try {
    after(async () => {
      try {
        const now = Date.now();
        const pct = Math.min(999, Math.floor(share * 100));
        const note: NewMessageInput & { id: string } = {
          id: stableUuid(`support-screenshot-alert:${tenantCode}:${Math.floor(now / QUOTA_WINDOW_MS)}`),
          senderName: 'Appointmentlyy',
          senderEmail: '',
          senderRole: 'system',
          isInternalNote: true,
          content: `${SHOT_ALERT_PREFIX} ${ticket.tenantName} (${tenantCode}) has used ${mbText(usage.workspaceBytes)} of ${mbText(l.workspaceBytes)} and ${usage.workspaceShots} of ${l.workspaceShots} screenshots allowed in 30 days (${pct}%). support@ is emailed once per 30 days for this; new screenshots are refused at 100%.`,
        };
        const claimed = await getSupportTicketStore().claimWorkspaceNote(tenantCode, ticket.id, note, SHOT_ALERT_PREFIX, new Date(now - QUOTA_WINDOW_MS).toISOString());
        if (!claimed) return;
        console.log(`[tickets] screenshot storage alert for ${tenantCode} (${pct}%)`);
        const r = await sendScreenshotQuotaAlert({
          tenantCode,
          tenantName: ticket.tenantName,
          ticketId: ticket.id,
          percent: pct,
          bytes: usage.workspaceBytes,
          capBytes: l.workspaceBytes,
          shots: usage.workspaceShots,
          capShots: l.workspaceShots,
        });
        if (!r.success && r.error && !/not configured/.test(r.error)) console.warn('[tickets] storage alert email not sent:', String(r.error).slice(0, 200));
      } catch (err) {
        console.warn('[tickets] storage alert failed:', err instanceof Error ? err.message : err);
      }
    });
  } catch (err) {
    console.warn('[tickets] storage alert not scheduled:', err instanceof Error ? err.message : err);
  }
}
