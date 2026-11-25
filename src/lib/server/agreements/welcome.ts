/**
 * Server only. The welcome / kickoff email for a fully executed client contract.
 *
 *  - Trigger: completeEnvelope() calls scheduleWelcome() after its compare-and-set to `completed` succeeds, i.e.
 *    the client signed AND (when the template needs it) the owner countersigned. Completion happens once per
 *    envelope, and the send itself is claimed once more (below), so nothing here can send twice.
 *  - Once only, durably: a claim (random id) is written into the envelope's existing `notified` jsonb with a
 *    compare-and-set on "no claim yet"; the result is written with a compare-and-set on that claim id. Retries,
 *    double clicks, a second countersign attempt and a server restart all find the claim and send nothing.
 *  - It never blocks or fails the countersign: it runs after the response, and every error is caught and recorded.
 *  - Recipients: the signer and every live copy recipient, each in a separate email (like the copy feature). The
 *    email carries no signer or copy link. Reply-To is the owner.
 *  - Onboarding link: only from a Client Project whose intake card is linked to THIS envelope (exact envelope id)
 *    AND whose client name is the same client (exact, as in the H2 fix), and whose board is shared. Never by name alone.
 */
import crypto from 'node:crypto';
import { after } from 'next/server';
import { getAgreementStore } from '@/lib/server/agreementStore';
import { nowIso } from '@/lib/server/tenantStore';
import { activeCopies, paymentStatus, type AgreementSettings, type Envelope } from '@/lib/agreements/envelope';
import { clientNameOf, consoleUrl, loadSettings } from '@/lib/server/agreements/core';
import { ownerNoticeMail, sendAgreementMail, welcomeMail } from '@/lib/server/agreements/mail';
import { WELCOME_SAMPLE, isWelcomeTemplate, renderWelcome, welcomeEnabled, welcomeStatus, type WelcomeMark, type WelcomeValues } from '@/lib/agreements/welcome';

export class WelcomeError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}

const store = () => getAgreementStore();
const newClaimId = () => crypto.randomBytes(12).toString('base64url');

/**
 * Run the automatic welcome email after the current response (never in the countersign/sign request path).
 * Outside a request scope (scripts), it simply runs in the background.
 */
export function scheduleWelcome(envelopeId: string, origin?: string): void {
  const run = () =>
    sendWelcome(envelopeId, { trigger: 'auto', origin }).then(
      () => undefined,
      (err) => {
        if (!(err instanceof WelcomeError)) console.error('[agreements/welcome] not sent:', err instanceof Error ? err.message : 'error');
      },
    );
  try {
    after(run);
  } catch {
    void run();
  }
}

export interface WelcomeResult {
  sent: number;
  failed: number;
  checklist: boolean;
  error?: string;
}

/**
 * Send the welcome email for one completed contract, at most once. `auto`: silently nothing when switched off or
 * already claimed. `manual` ("Send welcome email now"): refused with a reason when already sent or in progress.
 */
