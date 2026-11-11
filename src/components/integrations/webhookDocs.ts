import {
  WEBHOOK_EVENT_ID_HEADER,
  WEBHOOK_EVENT_TYPE_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  type ActivityEventType,
  type WebhookPayload,
} from '@/lib/integrations';

/** Sample bodies for the "What you receive" panel (shape: WebhookPayload, version 1). */
const CONTACT = {
  id: 'contact_1731312000000_ab12',
  name: 'Dana Reyes',
  email: 'dana.reyes@northwind.example',
  phone: '+1 415 555 0142',
  company: 'Northwind Logistics',
  title: 'VP Operations',
  website: 'https://northwind.example',
  linkedinUrl: 'https://www.linkedin.com/in/dana-reyes-example',
};

const DATA: Record<ActivityEventType | 'test.ping', WebhookPayload['data']> = {
  'contact.created': { contact: CONTACT },
  'call.logged': {
    contact: CONTACT,
    call: { outcome: 'Meeting Booked', summary: 'Outcome: Meeting Booked\nSpoke with Dana about outbound coverage for Q1…', durationSec: 312, direction: 'outbound' },
  },
  'meeting.booked': { contact: CONTACT, meeting: { at: 'Thu 2:00 PM' } },
  'callback.scheduled': { contact: CONTACT, callback: { at: '2026-11-14T15:30:00.000Z', note: 'Call back after the board meeting' } },
  'pipeline.stage_changed': { contact: CONTACT, stage: { from: 'New Lead', to: 'Meeting Booked' } },
  'email.sent': { contact: CONTACT, email: { subject: 'following up', to: 'dana.reyes@northwind.example' } },
  'test.ping': { contact: { name: 'Test contact' } },
};

export function samplePayload(type: ActivityEventType | 'test.ping'): string {
  const body: WebhookPayload = {
    id: '6f1c2a9e-4b7d-4d2a-9a51-0c3e8f7b2d14',
    type,
    occurredAt: '2026-11-11T09:42:00.000Z',
    workspace: { code: 'ACME', name: 'Acme Outbound' },
    actor: { email: 'rep@acme.example', name: 'Jordan Lee' },
    data: DATA[type],
    version: 1,
  };
  return JSON.stringify(body, null, 2);
}

export const SIGNATURE_HEADERS = {
  signature: WEBHOOK_SIGNATURE_HEADER,
  eventId: WEBHOOK_EVENT_ID_HEADER,
  eventType: WEBHOOK_EVENT_TYPE_HEADER,
};

export const NODE_VERIFY_EXAMPLE = `import crypto from 'node:crypto';
import express from 'express';

const app = express();
const SECRET = process.env.APPOINTMENTLYY_WEBHOOK_SECRET; // the signing secret shown when you added the endpoint

// Use the RAW body: the signature covers the exact bytes we sent.
app.post('/webhooks/appointmentlyy', express.raw({ type: 'application/json' }), (req, res) => {
  const header = req.get('${WEBHOOK_SIGNATURE_HEADER}') || '';   // "t=1731318120,v1=5d41…"
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.trim().split('=')));
  const t = Number(parts.t);

  // Reject old or missing timestamps (replay protection): 5 minutes.
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return res.status(400).send('stale');

  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(\`\${t}.\${req.body.toString('utf8')}\`)
    .digest();
  const given = Buffer.from(parts.v1 || '', 'hex');

  // Constant-time compare.
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return res.status(401).send('bad signature');
  }

  const event = JSON.parse(req.body.toString('utf8'));
  // event.id (also the ${WEBHOOK_EVENT_ID_HEADER} header) is unique per event:
  // skip ids you have already processed, because retries can deliver an event twice.
  console.log(event.type, event.data.contact.name);
  res.sendStatus(200); // any 2xx within 10 seconds counts as delivered
});

app.listen(3000);`;
