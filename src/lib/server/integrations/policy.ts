/**
 * Delivery policy (retry backoff, endpoint auto-disable) and the test-only switches.
 *
 * Test switches (all OFF by default; for local end-to-end tests only):
 *   INTEGRATIONS_ALLOW_INSECURE_TEST_RECEIVER=http://127.0.0.1:<port>
 *       lets ONE loopback http origin act as a webhook receiver (the SSRF guard otherwise refuses it).
 *   INTEGRATIONS_TEST_BACKOFF_SECONDS=1,1,1,1,1   shorter retry schedule
 *   INTEGRATIONS_TEST_AUTO_DISABLE_AFTER=3        smaller failure streak before auto-disable
 *   INTEGRATIONS_TEST_POLL_MS=500                 faster worker polling
 * They are honoured only when test mode is on: NODE_ENV !== 'production', or NODE_ENV=production
 * together with an explicit INTEGRATIONS_TEST_MODE=1. They are NEVER honoured on Railway (any
 * RAILWAY_* deployment variable present), so a stray variable can't open the guard in production.
 */
import { INTEGRATION_LIMITS } from '@/lib/integrations';

/** 1m, 5m, 30m, 2h, 12h (attempt n failed -> wait BACKOFF[n-1]); attempt maxAttempts failing -> dead. */
export const BACKOFF_SECONDS: readonly number[] = [60, 5 * 60, 30 * 60, 2 * 3600, 12 * 3600];

function onRailway(): boolean {
  return Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);
}

export function integrationsTestMode(): boolean {
  if (onRailway()) return false;
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.INTEGRATIONS_TEST_MODE === '1';
}

/** The single loopback origin allowed as a receiver in test mode, e.g. "http://127.0.0.1:4999". */
export function insecureTestReceiverOrigin(): string | null {
  const raw = (process.env.INTEGRATIONS_ALLOW_INSECURE_TEST_RECEIVER || '').trim();
  if (!raw || !integrationsTestMode()) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' || !(u.hostname === '127.0.0.1' || u.hostname === 'localhost') || !u.port) return null;
    return u.origin;
  } catch {
    return null;
  }
}

function testNumbers(name: string): number[] | null {
  if (!integrationsTestMode()) return null;
  const raw = (process.env[name] || '').trim();
  if (!raw) return null;
  const list = raw.split(',').map((s) => Number(s.trim()));
  return list.length && list.every((n) => Number.isFinite(n) && n >= 0) ? list : null;
}

export function backoffSchedule(): number[] {
  return testNumbers('INTEGRATIONS_TEST_BACKOFF_SECONDS') ?? [...BACKOFF_SECONDS];
}

/** Seconds to wait after the `attempts`-th failed attempt (1-based). */
export function backoffAfter(attempts: number, schedule: readonly number[] = BACKOFF_SECONDS): number {
  if (!schedule.length) return 60;
  return schedule[Math.min(Math.max(attempts, 1), schedule.length) - 1];
}

export function autoDisableAfter(): number {
  const n = testNumbers('INTEGRATIONS_TEST_AUTO_DISABLE_AFTER')?.[0];
  return n && n >= 1 ? Math.floor(n) : INTEGRATION_LIMITS.autoDisableAfter;
}

export function workerPollMs(): number {
  const n = testNumbers('INTEGRATIONS_TEST_POLL_MS')?.[0];
  return n && n >= 100 ? Math.floor(n) : 5000;
}

export const AUTO_DISABLE_REASON = (n: number) =>
  `Turned off automatically after ${n} failed deliveries in a row. Fix the receiver, then turn the endpoint back on.`;
