/**
 * Integrations foundation: shared types and API contract (browser + server safe; no Node or browser APIs).
 *
 * Flow: the browser (Dialer, Pipeline, Contacts; sales data still lives in localStorage) reports what
 * happened to POST /api/activity/events. The server stores each event once in the outbox
 * (integration_events, idempotent on the client event id) and fans it out into one delivery per active
 * destination that subscribes to that event type (customer webhook endpoints now; CRM connections later).
 * A delivery worker sends due deliveries with retries/backoff and records every attempt for the
 * tenant admin's delivery log.
 *
 * API (session required; the workspace ALWAYS comes from the session, never the body):
 *   POST   /api/activity/events                     body { events: ActivityEventInput[] } (1..20)
 *            -> { accepted: string[]; duplicates: string[] }        any signed-in member
 *   GET    /api/integrations/webhooks               -> { endpoints: WebhookEndpointView[] }          Admin+
 *   POST   /api/integrations/webhooks               body WebhookEndpointInput -> 201 { endpoint, signingSecret }  (secret shown ONCE)
 *   PATCH  /api/integrations/webhooks/[id]          body Partial<WebhookEndpointInput> & { active?: boolean; rotateSecret?: boolean }
 *            -> { endpoint, signingSecret? }  (signingSecret only when rotated)
 *   DELETE /api/integrations/webhooks/[id]          -> { success: true }
 *   POST   /api/integrations/webhooks/[id]/test     -> { result: DeliveryAttemptResult }  (sends a 'test.ping' now)
 *   GET    /api/integrations/deliveries?status=&endpointId=&limit=  -> { deliveries: DeliveryView[] }  Admin+
 *   POST   /api/integrations/deliveries/[id]/retry  -> { delivery: DeliveryView }   Admin+ (failed/dead -> pending now)
 *
 * Errors: { error: string, field?: string } with 400/401/403/404/409/413/429/500.
 */

export const ACTIVITY_EVENT_TYPES = [
  'contact.created',
  'call.logged',
  'meeting.booked',
  'callback.scheduled',
  'pipeline.stage_changed',
  'email.sent',
] as const;
export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

/** Event types a webhook endpoint can subscribe to ('test.ping' is always delivered by the Test button). */
export const WEBHOOK_EVENT_TYPES: readonly ActivityEventType[] = ACTIVITY_EVENT_TYPES;

export const ACTIVITY_EVENT_LABEL: Record<ActivityEventType, string> = {
  'contact.created': 'Contact created',
  'call.logged': 'Call logged (with outcome)',
  'meeting.booked': 'Meeting booked',
  'callback.scheduled': 'Callback scheduled',
  'pipeline.stage_changed': 'Pipeline stage changed',
  'email.sent': 'Email sent',
};

/**
 * Activity checklist ticks (Contacts lead panel). Stored in the same outbox so a supervisor can see
 * a rep's lead activity (GET /api/activity/lead-activity), but it is NOT a webhook / CRM event:
 * deliberately not in ACTIVITY_EVENT_TYPES or WEBHOOK_EVENT_TYPES, never fanned out, no deliveries.
 */
export const LEAD_ACTIVITY_EVENT_TYPE = 'lead.activity';
export type LeadActivityAction = 'ticked' | 'unticked';

export interface LeadActivityEventInput {
  clientEventId: string;
  type: typeof LEAD_ACTIVITY_EVENT_TYPE;
  occurredAt: string;
  contact: EventContact;
  activity: {
    /** One of the LEAD_ACTIVITY_CHECKLIST keys (lib/leadActivityChecklist). */
    key: string;
    /** Set by the server from the checklist; a label sent by the browser is ignored. */
    label?: string;
    action: LeadActivityAction;
    /** The lead timeline entry this tick made (an untick names the same entry). */
    footprintId: string;
  };
}

/** GET /api/activity/lead-activity?from=&to=&member=&tz=  (who did what on which lead, by day). */
export interface LeadActivityReport {
  from: string;
  to: string;
  /** Supervisor and above see everyone in the workspace; everyone else sees only themselves. */
  canSeeEveryone: boolean;
  /** People the viewer may pick (just the viewer when canSeeEveryone is false). */
  members: { email: string; name: string }[];
  activities: { key: string; label: string; group: string }[];
  reps: LeadActivityRep[];
  /** True when the row cap was reached: narrow the dates to see everything. */
  truncated: boolean;
}
export interface LeadActivityRep {
  email: string;
  name: string;
  total: number;
  totals: Record<string, number>;
  days: {
    /** Local day of the viewer, e.g. "2026-11-23". */
    day: string;
    leads: {
      name: string;
      company: string;
      title: string;
      linkedinUrl: string;
      activities: { key: string; label: string; at: string }[];
    }[];
  }[];
}
export const LEAD_ACTIVITY_LIMITS = { maxRangeDays: 31, maxRows: 5000, requestsPerMinute: 60 } as const;

