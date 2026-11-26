/**
 * Welcome / kickoff email, sent once when a client CONTRACT is fully executed (the client signed and, when the
 * template needs it, the owner countersigned). Browser + server safe: the default wording, the placeholders, the
 * per-envelope switch and status, and the pure renderer (every value HTML-escaped, lines with a missing value dropped).
 * Sending, the once-only claim and the board lookup live in lib/server/agreements/welcome.ts.
 */

/**
 * Templates that are a client contract. Only these ever send the welcome email: billing statements, delivery
 * reports and UAT certificates never do. The dev ids exist only on local test servers (AGREEMENTS_DEV_TEMPLATE).
 */
export const WELCOME_TEMPLATE_IDS: readonly string[] = ['proposal-growth-v1', 'proposal-growth-v2', 'service-agreement-v1', 'dev-simple-v1', 'dev-contract-v1'];

/**
 * Signable custom proposals (v2): the welcome email is OPT-IN per send (a checkbox, default off). A view-only
 * proposal never sends one (it has no signature).
 */
export const WELCOME_OPT_IN_IDS: readonly string[] = ['custom-proposal-v2'];

export const isWelcomeTemplate = (templateId: string): boolean => WELCOME_TEMPLATE_IDS.includes(templateId) || WELCOME_OPT_IN_IDS.includes(templateId);
export const isWelcomeOptIn = (templateId: string): boolean => WELCOME_OPT_IN_IDS.includes(templateId);

/** The once-only marker, stored in the envelope's existing `notified` jsonb (no migration). */
export interface WelcomeMark {
  /** Random id of the claim: every change is a compare-and-set on it, so a retry or double click never sends twice. */
  claimId: string;
  state: 'sending' | 'sent' | 'failed';
  claimedAt: string;
  trigger: 'auto' | 'manual';
  by?: string;
  sentAt?: string;
  /** People it reached, and people it did not. */
  recipients?: number;
  failed?: number;
  /** False when it went out without the onboarding checklist link (no linked, shared board). */
  checklist?: boolean;
  error?: string;
}

/** A claim still "sending" after this long is treated as interrupted: the owner may send it by hand (never automatically). */
export const WELCOME_STALE_MS = 10 * 60_000;

type EnvelopeLike = {
  templateId: string;
  status: string;
  templateMeta: { action?: string; welcome?: boolean } | null;
  notified: { welcome?: WelcomeMark } | null | undefined;
};

/** The per-envelope switch: on by default for contract templates (also for contracts sent before this feature). */
export function welcomeEnabled(e: Pick<EnvelopeLike, 'templateId' | 'templateMeta'>): boolean {
  if (isWelcomeOptIn(e.templateId)) return e.templateMeta?.action === 'sign' && e.templateMeta?.welcome === true;
  return isWelcomeTemplate(e.templateId) && (e.templateMeta?.action ?? 'sign') === 'sign' && e.templateMeta?.welcome !== false;
}

export type WelcomeState = 'pending' | 'off' | 'sending' | 'sent' | 'failed' | 'not_sent';

export interface WelcomeStatus {
  /** False for anything that is not a contract: the UI shows nothing. */
  applies: boolean;
  state: WelcomeState;
  sentAt: string | null;
  recipients: number;
  failed: number;
  checklist: boolean | null;
  error: string | null;
  /** "Send welcome email now": a completed contract that has not sent one (or whose send failed or was interrupted). */
  canSendNow: boolean;
}

export function welcomeStatus(e: EnvelopeLike, now = Date.now()): WelcomeStatus {
  const applies = isWelcomeTemplate(e.templateId) && (e.templateMeta?.action ?? (isWelcomeOptIn(e.templateId) ? 'view' : 'sign')) === 'sign';
  const m = e.notified?.welcome;
  const base = { applies, sentAt: m?.sentAt ?? null, recipients: m?.recipients ?? 0, failed: m?.failed ?? 0, checklist: m?.checklist ?? null, error: m?.error ?? null };
  if (!applies) return { ...base, state: 'off', canSendNow: false };
  const done = e.status === 'completed';
  if (m?.state === 'sent') return { ...base, state: 'sent', canSendNow: false };
  if (m?.state === 'failed') return { ...base, state: 'failed', canSendNow: done };
  if (m?.state === 'sending') return { ...base, state: 'sending', canSendNow: done && now - Date.parse(m.claimedAt) > WELCOME_STALE_MS };
  if (!done) return { ...base, state: welcomeEnabled(e) && !['declined', 'revoked', 'expired'].includes(e.status) ? 'pending' : 'off', canSendNow: false };
  return { ...base, state: 'not_sent', canSendNow: true };
}

// ------------------------------------------------------------------ template

export const DEFAULT_WELCOME_SUBJECT = 'Welcome to Appointmentlyy, {clientShort}: next steps for your build';