export async function sendWelcome(id: string, o: { trigger: 'auto' | 'manual'; by?: string; origin?: string }): Promise<WelcomeResult> {
  const e = await store().getEnvelope(id);
  if (!e) throw new WelcomeError('Not found.', 404);
  if (!isWelcomeTemplate(e.templateId) || e.templateMeta?.action !== 'sign') throw new WelcomeError('Welcome emails are only for client contracts.');
  if (e.status !== 'completed') throw new WelcomeError('The welcome email goes out once the agreement is fully signed.');
  const prev = e.notified?.welcome;
  if (o.trigger === 'auto') {
    if (!welcomeEnabled(e)) throw new WelcomeError('The welcome email is switched off for this document.');
    if (prev) throw new WelcomeError('The welcome email was already sent.');
  } else if (prev && !welcomeStatus(e).canSendNow) {
    throw new WelcomeError(prev.state === 'sent' ? 'The welcome email was already sent.' : 'The welcome email is being sent. Reload in a moment.');
  }

  // Claim it: exactly one request wins this compare-and-set (status still completed, claim unchanged).
  const claim: WelcomeMark = { claimId: newClaimId(), state: 'sending', claimedAt: nowIso(), trigger: o.trigger, ...(o.by ? { by: o.by } : {}) };
  const claimed = await store().updateEnvelope(e.id, { notified: { ...e.notified, welcome: claim } }, ['completed'], { ifWelcomeClaim: prev?.claimId ?? null });
  if (!claimed) throw new WelcomeError('The welcome email was already sent.');

  const finish = async (mark: Partial<WelcomeMark>) => {
    const cur = (await store().getEnvelope(e.id)) ?? claimed;
    await store().updateEnvelope(e.id, { notified: { ...cur.notified, welcome: { ...claim, ...mark } } }, ['completed'], { ifWelcomeClaim: claim.claimId });
  };

  try {
    const { settings } = await loadSettings();
    const ctx = await contextFor(claimed, o.origin);
    const people = [{ email: claimed.recipient.email, name: claimed.recipient.name }, ...activeCopies(claimed.cc).map((c) => ({ email: c.email, name: c.name }))];
    const replyTo = settings.ownerEmail || settings.replyTo || settings.senderEmail;
    const results = await Promise.all(
      people.map(async (p) => {
        const r = renderWelcome(settings.welcomeSubject, settings.welcomeBody, { ...ctx.values, firstName: p.name.split(' ')[0] || '' });
        const res = await sendAgreementMail(welcomeMail({ to: p.email, subject: r.subject, htmlParagraphs: r.htmlParagraphs, text: r.text, envelopeId: e.id, replyTo }), settings);
        return { to: p.email, res };
      }),
    );
    const ok = results.filter((x) => x.res.ok).map((x) => x.to);
    const bad = results.filter((x) => !x.res.ok);
    const error = bad.length ? (bad[0].res as { error: string }).error.slice(0, 300) : undefined;
    if (ok.length) await store().addEvent({ envelopeId: e.id, type: 'welcome_sent', data: { to: ok, count: ok.length, checklist: ctx.checklist, paid: ctx.values.paid, trigger: o.trigger, ...(o.by ? { by: o.by } : {}) } });
    if (bad.length) await store().addEvent({ envelopeId: e.id, type: 'welcome_failed', data: { to: bad.map((x) => x.to), error } });
    await finish(ok.length ? { state: 'sent', sentAt: nowIso(), recipients: ok.length, failed: bad.length, checklist: ctx.checklist, ...(error ? { error } : {}) } : { state: 'failed', failed: bad.length, checklist: ctx.checklist, error });
    if (ok.length && !ctx.checklist) await noChecklistNotice(claimed, settings, ctx.reason, o.origin);
    return { sent: ok.length, failed: bad.length, checklist: ctx.checklist, ...(error ? { error } : {}) };
  } catch (err) {
    const error = err instanceof Error ? err.message.slice(0, 300) : 'error';
    await store().addEvent({ envelopeId: e.id, type: 'welcome_failed', data: { error } }).catch(() => undefined);
    await finish({ state: 'failed', error }).catch(() => undefined);
    throw err;
  }
}

/** Durable owner notice: a timeline event on the envelope, and an email to the owner's notification address. */
async function noChecklistNotice(e: Envelope, settings: AgreementSettings, reason: string, origin?: string) {
  const line = 'Welcome email sent without a checklist link: create or share the client’s onboarding board.';
  await store().addEvent({ envelopeId: e.id, type: 'welcome_no_checklist', data: { reason } });
  const to = settings.ownerEmail || settings.senderEmail;
  if (!to) return;
  const r = await sendAgreementMail(
    ownerNoticeMail({ to, subject: `Welcome email sent without a checklist link: ${e.title}`, lines: [line, reason, 'The client was told “Your onboarding checklist follows shortly.”'], consoleUrl: consoleUrl(e.id, origin), envelopeId: e.id }),
    settings,
  );
  if (!r.ok) console.warn('[agreements/welcome] owner notice not sent:', r.error);
}

// ------------------------------------------------------------------ values for one envelope

interface WelcomeContext {
  values: Omit<WelcomeValues, 'firstName'>;
  checklist: boolean;
  reason: string;
}

async function contextFor(e: Envelope, origin?: string): Promise<WelcomeContext> {
  const { settings } = await loadSettings();
  const v = e.fieldValues || {};
  const board = await linkedBoard(e, origin).catch((err) => {
    console.error('[agreements/welcome] board lookup failed:', err instanceof Error ? err.message : 'error');
    return { url: null as string | null, paidViaBoard: false, reason: 'The Client Projects board could not be checked.' };
  });
  const paid = board.paidViaBoard || (await paidStatement(e).catch(() => false));
  return {
    values: {
      clientShort: (v.clientShort || '').trim() || clientNameOf(e),
      onboardingLink: board.url ?? '',
      bookingLink: settings.kickoffBookingLink,
      buildMonth: v.buildMonth || '',
      trainingWindow: v.trainingWindow || '',
      paid,
    },
    checklist: Boolean(board.url),
    reason: board.reason,
  };
}