/** The prospect as the browser knows it at the time of the event. */
export interface EventContact {
  /** Browser contact id (stable per workspace browser data). */
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
  website?: string;
  linkedinUrl?: string;
}

export interface ActivityEventInput {
  /** Client-generated UUID v4. Idempotency key: the same id is stored once. */
  clientEventId: string;
  type: ActivityEventType;
  /** ISO time it happened in the browser. */
  occurredAt: string;
  contact: EventContact;
  /** call.logged: outcome name as picked + the call summary that was LOGGED (never unsaved draft notes). */
  call?: { outcome: string; summary?: string; durationSec?: number; direction?: 'outbound' | 'inbound' };
  /** meeting.booked */
  meeting?: { at?: string; aeEmail?: string; aeName?: string; meetingPlanId?: string };
  /** callback.scheduled */
  callback?: { at: string; note?: string };
  /** pipeline.stage_changed */
  stage?: { from?: string; to: string };
  /** email.sent */
  email?: { subject: string; to: string };
}

/** What a customer webhook receives (JSON body). */
export interface WebhookPayload {
  /** Our event id (UUID). Also sent as the X-Appointmentlyy-Event-Id header. */
  id: string;
  type: ActivityEventType | 'test.ping';
  /** ISO time the event happened. */
  occurredAt: string;
  workspace: { code: string; name: string };
  /** Who did it (the signed-in member). */
  actor: { email: string; name: string };
  data: Omit<ActivityEventInput, 'clientEventId' | 'type' | 'occurredAt'>;
  /** Payload version. */
  version: 1;
}

/**
 * Signature header sent with every webhook:
 *   X-Appointmentlyy-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(signingSecret, `${t}.${rawBody}`)>
 * Receivers should reject timestamps older than 5 minutes and compare in constant time.
 */
export const WEBHOOK_SIGNATURE_HEADER = 'X-Appointmentlyy-Signature';
export const WEBHOOK_EVENT_ID_HEADER = 'X-Appointmentlyy-Event-Id';
export const WEBHOOK_EVENT_TYPE_HEADER = 'X-Appointmentlyy-Event-Type';

export interface WebhookEndpointInput {
  /** https only, public host, port 443. */
  url: string;
  events: ActivityEventType[];
  description?: string;
}

export interface WebhookEndpointView {
  id: string;
  url: string;
  events: ActivityEventType[];
  description: string;
  active: boolean;
  /** Set when auto-disabled after repeated failures. */
  disabledReason: string | null;
  /** Last 4 chars of the signing secret, for recognition. */
  secretHint: string;
  consecutiveFailures: number;
  lastDeliveryAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type DeliveryStatusView = 'pending' | 'succeeded' | 'failed' | 'dead' | 'skipped';

export interface DeliveryAttemptResult {
  ok: boolean;
  /** HTTP status from the receiver, 0 when no response (timeout, DNS, refused). */
  httpStatus: number;
  durationMs: number;
  /** Short, user-safe description, e.g. "Timed out after 10s" or "Receiver returned 500". */
  message: string;
}

export interface DeliveryView {
  id: string;
  eventId: string;
  eventType: ActivityEventType | 'test.ping';
  /** e.g. "Call logged · Dana Reyes (Northwind)". */
  summary: string;
  destination: { kind: 'webhook'; endpointId: string; url: string };
  status: DeliveryStatusView;
  attempts: number;
  nextAttemptAt: string | null;
  lastResult: DeliveryAttemptResult | null;
  createdAt: string;
  updatedAt: string;
}

export const INTEGRATION_LIMITS = {
  eventsPerRequest: 20,
  endpointsPerWorkspace: 10,
  urlLength: 500,
  descriptionLength: 200,
  summaryLength: 4000,
  /** Attempts before a delivery is 'dead'. Backoff: 1m, 5m, 30m, 2h, 12h. */
  maxAttempts: 6,
  /** Consecutive failures before an endpoint is auto-disabled. */
  autoDisableAfter: 20,
  receiverTimeoutMs: 10_000,
} as const;