export const DEFAULT_WELCOME_BODY = `Hi {firstName},

Thank you for your trust in Appointmentlyy. Your Service Agreement is now fully signed, and we're excited to start building {clientShort}'s outbound engine with you.

**What happens next**

1. **First payment.** {paymentStep}
2. **Your onboarding checklist.** {checklistStep} Start by naming your technical point of contact: the person we'll work with directly during the build for access, settings, content and a few short tests.
3. **Kickoff call.** {kickoffStep}

Build phase: {buildMonth}.
Training: {trainingWindow}.

Your signed agreement and certificate were sent in a separate email.

Best regards,
Emil Halili
Founder, Appointmentlyy`;

/**
 * The default wording for a signed custom proposal (v2): the same message, but it says "proposal", not "Service
 * Agreement". Used only when the owner has not saved their own welcome text (a saved text always wins).
 */
export const DEFAULT_WELCOME_BODY_PROPOSAL = DEFAULT_WELCOME_BODY.replace('Your Service Agreement is now fully signed', 'Your proposal is now fully signed').replace(
  'Your signed agreement and certificate were sent in a separate email.',
  'Your signed proposal and certificate were sent in a separate email.',
);

/** The body template for an envelope: the owner's saved text, else the default for its kind (contract or proposal). */
export function welcomeBodyFor(templateId: string, savedBody: string): string {
  if (savedBody.trim()) return savedBody;
  return isWelcomeOptIn(templateId) ? DEFAULT_WELCOME_BODY_PROPOSAL : DEFAULT_WELCOME_BODY;
}

/** The fixed sentences behind the three step placeholders (each has a wording for both cases). */
export const WELCOME_STEPS = {
  paymentUnpaid: 'Our team starts the build as soon as the first payment is received.',
  paymentPaid: "Thank you, we've received your first payment, so the build is underway.",
  checklistLink: 'Please work through it here: {onboardingLink}.',
  checklistNone: 'Your onboarding checklist follows shortly.',
  kickoffLink: 'Book a video call with me and your technical point of contact: {bookingLink}.',
  kickoffNone: "We'll send you a Google Meet invite for the kickoff call within 1 business day.",
} as const;

export const WELCOME_PLACEHOLDERS: { key: string; label: string; subject: boolean }[] = [
  { key: 'firstName', label: 'First name of the person it is sent to', subject: true },
  { key: 'clientShort', label: 'Client short name', subject: true },
  { key: 'paymentStep', label: 'First-payment sentence (paid or not yet paid)', subject: false },
  { key: 'checklistStep', label: 'Onboarding checklist sentence (with the link, or "follows shortly")', subject: false },
  { key: 'kickoffStep', label: 'Kickoff call sentence (booking link, or "Google Meet invite")', subject: false },
  { key: 'onboardingLink', label: 'Onboarding checklist link (line dropped when there is none)', subject: false },
  { key: 'bookingLink', label: 'Kickoff booking link (line dropped when empty)', subject: false },
  { key: 'buildMonth', label: 'Build phase month (line dropped when empty)', subject: true },
  { key: 'trainingWindow', label: 'Training window (line dropped when empty)', subject: true },
];

export const WELCOME_LIMITS = { subjectMax: 200, bodyMax: 6000, bookingLinkMax: 500 };

const PH_RE = /\{([A-Za-z]+)\}/g;
const KNOWN = new Set(WELCOME_PLACEHOLDERS.map((p) => p.key));
const SUBJECT_OK = new Set(WELCOME_PLACEHOLDERS.filter((p) => p.subject).map((p) => p.key));

/** What is wrong with an owner-edited subject or body (unknown placeholder, too long), or null. */
export function welcomeTemplateProblem(kind: 'subject' | 'body', raw: string): string | null {
  const max = kind === 'subject' ? WELCOME_LIMITS.subjectMax : WELCOME_LIMITS.bodyMax;
  if (raw.length > max) return `The welcome email ${kind} is too long (at most ${max} characters).`;
  if (kind === 'subject' && /[\r\n]/.test(raw)) return 'The welcome email subject must be one line.';
  const allowed = kind === 'subject' ? SUBJECT_OK : KNOWN;
  for (const m of raw.matchAll(PH_RE)) {
    if (!allowed.has(m[1])) {
      const list = [...allowed].map((k) => `{${k}}`).join(', ');
      return `Unknown placeholder {${m[1]}} in the welcome email ${kind}. Use: ${list}.`;
    }
  }
  return null;
}