/** The earliest billing statement made from this contract ("Create billing statement") is paid in full. */
async function paidStatement(e: Envelope): Promise<boolean> {
  const mine = (await store().listEnvelopes())
    .filter((x) => x.billing && x.billing.sourceEnvelopeId === e.id && x.status !== 'draft' && x.status !== 'revoked')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return Boolean(mine[0]?.billing && paymentStatus(mine[0].billing) === 'paid');
}

/**
 * The client's onboarding board for this envelope: the Client Project whose intake card is linked to this exact
 * envelope id, for the same client (exact normalised name), shared. If no card is linked yet, the same-client
 * projects get their regular intake sync first (the exact, security-reviewed auto-link), then the lookup runs again.
 * Two different projects linked to one envelope count as no link (never a guess).
 */
async function linkedBoard(e: Envelope, origin?: string): Promise<{ url: string | null; paidViaBoard: boolean; reason: string }> {
  const [{ getClientProjectStore }, intake, core] = await Promise.all([
    import('@/lib/server/clientProjectStore'),
    import('@/lib/server/clientProjects/intake'),
    import('@/lib/server/clientProjects/core'),
  ]);
  const s = getClientProjectStore();
  const client = clientNameOf(e);
  const projects = (await s.listProjects()).filter((p) => intake.intakeOn(p));
  const find = async () => {
    const hits: { p: (typeof projects)[number]; reqs: Awaited<ReturnType<typeof s.listRequests>> }[] = [];
    for (const p of projects) {
      const reqs = await s.listRequests(p.id);
      if (reqs.some((r) => r.config.envelopeId === e.id)) hits.push({ p, reqs });
    }
    return hits;
  };
  let hits = await find();
  if (!hits.length) {
    for (const p of projects.filter((x) => intake.sameClient(client, x.clientName))) {
      const tasks = await s.listTasks(p.id);
      const reqs = await intake.ensureRequests(p, tasks);
      await intake.syncRequests(p, tasks, reqs, { force: true });
    }
    hits = await find();
  }
  if (!hits.length) return { url: null, paidViaBoard: false, reason: 'No Client Project is linked to this agreement yet.' };
  if (hits.length > 1) return { url: null, paidViaBoard: false, reason: 'More than one Client Project is linked to this agreement, so no board was used.' };
  const { p, reqs } = hits[0];
  // Defence in depth: a link to another client's envelope (made before the H2 guard) is never used.
  if (!intake.sameClient(client, p.clientName)) return { url: null, paidViaBoard: false, reason: `The linked Client Project is for “${p.clientName}”, not this client, so it was not used.` };
  const fresh = (await s.getProject(p.id)) ?? p;
  const live = core.liveBoardUrl(fresh, origin);
  // First payment on the board: the ordinal-1 payment card received, or its linked statement paid in full.
  let paidViaBoard = false;
  const pay = reqs.find((r) => r.kind === 'payment' && (r.config.ordinal ?? 1) === 1);
  if (pay?.sysStatus === 'received') paidViaBoard = true;
  else if (pay?.config.envelopeId) {
    const st = await store().getEnvelope(pay.config.envelopeId);
    paidViaBoard = Boolean(st?.billing && paymentStatus(st.billing) === 'paid');
  }
  if (!live) return { url: null, paidViaBoard, reason: `The onboarding board for ${p.clientName} is not shared yet.` };
  return { url: `${live}/onboarding`, paidViaBoard, reason: '' };
}

// ------------------------------------------------------------------ "Send a test to me"

/** Render with sample values (and the given, possibly unsaved, template) and email it to the owner only. */
export async function sendWelcomeTest(draft: Pick<AgreementSettings, 'kickoffBookingLink' | 'welcomeSubject' | 'welcomeBody'>): Promise<{ to: string; ok: boolean; error?: string }> {
  const { settings } = await loadSettings();
  const to = settings.ownerEmail || settings.senderEmail;
  if (!to) throw new WelcomeError('Set the address for your notifications first.', 400);
  const r = renderWelcome(draft.welcomeSubject, draft.welcomeBody, { ...WELCOME_SAMPLE, bookingLink: draft.kickoffBookingLink });
  const res = await sendAgreementMail(
    welcomeMail({ to, subject: `[Test] ${r.subject}`, htmlParagraphs: r.htmlParagraphs, text: r.text, replyTo: settings.ownerEmail || settings.replyTo || settings.senderEmail, kind: 'welcome_test' }),
    settings,
  );
  return res.ok ? { to, ok: true } : { to, ok: false, error: res.error };
}
