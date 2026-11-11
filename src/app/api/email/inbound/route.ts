import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getResendApiKey } from '@/lib/resendConfig';
import { getConversationThreadKey, extractCleanEmailAddress } from '@/lib/emailStore';
import { getServerSession } from '@/lib/server/session';
import {
  allowUnsignedWithoutSecret,
  logRejection,
  verifySvixSignature,
  webhookSecret,
} from '@/lib/server/webhookSignatures';

const INBOUND_STORE_FILE = path.join(process.cwd(), '.inbound_emails.json');

function readStoredInboundEmails(): any[] {
  try {
    if (!fs.existsSync(INBOUND_STORE_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(INBOUND_STORE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Could not read inbound store file:', e);
    return [];
  }
}

function writeStoredInboundEmails(emails: any[]): void {
  try {
    fs.writeFileSync(INBOUND_STORE_FILE, JSON.stringify(emails, null, 2), 'utf-8');
  } catch (e) {
    console.error('Could not save to inbound store file:', e);
  }
}

/**
 * Sync inbound emails from Resend Inbound Receiving API
 */
async function syncFromResendReceiving(): Promise<any[]> {
  const apiKey = getResendApiKey();
  if (!apiKey) return [];

  try {
    const listRes = await fetch('https://api.resend.com/emails/receiving', {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store'
    });

    if (!listRes.ok) {
      console.warn('[RESEND RECEIVING SYNC] Non-200 from Resend:', listRes.status);
      return [];
    }

    const listData = await listRes.json();
    const receivedList = Array.isArray(listData.data) ? listData.data : [];

    if (receivedList.length === 0) {
      return [];
    }

    const currentStored = readStoredInboundEmails();
    const storedIds = new Set(currentStored.map(m => m.id));
    const newItems: any[] = [];

    for (const item of receivedList) {
      if (storedIds.has(item.id)) continue;

      try {
        const detailRes = await fetch(`https://api.resend.com/emails/receiving/${item.id}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          cache: 'no-store'
        });

        if (!detailRes.ok) continue;
        const detail = await detailRes.json();

        const rawFrom = detail.from || item.from || 'prospect@targetcompany.com';
        const cleanFrom = extractCleanEmailAddress(rawFrom);
        const nameMatch = rawFrom.match(/^([^<]+)<([^>]+)>/);
        let leadName = nameMatch ? nameMatch[1].trim() : rawFrom.split('@')[0];
        const companyDomain = rawFrom.includes('@') ? rawFrom.split('@')[1].split('.')[0] : 'Prospect';
        let leadCompany = companyDomain.charAt(0).toUpperCase() + companyDomain.slice(1);

        if (cleanFrom.includes('callview.ai')) {
          leadName = 'Emil Halili';
          leadCompany = 'Callview AI';
        } else if (leadName.length > 0) {
          leadName = leadName.charAt(0).toUpperCase() + leadName.slice(1);
        }

        const msgSubject = detail.subject || item.subject || 'Re: apex lead burn';
        const msgTo = Array.isArray(detail.to) ? detail.to[0] : (detail.to || 'reply@estuegai.resend.app');

        const threadId = getConversationThreadKey({
          direction: 'inbound',
          from: rawFrom,
          to: msgTo,
          subject: msgSubject
        });

        const messageRecord = {
          id: item.id,
          threadId: threadId,
          direction: 'inbound',
          from: rawFrom,
          to: msgTo,
          subject: msgSubject,
          body: (detail.text || detail.html || 'Received reply.').trim(),
          timestamp: detail.created_at || item.created_at || new Date().toISOString(),
          status: 'delivered',
          leadName: leadName,
          leadCompany: leadCompany,
          provider: 'resend_live',
          read: false
        };

        newItems.push(messageRecord);
      } catch (err: any) {
        console.warn('[RESEND RECEIVING DETAIL ERROR]', item.id, err.message);
      }
    }

    if (newItems.length > 0) {
      const merged = [...newItems, ...currentStored];
      writeStoredInboundEmails(merged);
      return merged;
    }

    return currentStored;
  } catch (e: any) {
    console.error('[RESEND RECEIVING SYNC ERROR]', e.message);
    return [];
  }
}

/**
 * GET: Retrieve all inbound emails received by Resend Inbound or local ingest
 */
export async function GET(req: NextRequest) {
  try {
    // The platform inbox receives replies for every workspace. Until each message is tagged with
    // its workspace, only Appointmentlyy staff can read it; client workspaces get their own
    // tagged messages only.
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

    // 1. Sync from Resend Receiving API
    await syncFromResendReceiving();

    // 2. Read and normalize all stored inbound messages with canonical thread keys
    const rawEmails = readStoredInboundEmails();
    let hasChanges = false;
    const emails = rawEmails.map((m: any) => {
      const canonicalThreadId = getConversationThreadKey({
        direction: 'inbound',
        from: m.from,
        to: m.to,
        subject: m.subject,
        threadId: m.threadId
      });
      let updatedLeadName = m.leadName;
      let updatedLeadCompany = m.leadCompany;
      const cleanFrom = extractCleanEmailAddress(m.from);
      if (cleanFrom.includes('callview.ai')) {
        if (!updatedLeadName || updatedLeadName === 'emil' || updatedLeadName === 'Prospect') {
          updatedLeadName = 'Emil Halili';
        }
        if (!updatedLeadCompany || updatedLeadCompany === 'Callview' || updatedLeadCompany === 'Prospect') {
          updatedLeadCompany = 'Callview AI';
        }
      }
      if (m.threadId !== canonicalThreadId || m.leadName !== updatedLeadName || m.leadCompany !== updatedLeadCompany) {
        hasChanges = true;
        return {
          ...m,
          threadId: canonicalThreadId,
          leadName: updatedLeadName,
          leadCompany: updatedLeadCompany
        };
      }
      return m;
    });

    if (hasChanges) {
      writeStoredInboundEmails(emails);
    }

    const visible = session.isPlatformAdmin ? emails : emails.filter((m: any) => m.tenantCode === session.tenantCode);
    return NextResponse.json({
      success: true,
      count: visible.length,
      emails: visible
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to read inbound emails' },
      { status: 500 }
    );
  }
}

/**
 * Inbound Email Webhook & Local Ingest Handler
 * 
 * Receives incoming emails and replies from Resend Inbound, SendGrid, email relays,
 * or local testing ingestion, and persists them into the unified inbox.
 */
/** JSON.parse that returns null instead of throwing. */
function parseJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const ROUTE = 'INBOUND EMAIL WEBHOOK';
const SECRET_ENV = 'RESEND_WEBHOOK_SECRET';
const MAX_BODY_BYTES = 1_000_000;

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
    }

    // Two callers: a signed-in member adding a reply by hand (session cookie), or Resend's webhook
    // (no cookie), which must carry a valid Svix signature when RESEND_WEBHOOK_SECRET is set.
    // Without that secret, unsigned calls are refused in production.
    const session = await getServerSession(req);
    let fromProvider = false;
    if (!session) {
      const secret = webhookSecret(SECRET_ENV);
      if (secret) {
        const v = verifySvixSignature({
          secret,
          id: req.headers.get('svix-id'),
          timestamp: req.headers.get('svix-timestamp'),
          signature: req.headers.get('svix-signature'),
          rawBody,
        });
        if (!v.ok) {
          logRejection(ROUTE, `Rejected a webhook call: ${v.reason}.`);
          return NextResponse.json({ error: 'Unauthorized webhook call.' }, { status: 401 });
        }
        fromProvider = true;
      } else if (!allowUnsignedWithoutSecret(ROUTE, SECRET_ENV)) {
        return NextResponse.json({ error: 'Unauthorized webhook call.' }, { status: 401 });
      }
    }

    const payload = parseJson(rawBody);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return NextResponse.json({ error: 'Body must be a JSON object.' }, { status: 400 });
    }

    // Resend's event envelope ({ type, created_at, data: { email_id, ... } }) carries no message
    // body: pull the full message from Resend's receiving API instead (same path as GET's sync).
    if (fromProvider && typeof payload.type === 'string' && payload.data && typeof payload.data === 'object') {
      if (payload.type === 'email.received') await syncFromResendReceiving();
      return NextResponse.json({ received: true, type: payload.type });
    }

    // Standard webhook extraction (supporting Resend, SendGrid, or custom relay)
    const from = payload.from || payload.sender || payload.headers?.from || 'emil@callview.ai';
    const to = payload.to || payload.recipient || 'emil@appointmentlyy.com';
    const subject = payload.subject || 'Re: apex lead burn';
    const body = payload.body || payload.text || payload.plain_text || payload.html || 'Thank you for reaching out.';
    
    // Extract lead name from "Name <email>" format if present
    const cleanFrom = extractCleanEmailAddress(from);
    const nameMatch = from.match(/^([^<]+)<([^>]+)>/);
    let leadName = payload.leadName || (nameMatch ? nameMatch[1].trim() : from.split('@')[0]);
    const companyDomain = from.includes('@') ? from.split('@')[1].split('.')[0] : 'Prospect Company';
    let leadCompany = payload.leadCompany || (companyDomain.charAt(0).toUpperCase() + companyDomain.slice(1));

    if (cleanFrom.includes('callview.ai')) {
      leadName = 'Emil Halili';
      leadCompany = 'Callview AI';
    } else if (leadName.length > 0) {
      leadName = leadName.charAt(0).toUpperCase() + leadName.slice(1);
    }

    const threadId = payload.thread_id || payload.threadId || getConversationThreadKey({
      direction: 'inbound',
      from: from,
      to: to,
      subject: subject
    });

    const inboundMessage = {
      id: payload.id || `inbound_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      threadId: threadId,
      direction: 'inbound',
      from: from,
      to: to,
      subject: subject,
      body: body,
      timestamp: payload.timestamp || new Date().toISOString(),
      status: 'delivered',
      leadName: leadName,
      leadCompany: leadCompany,
      provider: 'resend_live',
      read: false,
      // A reply added by a signed-in member belongs to their workspace (GET shows clients only their own).
      ...(session ? { tenantCode: session.tenantCode } : {})
    };

    // Persist to local JSON file
    const current = readStoredInboundEmails();
    const updated = [inboundMessage, ...current.filter(m => m.id !== inboundMessage.id)];
    writeStoredInboundEmails(updated);

    console.log(`[INBOUND EMAIL RECEIVED] From: ${from} | Subject: "${subject}" | Thread: ${threadId}`);

    return NextResponse.json({
      received: true,
      message: inboundMessage,
      allCount: updated.length
    });
  } catch (error: any) {
    console.error('[INBOUND EMAIL WEBHOOK ERROR]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process inbound webhook' },
      { status: 500 }
    );
  }
}
