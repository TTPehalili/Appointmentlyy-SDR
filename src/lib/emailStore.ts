import { isDemoWorkspace } from '@/lib/demoMode';
/**
 * Unified Email Store & Communications Engine
 * 
 * Manages all outbound dispatched emails and inbound prospect replies
 * across cold outbound campaigns, Boris calling cadences, and manual sends.
 */

export interface EmailMessage {
  id: string;
  threadId: string;
  direction: 'outbound' | 'inbound';
  from: string;
  to: string;
  subject: string;
  body: string;
  timestamp: string;
  status: 'queued' | 'sent' | 'delivered' | 'opened' | 'replied' | 'bounced';
  leadId?: string;
  leadName: string;
  leadCompany: string;
  leadTitle?: string;
  provider: 'resend_live' | 'resend_sandbox' | 'manual_send';
  read?: boolean;
  starred?: boolean;
}

/**
 * Extract clean email address from string or array (handles "Name <user@domain.com>" or "user@domain.com")
 */
export function extractCleanEmailAddress(raw: string | string[] | undefined): string {
  if (!raw) return '';
  let str = Array.isArray(raw) ? (raw[0] || '') : String(raw);
  const match = str.match(/<([^>]+)>/);
  if (match) return match[1].trim().toLowerCase();
  const clean = str.trim().toLowerCase().split(',')[0].trim();
  const spaceSplit = clean.split(/\s+/);
  const found = spaceSplit.find(s => s.includes('@'));
  return (found || clean).replace(/['"<>]/g, '');
}

/**
 * Normalize subject line by stripping Re:, Fwd:, [External], and extra whitespace
 */
export function normalizeEmailSubject(subject: string | undefined): string {
  if (!subject) return 'no_subject';
  let norm = subject.trim();
  // Strip prefixes like Re:, Fwd:, FW:, [External], etc.
  const prefixRegex = /^(\s*(\[[^\]]+\]|\b(re|fwd|fw)\b\s*[:\-])\s*)+/i;
  norm = norm.replace(prefixRegex, '').trim();
  norm = norm.replace(/^(re|fwd|fw):\s*/i, '').trim();
  return norm.toLowerCase() || 'no_subject';
}

/**
 * Determine the prospect/counterpart email address for an outbound or inbound message
 */
export function getCounterpartEmail(msg: { direction?: string; to?: string | string[]; from?: string }): string {
  if (msg.direction === 'inbound') {
    return extractCleanEmailAddress(msg.from);
  } else {
    return extractCleanEmailAddress(msg.to);
  }
}

/**
 * Compute the deterministic conversation thread key for any email message.
 * Outbound dispatches and their corresponding inbound replies share the same
 * counterpart email and normalized subject, guaranteeing they share the same thread.
 */
export function getConversationThreadKey(msg: {
  direction?: 'outbound' | 'inbound' | string;
  to?: string | string[];
  from?: string;
  subject?: string;
  threadId?: string;
}): string {
  const normSubject = normalizeEmailSubject(msg.subject || '');
  const counterpart = getCounterpartEmail(msg);

  if (counterpart && normSubject && normSubject !== 'no_subject') {
    const cleanCounterpart = counterpart.replace(/[^a-z0-9]/g, '_');
    const cleanSubject = normSubject.replace(/[^a-z0-9]/g, '_').slice(0, 40);
    return `thread_${cleanCounterpart}_${cleanSubject}`;
  }

  if (counterpart) {
    const cleanCounterpart = counterpart.replace(/[^a-z0-9]/g, '_');
    return `thread_${cleanCounterpart}`;
  }

  if (msg.threadId && msg.threadId.trim()) {
    return msg.threadId.trim();
  }

  return 'thread_default';
}

const DEMO_INITIAL_SEED_EMAILS: EmailMessage[] = [
  {
    id: 'msg_seed_001',
    threadId: 'thread_julian_apexglobalbpo_com_apex_lead_burn',
    direction: 'outbound',
    from: 'Emil Halili <emil@appointmentlyy.com>',
    to: 'julian@apexglobalbpo.com',
    subject: 'apex lead burn',
    body: `Hi Julian, Saw Apex Global BPO is scaling outbound seats to 65. Typically when BPO leaders scale outbound, the hidden leak is not lead volume, it is callers getting chopped on price by commodity competitors. Traditional coaching fails when reps freeze in the first 20 seconds. We feed consultative rebuttals in 150 milliseconds live on the dial. Open to a 2-minute video showing how we insulate margins, or totally off base?`,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    status: 'replied',
    leadName: 'Julian Vance',
    leadCompany: 'Apex Global BPO',
    leadTitle: 'Director of Outbound Operations',
    provider: 'resend_sandbox',
    read: true,
    starred: true
  },
  {
    id: 'msg_seed_002',
    threadId: 'thread_julian_apexglobalbpo_com_apex_lead_burn',
    direction: 'inbound',
    from: 'Julian Vance <julian@apexglobalbpo.com>',
    to: 'Emil Halili <emil@appointmentlyy.com>',
    subject: 'Re: apex lead burn',
    body: `Hey Emil,

You caught me at a good time. We actually just onboarded 15 new outbound reps last Monday in Clark and our hold rate took a 20% dive because junior setters keep stumbling when prospects say they already have an agency.

How are you feeding rebuttals in 150ms without the callers sounding like robots? Send over that 2-minute video. If it looks solid, I'm open to a 15-minute screen share with my floor QA lead Thursday.

Best,
Julian Vance
Director of Outbound Operations
Apex Global BPO`,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    status: 'delivered',
    leadName: 'Julian Vance',
    leadCompany: 'Apex Global BPO',
    leadTitle: 'Director of Outbound Operations',
    provider: 'resend_sandbox',
    read: false,
    starred: true
  },
  {
    id: 'msg_seed_003',
    threadId: 'thread_mbrody_nexuscall_com_quick_question_on_ramp_time',
    direction: 'outbound',
    from: 'Emil Halili <emil@appointmentlyy.com>',
    to: 'mbrody@nexuscall.com',
    subject: 'quick question on ramp time',
    body: `Hi Marcus,

Most BPO leaders running 120 seats tell me their biggest margin leak is watching new hires burn through 500 client accounts just trying to figure out live dials.

Curious if you are seeing that same friction at Nexus Call, or do your callers somehow hit full production in 72 hours without burning leads?

Best,
Emil`,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    status: 'opened',
    leadName: 'Marcus Brody',
    leadCompany: 'Nexus Call Solutions',
    leadTitle: 'VP of Contact Center Ops',
    provider: 'resend_sandbox',
    read: true
  },
  {
    id: 'msg_seed_004',
    threadId: 'thread_mbrody_nexuscall_com_quick_question_on_ramp_time',
    direction: 'inbound',
    from: 'Marcus Brody <mbrody@nexuscall.com>',
    to: 'Emil Halili <emil@appointmentlyy.com>',
    subject: 'Re: quick question on ramp time',
    body: `Emil,

We definitely see ramp lag—takes our trainees about 3 weeks before they're booking at quota. What's your typical pricing model for a 50-seat floor? We're on Salesforce and Twilio.

Marcus`,
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    status: 'delivered',
    leadName: 'Marcus Brody',
    leadCompany: 'Nexus Call Solutions',
    leadTitle: 'VP of Contact Center Ops',
    provider: 'resend_sandbox',
    read: false,
    starred: true
  },
  {
    id: 'msg_seed_005',
    threadId: 'thread_sjenkins_cloudstaffbpo_com_broker_margin_leak',
    direction: 'outbound',
    from: 'Emil Halili <emil@appointmentlyy.com>',
    to: 'sjenkins@cloudstaffbpo.com',
    subject: 'broker margin leak',
    body: `Hi Sarah, Notice CloudStaff is adding 30 outbound appointment setters. Typically when agencies take on broker campaigns, the middleman pockets 60% of the contract while you carry 100% of the OPEX risk. Would it be a terrible idea to compare notes for 2 minutes on how to take internal client acquisition back in-house?`,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    status: 'delivered',
    leadName: 'Sarah Jenkins',
    leadCompany: 'CloudStaff BPO',
    leadTitle: 'Chief Revenue Officer',
    provider: 'resend_sandbox',
    read: true
  }
];

export function getStoredEmails(): EmailMessage[] {
  if (typeof window === 'undefined') return initialSeedEmails();
  try {
    const raw = localStorage.getItem('sdr_unified_inbox_emails');
    // Demo workspace: an empty inbox (e.g. saved by a build that didn't seed it) gets the samples.
    if (raw === null || (raw.trim() === '[]' && isDemoWorkspace())) {
      const seed = initialSeedEmails();
      if (isDemoWorkspace()) localStorage.setItem('sdr_unified_inbox_emails', JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return initialSeedEmails();

    let hasChanges = false;
    const migrated = parsed.map((m: EmailMessage) => {
      let updatedFrom = m.from;
      let updatedTo = m.to;
      if (m.from && (m.from.includes('Emil Vance') || m.from.includes('Alex Mercer'))) {
        updatedFrom = m.from.replace('Emil Vance', 'Emil Halili').replace('Alex Mercer', 'Emil Halili');
        hasChanges = true;
      }
      if (m.to && (m.to.includes('Emil Vance') || m.to.includes('Alex Mercer'))) {
        updatedTo = m.to.replace('Emil Vance', 'Emil Halili').replace('Alex Mercer', 'Emil Halili');
        hasChanges = true;
      }

      // Canonicalize threadId so outbound and inbound share the exact same conversation key
      const canonicalThreadId = getConversationThreadKey({
        direction: m.direction,
        to: updatedTo,
        from: updatedFrom,
        subject: m.subject,
        threadId: m.threadId
      });

      if (m.threadId !== canonicalThreadId) {
        hasChanges = true;
      }

      let updatedLeadName = m.leadName;
      let updatedLeadCompany = m.leadCompany;
      let updatedLeadTitle = m.leadTitle;

      // Smart enrichment for callview.ai prospect
      const counterpart = getCounterpartEmail({ direction: m.direction, to: updatedTo, from: updatedFrom });
      if (counterpart.includes('callview.ai')) {
        if (!updatedLeadName || updatedLeadName === 'emil' || updatedLeadName === 'Julian Vance' || updatedLeadName === 'Prospect') {
          updatedLeadName = 'Emil Halili';
          hasChanges = true;
        }
        if (!updatedLeadCompany || updatedLeadCompany === 'Callview' || updatedLeadCompany === 'Apex Global BPO' || updatedLeadCompany === 'Target Company') {
          updatedLeadCompany = 'Callview AI';
          hasChanges = true;
        }
        if (!updatedLeadTitle || updatedLeadTitle === 'Director of Outbound Operations') {
          updatedLeadTitle = 'Founder / Decision Maker';
          hasChanges = true;
        }
      }

      return {
        ...m,
        from: updatedFrom,
        to: updatedTo,
        threadId: canonicalThreadId,
        leadName: updatedLeadName,
        leadCompany: updatedLeadCompany,
        leadTitle: updatedLeadTitle
      };
    });

    if (hasChanges) {
      localStorage.setItem('sdr_unified_inbox_emails', JSON.stringify(migrated));
    }
    return migrated;
  } catch (e) {
    console.warn('Could not read stored emails:', e);
    return initialSeedEmails();
  }
}

export function saveEmailToStore(email: EmailMessage): EmailMessage[] {
  if (typeof window === 'undefined') return [email, ...initialSeedEmails()];
  try {
    const canonicalThreadId = getConversationThreadKey(email);
    const enrichedEmail: EmailMessage = {
      ...email,
      threadId: canonicalThreadId
    };

    const cleanCounterpart = getCounterpartEmail(enrichedEmail);
    if (cleanCounterpart.includes('callview.ai')) {
      if (!enrichedEmail.leadName || enrichedEmail.leadName === 'emil' || enrichedEmail.leadName === 'Julian Vance' || enrichedEmail.leadName === 'Prospect') {
        enrichedEmail.leadName = 'Emil Halili';
      }
      if (!enrichedEmail.leadCompany || enrichedEmail.leadCompany === 'Callview' || enrichedEmail.leadCompany === 'Apex Global BPO' || enrichedEmail.leadCompany === 'Target Company') {
        enrichedEmail.leadCompany = 'Callview AI';
      }
      if (!enrichedEmail.leadTitle || enrichedEmail.leadTitle === 'Director of Outbound Operations') {
        enrichedEmail.leadTitle = 'Founder / Decision Maker';
      }
    }

    const current = getStoredEmails();
    // Save email and align thread peers
    const updated = [
      enrichedEmail,
      ...current.filter(m => m.id !== enrichedEmail.id).map(m => {
        if (getConversationThreadKey(m) === canonicalThreadId) {
          return {
            ...m,
            threadId: canonicalThreadId,
            leadName: m.leadName === 'emil' || m.leadName === 'Julian Vance' ? enrichedEmail.leadName : m.leadName,
            leadCompany: m.leadCompany === 'Callview' || m.leadCompany === 'Apex Global BPO' ? enrichedEmail.leadCompany : m.leadCompany
          };
        }
        return m;
      })
    ];
    localStorage.setItem('sdr_unified_inbox_emails', JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.warn('Could not save email:', e);
    return [email, ...initialSeedEmails()];
  }
}

export function deleteEmailById(id: string): EmailMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const current = getStoredEmails();
    const updated = current.filter(m => m.id !== id);
    localStorage.setItem('sdr_unified_inbox_emails', JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.warn('Could not delete email:', e);
    return [];
  }
}

export function deleteThreadById(threadId: string): EmailMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const current = getStoredEmails();
    const updated = current.filter(m => m.threadId !== threadId && getConversationThreadKey(m) !== threadId);
    localStorage.setItem('sdr_unified_inbox_emails', JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.warn('Could not delete thread:', e);
    return [];
  }
}

export function clearAllEmails(): EmailMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    localStorage.setItem('sdr_unified_inbox_emails', JSON.stringify([]));
    return [];
  } catch (e) {
    console.warn('Could not clear emails:', e);
    return [];
  }
}

export function resetToInitialSeeds(): EmailMessage[] {
  if (typeof window === 'undefined') return initialSeedEmails();
  try {
    const seed = initialSeedEmails();
    if (isDemoWorkspace()) localStorage.setItem('sdr_unified_inbox_emails', JSON.stringify(seed));
    return seed;
  } catch (e) {
    console.warn('Could not reset seeds:', e);
    return initialSeedEmails();
  }
}

// Sample data is for demo builds only: real workspaces start empty.
function initialSeedEmails(): EmailMessage[] {
  return isDemoWorkspace() ? DEMO_INITIAL_SEED_EMAILS : [];
}