/** The kickoff booking link: https only, no credentials, at most 500 characters (null when not acceptable). */
export function safeBookingLink(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v || v.length > WELCOME_LIMITS.bookingLinkMax || /[\s<>"'`\\]/.test(v)) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !u.hostname.includes('.') || u.username || u.password) return null;
  return v;
}

export interface WelcomeValues {
  firstName: string;
  clientShort: string;
  onboardingLink: string;
  bookingLink: string;
  buildMonth: string;
  trainingWindow: string;
  /** The linked first-payment billing statement is marked paid. */
  paid: boolean;
}

/** Sample values for "Send a test to me". */
export const WELCOME_SAMPLE: WelcomeValues = {
  firstName: 'Alex',
  clientShort: 'Sample Client',
  onboardingLink: 'https://app.appointmentlyy.com/b/sample-board-link/onboarding',
  bookingLink: '',
  buildMonth: 'March 2027',
  trainingWindow: 'the 2nd week of April 2027',
  paid: false,
};

const LINK_KEYS = new Set(['onboardingLink', 'bookingLink']);
/** Long links (the board token) wrap inside the email card on phones instead of running past it. */
const LINK_STYLE = 'color:#1d4ed8;word-break:break-all;overflow-wrap:anywhere';
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** One line of plain text (values never carry line breaks or control characters). */
const clean = (s: string) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();

export interface RenderedWelcome {
  subject: string;
  /** Paragraphs as safe HTML (lines joined with <br>). */
  htmlParagraphs: string[];
  text: string;
}

/**
 * Render the subject and body. The three step placeholders become their fixed sentences first; then any line with
 * a placeholder whose value is empty (or unknown) is dropped, so a raw {placeholder} is never shown. In the HTML, the
 * template text and every value are escaped separately; **bold** comes from the template only; the two links are
 * the only anchors (plus https:// addresses the owner typed into the template).
 */
export function renderWelcome(subjectTpl: string, bodyTpl: string, raw: WelcomeValues): RenderedWelcome {
  const v: Record<string, string> = {
    firstName: clean(raw.firstName) || 'there',
    clientShort: clean(raw.clientShort),
    onboardingLink: safeBookingLink(raw.onboardingLink) ?? '',
    bookingLink: safeBookingLink(raw.bookingLink) ?? '',
    buildMonth: clean(raw.buildMonth),
    trainingWindow: clean(raw.trainingWindow),
  };
  const steps: Record<string, string> = {
    paymentStep: raw.paid ? WELCOME_STEPS.paymentPaid : WELCOME_STEPS.paymentUnpaid,
    checklistStep: v.onboardingLink ? WELCOME_STEPS.checklistLink : WELCOME_STEPS.checklistNone,
    kickoffStep: v.bookingLink ? WELCOME_STEPS.kickoffLink : WELCOME_STEPS.kickoffNone,
  };

  // Subject: one line; a missing value is removed and the punctuation around it tidied.
  const subject = clean(
    (subjectTpl || DEFAULT_WELCOME_SUBJECT)
      .replace(PH_RE, (_, k: string) => (SUBJECT_OK.has(k) ? v[k] ?? '' : ''))
      .replace(/\s+([,:;.!?])/g, '$1')
      .replace(/,\s*:/g, ':')
      .replace(/^[,:;\s]+/, ''),
  ).slice(0, 250);

  const expanded = (bodyTpl || DEFAULT_WELCOME_BODY).replace(/\r\n?/g, '\n').replace(/\{(paymentStep|checklistStep|kickoffStep)\}/g, (_, k: string) => steps[k]);
  const kept: string[] = [];
  for (const line of expanded.split('\n')) {
    const keys = [...line.matchAll(PH_RE)].map((m) => m[1]);
    if (keys.some((k) => !KNOWN.has(k) || !(v[k] ?? ''))) continue;
    kept.push(line.replace(/\s+$/, ''));
  }
  // Paragraphs: blank lines separate them (several blank lines left by dropped lines count as one).
  const paras: string[][] = [];
  let cur: string[] = [];
  for (const line of kept) {
    if (!line.trim()) {
      if (cur.length) paras.push(cur);
      cur = [];
    } else cur.push(line);
  }
  if (cur.length) paras.push(cur);

  const textLine = (line: string) => line.replace(PH_RE, (_, k: string) => v[k] ?? '').replace(/\*\*/g, '');
  const htmlLine = (line: string) => {
    let out = '';
    let last = 0;
    for (const m of line.matchAll(PH_RE)) {
      out += literal(line.slice(last, m.index));
      const val = v[m[1]] ?? '';
      // Values: escaped, and "*" neutralised so a value can never open or close bold.
      const safe = escHtml(val).replace(/\*/g, '&#42;');
      out += LINK_KEYS.has(m[1]) ? `<a href="${safe}" style="${LINK_STYLE}">${safe}</a>` : safe;
      last = (m.index ?? 0) + m[0].length;
    }
    out += literal(line.slice(last));
    return out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  };
  return {
    subject,
    htmlParagraphs: paras.map((p) => p.map(htmlLine).join('<br>')),
    text: paras.map((p) => p.map(textLine).join('\n')).join('\n\n') + '\n',
  };
}

/** Template text (not values): escaped, owner-typed https:// addresses linked (trailing punctuation left outside). */
function literal(s: string): string {
  return escHtml(s).replace(/https:\/\/[^\s<]+/g, (url) => {
    const m = url.match(/^(.*?)([.,;:!?)]*)$/) as RegExpMatchArray;
    return `<a href="${m[1]}" style="${LINK_STYLE}">${m[1]}</a>${m[2]}`;
  });
}
