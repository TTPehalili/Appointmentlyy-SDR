/**
 * Trouble Ticket Types, Categories & Enums
 * 
 * Shared across client components and server API routes. Storage: src/lib/server/supportTickets.ts.
 */
import type { SupportContext, TicketUrgency } from '@/lib/supportReport';

export type { TicketUrgency };

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'in_progress' | 'waiting_on_customer' | 'resolved' | 'closed';
export type TicketCategory = 
  | 'telephony_audio'
  | 'cold_email_resend'
  | 'linkedin_studio'
  | 'playbook_framework'
  | 'account_billing'
  | 'feature_request'
  | 'bug_general';

export interface TicketMessage {
  id: string;
  ticketId: string;
  senderName: string;
  senderEmail: string;
  senderRole: 'customer' | 'admin' | 'system';
  isInternalNote: boolean;
  content: string;
  createdAt: string;
}

/** A screenshot on a ticket (the bytes are served by /api/tickets/[id]/attachments/[attachmentId]). */
export interface TicketAttachmentMeta {
  id: string;
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  size: number;
  width: number;
  height: number;
  createdAt: string;
}

export type TicketSource = 'report' | 'desk' | 'billing';

export interface TroubleTicket {
  id: string; // e.g. "TKT-2611-4F7Q"
  tenantName: string;
  tenantCode: string;
  requesterName: string;
  requesterEmail: string;
  /** The reporter's role when they filed (from the session). */
  requesterRole?: string;
  /** Set when Appointmentlyy staff filed on the requester's behalf (staff only). */
  filedByEmail?: string | null;
  /** First line of "What happened?" unless the desk gave one. */
  subject: string;
  /** "What happened?" */
  description: string;
  /** "What were you trying to do?" */
  tried?: string;
  /** SUPPORT_AREAS value (src/lib/supportReport.ts). */
  area?: string;
  urgency?: TicketUrgency | null;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  source?: TicketSource;
  /** Captured page, browser, errors and failed requests (reporter and staff only). */
  context?: SupportContext | null;
  /** Screenshot details (reporter and staff only). attachmentCount is always shown. */
  attachments?: TicketAttachmentMeta[];
  attachmentCount?: number;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  messages: TicketMessage[];
}

export const TICKET_STATUSES: TicketStatus[] = ['open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'];
export const TICKET_PRIORITIES: TicketPriority[] = ['low', 'medium', 'high', 'urgent'];
export const TICKET_CATEGORY_VALUES: TicketCategory[] = ['telephony_audio', 'cold_email_resend', 'linkedin_studio', 'playbook_framework', 'account_billing', 'feature_request', 'bug_general'];

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_on_customer: 'Waiting on you',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const TICKET_CATEGORIES: { value: TicketCategory; label: string; description: string }[] = [
  { value: 'telephony_audio', label: 'Telephony & Live Dialing Audio', description: 'WebRTC delays, audio packet drops, Twilio/SIP trunk issues' },
  { value: 'cold_email_resend', label: 'Cold Email & Resend Dispatch', description: 'DKIM/SPF alignment, mailbox warming, inbox delivery' },
  { value: 'linkedin_studio', label: 'LinkedIn Studio & Ingestion', description: 'Profile syncing, post generator, engagement queues' },
  { value: 'playbook_framework', label: 'Playbook Ingestion & Vector DB', description: 'Docx/PDF upload parsing, objection matrix embeddings' },
  { value: 'account_billing', label: 'Account, Seats & Billing', description: 'Seat allocation, subscription tiers, team permissions' },
  { value: 'feature_request', label: 'Feature Request / Enhancement', description: 'Workflow improvements, new integrations, custom suggestions' },
  { value: 'bug_general', label: 'General Bug / System Issue', description: 'UI rendering, navigation glitch, unhandled errors' },
];
