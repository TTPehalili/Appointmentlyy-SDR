/**
 * Sample templates for the demo (APPOINTMENTLYY) workspace only, written in the platform owner's
 * BPO voice. Client workspaces never get these: they start with an empty library.
 * Every body is under 90 words and ends with one low-pressure question.
 */
import type { TemplateInput } from '@/lib/emailTemplates';

export const DEMO_SEED_AUTHOR = 'sample';

const COLD_CAMPAIGN = 'BPO owners: shared leads';
const AFTER_CALL = 'After the call';

type Seed = { key: string } & TemplateInput;

const base = { visibility: 'team' as const, assignedTo: [] as string[], archived: false, outcomeTags: [] as string[] };

export const DEMO_TEMPLATE_SEEDS: Seed[] = [
  {
    ...base,
    key: 'cold-1',
    name: 'Shared leads: email 1',
    campaign: COLD_CAMPAIGN,
    purpose: 'sequence',
    sequenceStep: 1,
    frameworkId: 'braun-poke-the-bear',
    subject: 'shared leads at {{company}}',
    body: `Hi {{first_name}},

Most BPO owners I talk to buy leads from the same directories as everyone else. The prospect gets three calls the same morning and picks whoever is cheapest.

At {{sender_company}} we book meetings with decision makers who only hear from you.

Is price shopping on shared leads a headache at {{company}}, or have you already solved it?

Best,
{{sender_name}}`,
  },
  {
    ...base,
    key: 'cold-2',
    name: 'Shared leads: email 2',
    campaign: COLD_CAMPAIGN,
    purpose: 'sequence',
    sequenceStep: 2,
    frameworkId: 'voss-no-oriented',
    subject: 'the race to the bottom',
    body: `Hi {{first_name}},

One more thought on my last note. When several BPOs pitch the same lead, the conversation turns to price before it ever turns to value.

Exclusive meetings change that. You walk in as the only provider in the room.

Would it be a bad idea to compare notes on how {{company}} wins new clients today?

Best,
{{sender_name}}`,
  },
  {
    ...base,
    key: 'cold-3',
    name: 'Shared leads: email 3',
    campaign: COLD_CAMPAIGN,
    purpose: 'sequence',
    sequenceStep: 3,
    frameworkId: 'before-after-bridge',
    subject: '{{company}} new clients',
    body: `Hi {{first_name}},

Right now most BPO teams chase directory leads that other providers are calling too.

The owners we work with have a calendar of meetings with buyers who asked to hear from them, and nobody else is on the call.

The bridge is an outbound team that books those meetings for you.

Open to a 2-minute video showing how it works, or not a priority right now?

Best,
{{sender_name}}`,
  },
  {
    ...base,
    key: 'cold-breakup',
    name: 'Shared leads: breakup',
    campaign: COLD_CAMPAIGN,
    purpose: 'breakup',
    sequenceStep: 4,
    frameworkId: 'voss-no-oriented',
    subject: 'closing the loop',
    body: `Hi {{first_name}},

I have reached out a few times without hearing back, so I will assume new client meetings are not a priority at {{company}} right now.

No hard feelings at all. If that changes, my door is open.

Have you given up on winning clients outside the shared directories?

Best,
{{sender_name}}`,
  },
  {
    ...base,
    key: 'after-booked',
    name: 'After the call: booked',
    campaign: AFTER_CALL,
    purpose: 'followup',
    sequenceStep: null,
    frameworkId: '',
    outcomeTags: ['Booked'],
    subject: '{{meeting_time}}, next steps',
    body: `Hi {{first_name}},

Thanks for your time on the call today.

We are set for {{meeting_time}}, and the calendar invite is on its way. I will show you how we book meetings with decision makers who are not already talking to three other BPOs.

Anyone else at {{company}} worth adding to the invite?

Best,
{{sender_name}}`,
  },
  {
    ...base,
    key: 'after-callback',
    name: 'After the call: callback',
    campaign: AFTER_CALL,
    purpose: 'followup',
    sequenceStep: null,
    frameworkId: '',
    outcomeTags: ['Callback'],
    subject: 'as promised, {{callback_time}} call',
    body: `Hi {{first_name}},

Thanks for picking up today, even on a busy day.

As promised, I will call you back {{callback_time}}. Until then, one thought: the BPOs we work with stopped competing on price once their meetings stopped coming from shared lists.

Anything you want me to bring to that call?

Best,
{{sender_name}}`,
  },
  {
    ...base,
    key: 'after-not-interested',
    name: 'After the call: not interested',
    campaign: AFTER_CALL,
    purpose: 'followup',
    sequenceStep: null,
    frameworkId: '',
    outcomeTags: ['Not interested'],
    subject: 'thanks for the honesty',
    body: `Hi {{first_name}},

Thanks for being straight with me today. I would rather hear a clear no than keep chasing you.

If new client meetings move up the list at {{company}}, I am an easy reply away.

Mind if I check back next quarter?

Best,
{{sender_name}}`,
  },
  {
    ...base,
    key: 'reply-pricing',
    name: 'Reply: what does it cost?',
    campaign: '',
    purpose: 'reply',
    sequenceStep: null,
    frameworkId: '',
    subject: 're: pricing',
    body: `Hi {{first_name}},

Fair question. Pricing depends on how many meetings {{company}} wants each month and which markets you sell into, so I would rather not guess and get it wrong.

A 15-minute call is enough to give you a real number.

Would it be crazy to grab 15 minutes this week, or should I send a short overview first?

Best,
{{sender_name}}`,
  },
];
