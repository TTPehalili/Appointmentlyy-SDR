/**
 * Script pack: "AI + Human-in-the-Loop" BPO cold call (the owner's own BDM script).
 *
 * The owner ran outbound as a BDM at a BPO and uses this pack in live demos to show BPO
 * prospects how he cold called: a permission opener with a pattern interrupt (the Tabasco
 * line), then a short, question-led discovery call where the prospect does most of the
 * talking (~70% prospect, ~30% rep), a one-line AI + Human-in-the-Loop fit and a
 * "not in the calendar, not gonna happen" close.
 *
 * Exports:
 * - BPO_HITL_BEAT_STEPS: the 4 teleprompter steps as beats (short rep lines / questions, each
 *   with the prospect's possible answers as buttons that go into the CRM note).
 * - BPO_HITL_STEPS: the same 4 steps as whole PhoneScriptSteps (beat lines joined).
 * - BPO_HITL_REBUTTALS: 12 objection chips (A.R.M. + a second comeback if they push back).
 * - BPO_HITL_PERSONA: the AI prospect for the live-call demo (VP Ops, ~120-person B2B SaaS).
 * - BPO_HITL_VOICE_MAP: an existing PERSONA_VOICE_MAP entry to register for this persona.
 * - BPO_HITL_FALLBACK / bpoHitlScriptedReply: scripted prospect replies for when the AI model
 *   is unavailable (one canonical answer per beat).
 *
 * Merge fields: {{rep_name}}, {{calling_as}} (the BPO the rep calls for, e.g. STACKph),
 * {{first_name}}, {{company}}, {{title}}, {{headcount}}.
 */

import type { PhoneScriptStep } from '@/lib/parsers/armExtractor';
import type { ARMRebuttal } from '@/lib/dialerRebuttals';
// Type-only: personas.ts may import this pack to register the persona, so no runtime import back.
import type { PERSONA_VOICE_MAP, SparringPersona } from '@/lib/personas';
// Type-only as well: index.ts imports this file at runtime.
import type { ScriptBeatStep } from './index';

// ---------------------------------------------------------------------------
// 1. Teleprompter beats (short lines and questions; the answers are the prospect's likely replies)
// ---------------------------------------------------------------------------

export const BPO_HITL_BEAT_STEPS: ScriptBeatStep[] = [
  {
    step: 1,
    name: '1. The Opener',
    goal: 'Earn 27 seconds with a pattern interrupt, then get them talking about how they run support today.',
    deliveryTip: 'Smile on the Tabasco line so they hear it. Every question: ask it, then stop talking.',
    beats: [
      {
        id: 'permission',
        text: "Hi {{first_name}}, this is {{rep_name}}. I'm not an AI, I'm a real flesh-and-blood human. Can I take 27 seconds to tell you why I'm calling? If it's not relevant, I'll drink a full bottle of Tabasco. Fair?",
        deliveryTip: 'Smile on the Tabasco line, then wait for the yes.',
        crmLabel: 'Permission',
        answers: [
          { id: 'go_ahead', label: 'Go ahead' },
          { id: 'busy', label: 'Busy, call later' },
          { id: 'not_interested', label: 'Not interested' },
        ],
      },
      {
        id: 'current_setup',
        text: "I'm with {{calling_as}}. We help SaaS and e-commerce ops leaders scale support without adding local headcount. So I don't waste your time: how are you handling support and ops volume today?",
        deliveryTip: 'Ask, then stop talking. Let them describe it.',
        crmLabel: 'Support & ops today',
        answers: [
          { id: 'ai', label: 'Mostly AI/chatbots' },
          { id: 'in_house', label: 'In-house team' },
          { id: 'outsourced', label: 'Outsourced partner' },
          { id: 'mix', label: 'Mix' },
        ],
      },
    ],
  },
  {
    step: 2,
    name: '2. The Problem',
    goal: 'Discovery: let them tell you where AI breaks, how often, what it costs and who cleans it up.',
    deliveryTip: 'Short questions, long silences. They should do most of the talking here.',
    beats: [
      {
        id: 'who_catches',
        text: 'When the AI gets something wrong, like an escalation, a refund or an upset customer, who catches it today?',
        deliveryTip: 'Ask, then stop talking.',
        crmLabel: 'Who catches AI mistakes',
        answers: [
          { id: 'customers', label: 'Customers do' },
          { id: 'team', label: 'Our team' },
          { id: 'vendor', label: 'A vendor' },
          { id: 'not_sure', label: 'Not sure' },
        ],
      },
      {
        id: 'frequency',
        text: 'How often does that happen in a normal week?',
        deliveryTip: 'Keep it casual and let them estimate.',
        crmLabel: 'How often (per week)',
        answers: [
          { id: 'rarely', label: 'Rarely' },
          { id: 'few', label: 'A few times' },
          { id: 'daily', label: 'Daily' },
        ],
      },
      {
        id: 'cost',
        text: 'When it does, what does it cost you most?',
        deliveryTip: "Let the pain land. Don't rush to pitch.",
        crmLabel: 'Biggest cost',
        answers: [
          { id: 'churn', label: 'Churn risk' },
          { id: 'refunds', label: 'Refunds/credits' },
          { id: 'overtime', label: 'Team overtime' },
          { id: 'brand', label: 'Brand complaints' },
        ],
      },
      {
        id: 'team_size',
        text: 'How many people handle that today?',
        deliveryTip: 'Note the number: it sizes the pod.',
        crmLabel: 'People handling it',
        answers: [
          { id: 'small', label: '1–5' },
          { id: 'mid', label: '6–15' },
          { id: 'large', label: '16+' },
        ],
      },
    ],
  },
  {
    step: 3,
    name: '3. The Solution',
    goal: 'Tie their answers to the AI + Human-in-the-Loop pod in one line, then find the first workflow and who else decides.',
    deliveryTip: 'One line of pitch, then straight back to questions.',
    beats: [
      {
        id: 'fit',
        text: "That's exactly where we fit. AI handles the repetitive tier-1 volume, and our specialists check its work and take the exceptions, so mistakes get caught before customers see them.",
        deliveryTip: 'Say it in one breath. If they ask how it works: "Inside your tools, with the access you set." Then ask the next question.',
        crmLabel: 'Fit',
        answers: [],
      },
      {
        id: 'first_workflow',
        text: 'If you could fix one workflow first, which would it be?',
        deliveryTip: 'Ask, then stop talking.',
        crmLabel: 'First workflow',
        answers: [
          { id: 'support', label: 'Customer support' },
          { id: 'tier1', label: 'Tier-1 + escalations' },
          { id: 'back_office', label: 'Data entry & back-office' },
          { id: 'qa', label: 'Workflow QA' },
        ],
      },
      {
        id: 'decision',
        text: 'Besides you, who else would weigh in on something like this?',
        deliveryTip: 'Whoever they name, invite them to the demo too.',
        crmLabel: 'Also weighs in',
        answers: [
          { id: 'just_me', label: 'Just me' },
          { id: 'ceo', label: 'Founder/CEO' },
          { id: 'finance', label: 'Finance' },
          { id: 'ops', label: 'Ops team' },
        ],
      },
    ],
  },
  {
    step: 4,
    name: '4. The Close',
    goal: 'Book 15 minutes. If they ask for an email, agree, then still lock a day: Tuesday at 10 a.m.',
    deliveryTip: 'Stay quiet while they check their calendar.',
    beats: [
      {
        id: 'demo_ask',
        text: 'Worth a 15-minute look at how a pod would run on that workflow?',
        deliveryTip: 'Ask once, then stop talking.',
        crmLabel: 'Demo ask',
        answers: [
          { id: 'yes', label: 'Yes' },
          { id: 'email', label: 'Send an email first' },
          { id: 'not_now', label: 'Not now' },
        ],
      },
      {
        id: 'slot',
        caption: 'If they ask for an email',
        text: 'Happy to send it. But I have a saying: "Not in the calendar, not gonna happen." Wednesday or Thursday?',
        deliveryTip: 'Agree to the email warmly, grin on the saying. Take the day they offer and lock a time: "Tuesday morning, can we do 10 a.m.?"',
        crmLabel: 'Meeting',
        meeting: true,
        answers: [
          { id: 'tue_10', label: 'Tue 10:00 AM', slot: 'Tue 10:00 AM' },
          { id: 'wed_10', label: 'Wed 10:00 AM', slot: 'Wed 10:00 AM' },
          { id: 'thu_14', label: 'Thu 2:00 PM', slot: 'Thu 2:00 PM' },
          { id: 'other', label: 'Other time' },
        ],
      },
    ],
  },
];

/** The same 4 steps as whole steps (each step's beat lines joined), for code that reads steps. */
export const BPO_HITL_STEPS: PhoneScriptStep[] = BPO_HITL_BEAT_STEPS.map((s) => ({
  step: s.step,
  name: s.name,
  goal: s.goal,
  spokenText: s.beats.map((b) => b.text).join(' '),
  deliveryTip: s.deliveryTip,
}));

// ---------------------------------------------------------------------------
// 2. Objection chips (A.R.M. + a second comeback if they push back again)
// ---------------------------------------------------------------------------

export type BpoHitlRebuttal = ARMRebuttal & { ifPushedBack: string };

const hitl = (r: Omit<BpoHitlRebuttal, 'fullSpoken'>): BpoHitlRebuttal => ({
  ...r,
  fullSpoken: `${r.acknowledge} ${r.respond} ${r.move}`,
});

export const BPO_HITL_REBUTTALS: BpoHitlRebuttal[] = [
  hitl({
    id: 'bpo_ai_only',
    shortLabel: 'AI Works Fine',
    category: 'Status Quo',
    trigger: "We're fine with AI only. Our chatbot handles it.",
    acknowledge: "Love that, {{first_name}}. That's exactly why I called you.",
    respond:
      "We don't replace your bot. Our people sit behind it and catch what it can't own: the angry customer, the edge case, the churn risk. That's where your brand takes the hit.",
    move: 'Fifteen minutes to see it next to your bot. Wednesday or Thursday?',
    ifPushedBack:
      "Totally fair if it's working. Quick one: when the bot gets it wrong today, who catches it, and how fast? If the answer's \"a customer\", that's the demo. Worth 15 minutes Thursday?",
  }),
  hitl({
    id: 'bpo_offshore_burned',
    shortLabel: 'Offshore Burned Us',
    category: 'Past Experience',
    trigger: 'We tried offshore before and it was a mess.',
    acknowledge: "Ugh, I hear that a lot, and I'd be skeptical too.",
    respond:
      "Usually it breaks because a team gets thrown in cold, with no supervision and no say from you. We build the pod around your workflows, you keep the controls, and you see the work every day.",
    move: "Let me show you exactly how it's run. Wednesday or Thursday?",
    ifPushedBack:
      "Fair, you got burned once, so don't take my word for it. Look at how the pod's run, ask the hard questions, and if it smells like last time, hang up on me. Thursday?",
  }),
  hitl({
    id: 'bpo_security',
    shortLabel: 'Data Security',
    category: 'Security & Compliance',
    trigger: "What about data security? It's our customers' data, and there's SOC 2 and compliance to think about.",
    acknowledge: 'Good, you should ask that first, {{first_name}}.',
    respond:
      'Your data stays in your tools. Our people work inside your systems with the access you set, under NDA, and you decide who sees what. Your security team gets to grill us before anyone touches anything.',
    move: 'Want to bring your security lead to the demo? Wednesday or Thursday?',
    ifPushedBack:
      "Straight answer: I won't guess on certifications on a cold call. I'll bring someone who can answer it, and walk your security team through access controls, NDAs and how data stays in your tools. Thursday at 10?",
  }),
  hitl({
    id: 'bpo_price',
    shortLabel: "What's It Cost?",
    category: 'Pricing',
    trigger: 'Sounds expensive. What does this even cost?',
    acknowledge: "Fair, {{first_name}}, the numbers have to work or it's a no.",
    respond:
      'It depends on the pod: how many specialists, which workflows, what hours. The real comparison is your next local hire, not your chatbot bill, so I\'d rather build you a real number than guess.',
    move: "Give me 15 minutes and you'll leave with a ballpark. Wednesday or Thursday?",
    ifPushedBack:
      "Totally, and I'm not dodging. If I quote blind, I'm either too high and you hang up, or too low and I'm making it up. Fifteen minutes, real scope, real number. Thursday?",
  }),
  hitl({
    id: 'bpo_send_email',
    shortLabel: 'Just Email Me',
    category: 'Brush-Off',
    trigger: 'Just send me an email.',
    acknowledge: "Happy to send it, {{first_name}}, it'll be in your inbox today.",
    respond:
      'But I have a saying: not in the calendar, not gonna happen. An email tells you about it; the demo shows it on your workflows.',
    move: "Let's pencil in 15 minutes next week, and if the email kills it, cancel. Wednesday or Thursday?",
    ifPushedBack:
      "Totally fair, let's do both. I send the email today and we hold a tentative 15 minutes. Read it first, and if it's not relevant, hit decline. The Tabasco offer still stands. Tuesday or Thursday?",
  }),
  hitl({
    id: 'bpo_not_priority',
    shortLabel: 'Not a Priority',
    category: 'Timing',
    trigger: "It's not a priority this quarter.",
    acknowledge: "Totally get it, {{first_name}}, there's a lot on your plate this quarter.",
    respond:
      "That's exactly why it's worth a look now. Escalations and churn don't wait for next quarter, and a pod takes time to set up, so you'd have a plan ready when it does become a priority.",
    move: 'No commitment, just 15 minutes. Wednesday or Thursday?',
    ifPushedBack:
      "Fair enough. Quick gut check: if a bad AI answer cost you a key account next month, would it be a priority then? If that's a maybe, let's grab 15 minutes. If not, I'll back off. Thursday?",
  }),
  hitl({
    id: 'bpo_in_house',
    shortLabel: 'We Hire Locally',
    category: 'In-House',
    trigger: 'We hire locally. We keep this stuff in-house.',
    acknowledge: 'Makes sense, {{first_name}}, a lot of teams like to keep it close.',
    respond:
      "We don't replace your team. The pod soaks up the volume and the exceptions, so your local people do the work that really needs them, and you skip the hiring headaches every time you grow.",
    move: 'Let me show you how it fits. Wednesday or Thursday?',
    ifPushedBack:
      "Totally, keep them. Honest question: what does your next local hire cost all-in, and how long until they're up to speed? If that answer stings, 15 minutes is worth it. Wednesday?",
  }),
  hitl({
    id: 'bpo_have_vendor',
    shortLabel: 'Already Have a BPO',
    category: 'Incumbent',
    trigger: 'We already have a BPO for this.',
    acknowledge: 'Good, so you already know outsourcing can work for {{company}}.',
    respond:
      "A lot of vendors give you people or give you AI. We run both together, with specialists supervising the AI, so it's worth seeing what that looks like before your next renewal.",
    move: 'No switching talk, just a 15-minute comparison. Wednesday or Thursday?',
    ifPushedBack:
      "Totally respect that, I'm not asking you to fire anyone. There might be one workflow they don't cover, like escalations or checking the AI's work. Worth 15 minutes to find out? Thursday at 10?",
  }),
  hitl({
    id: 'bpo_different',
    shortLabel: 'How Are You Different?',
    category: 'Differentiation',
    trigger: 'How is this different from every other BPO?',
    acknowledge: 'Great question, and honestly, a lot of BPO pitches do sound the same.',
    respond:
      "The difference is it's not just bodies in seats. We build an AI plus Human-in-the-Loop pod around your exact operations: AI brings the speed, our specialists own the judgment, and you keep full control.",
    move: 'Easier to show than tell. Are you a Wednesday or a Thursday person?',
    ifPushedBack:
      "Fair, everyone says they're different. So judge it yourself. Bring your messiest workflow to the demo and watch how the pod would handle it. If it looks like every other BPO, I'll drink the Tabasco. Wednesday?",
  }),
  hitl({
    id: 'bpo_wrong_person',
    shortLabel: 'Not the Right Person',
    category: 'Referral',
    trigger: "I'm not the right person for this.",
    acknowledge: 'Appreciate you telling me, {{first_name}}, that saves us both time.',
    respond:
      "Who owns support and ops workflows at {{company}}? I'd rather talk to the right person than keep bugging the wrong one.",
    move: 'Could you loop them into 15 minutes Wednesday or Thursday, or point me their way?',
    ifPushedBack:
      "No problem at all. Mind if I mention you told me to reach out, so I'm not a total stranger? And if they're keen, you're welcome on the demo too.",
  }),
  hitl({
    id: 'bpo_six_months',
    shortLabel: 'Call Me in 6 Months',
    category: 'Timing',
    trigger: 'Call me back in six months.',
    acknowledge: "Happy to, {{first_name}}, I'll put it in my calendar.",
    respond:
      "Quick question so I call back with something useful: what changes in six months? If it's budget or a new quarter, seeing it now means you've got a plan ready when that hits.",
    move: 'Fifteen minutes now, and you decide the timing. Wednesday or Thursday?',
    ifPushedBack:
      "Totally fair. I'll set the reminder for six months. In the meantime, mind if I send one short email on what a pod looks like, so the next call isn't from a stranger?",
  }),
  hitl({
    id: 'bpo_quality',
    shortLabel: 'Are Your People Good?',
    category: 'Proof',
    trigger: 'How do I know your people are any good?',
    acknowledge: "You shouldn't just take my word for it, {{first_name}}.",
    respond:
      "On the demo we'll walk you through how specialists are picked, trained on your workflows and quality-checked, and you can grill us on anything.",
    move: "If it doesn't hold up, you've lost 15 minutes. Wednesday or Thursday?",
    ifPushedBack:
      "Fair. Then judge it on one workflow first: your rules, your QA, your eyes on the output. If the work isn't good, you'll see it fast and you walk. Can I show you how that would look Thursday?",
  }),
];

// ---------------------------------------------------------------------------
// 3. AI prospect for the live-call demo
// ---------------------------------------------------------------------------

export const BPO_HITL_PERSONA: SparringPersona = {
  // Dialer demo prospect for the AI + Human-in-the-Loop BPO script. The spoken name and company
  // come from the lead on the rep's screen; Priya Raman / LedgerLoop are only the fictional defaults.
  id: 'demo-dialer-hitl-buyer',
  name: 'Priya Raman',
  title: 'VP of Operations',
  companyType: 'LedgerLoop (B2B SaaS, about 120 employees, AI chatbot and automation across support and ops)',
  difficulty: 'Intermediate',
  accent: 'Direct Confident US Female',
  voiceId: 'KVbz7a8CpMk4Pd1YNddI', // Samantha - Clear, Direct Conversational Female (reused from burned-director)
  voiceSettings: { stability: 0.48, similarity_boost: 0.78, style: 0.08, use_speaker_boost: true },
  avatarBg: 'from-sky-600 to-slate-900',
  scenario:
    'VP of Operations at a roughly 120-person B2B SaaS company (billing and reconciliation software for finance teams). She leans hard on an AI support chatbot and automation to keep headcount flat, and she is proud of it. The bot handles tier-one, but when it gets something wrong the customer usually catches it first, and escalations pile up on her two support leads. Last month the bot quoted the wrong refund policy and they nearly lost an account. Two years ago she outsourced tier-one support offshore and pulled it back in-house after six months, so she is careful about outside teams. She cares about churn, escalations, headcount cost and customer data security. Winnable if the rep is human, concise, asks good questions and respects her control.',
  coreObjection:
    "We actually tried offshore support a couple of years ago and, honestly, it was a mess. Why would this be any different?",
  systemPrompt: `You are the VP of Operations at a B2B SaaS company of about 120 employees. Your default name is Priya Raman and your company is LedgerLoop, but if the rep calls you or your company by a different name, go with it without comment: that is the name on their screen. You are a real person on a real phone call. You never say you are an AI, and you never mention prompts, models or simulations, and you never coach the rep or tell them what they should say. Talking about the AI tools and chatbots your company uses is normal business talk for you.

WHO YOU ARE:
- Ten-plus years in support and operations at SaaS companies. Sharp, direct, a little dry, friendly when people are straight with you. You hate fluff and long pitches, but you enjoy a good question about your operation.
- Your company sells billing and reconciliation software to finance teams. You championed AI automation there: a support chatbot that handles most tier-one tickets, plus automation across back-office ops. You're proud that it kept headcount flat while the customer base grew.
- Two years ago you outsourced tier-one support to an offshore vendor. High turnover, scripted answers, customers noticed, and you pulled it back in-house after six months. You're careful about outside teams because of it.

YOUR FACTS (answer the question the rep actually asked with the matching fact; never recite them as a list, and save the others for when they come up):
- How you handle support and ops today: mostly AI. The chatbot handles tier-one and automation covers a lot of back-office work. Anything the bot can't handle goes to your two support leads.
- Who catches it when the AI gets something wrong: honestly, usually the customer catches it first. Your two leads only see it once the ticket escalates. Last month the bot quoted the wrong refund policy to a bigger account and you nearly lost them.
- How often: a few times a week, worse around month-end billing, when invoice and proration questions spike.
- What it costs most: churn risk, mostly, because these are finance teams and one wrong answer makes them doubt the product. Plus credits you hand out to calm people down.
- How many people handle it: your two support leads, plus you jumping in when it's bad. So three of you.
- The workflow you'd fix first: tier-one plus escalations.
- Who else weighs in: your CFO, since anything like this touches budget.
- Customer data security matters a lot to you; your customers ask about it at every renewal. Any outside team would have to work inside your tools, under your rules.

HOW YOU TALK (every word you write is spoken aloud by a voice engine, exactly as written):
- When the rep asks you a real question about your business, answer it like a person thinking out loud: one to three specific spoken sentences, about 25 to 45 words, using your facts. Never more than about 45 words. Short reactions ("Ha, fair enough.") are fine when nothing was asked.
- Always use contractions. Never use lists, bullet points, quotes, asterisks, emojis or bracketed stage directions like (laughs). Put emotion into the words: "Ha, okay.", "Hm.", "Honestly...", "Right."
- Vary your openings. Don't start two replies in a row with the same word.

HOW YOU MOVE THROUGH THE CALL (the rep follows a short, question-led script: Opener, Problem, Solution, Close):
- Opener: answer the phone normally. If the rep says they're not an AI and offers to drink a bottle of Tabasco if it's not relevant, find it funny and give them the 27 seconds: start with the audio tag [laughs] and then say "Okay, sure, go ahead." When they ask how you handle support and ops volume today, tell them: mostly the chatbot on tier-one plus automation, and your two support leads take what it can't handle.
- Problem: they ask short discovery questions (who catches AI mistakes, how often, what it costs, how many people handle it). Answer each one honestly and specifically from your facts. Don't stall, don't push back on being asked.
- Solution: after their one-line "that's where we fit" pitch, react with short, genuine interest as a statement (no question), like "Okay, that's actually interesting. That's exactly what we're missing." When they ask which workflow you'd fix first, say tier-one plus escalations and why. When they ask who else weighs in, say you'd loop in your CFO since it touches budget.
- Close: when they ask if a 15-minute look is worth it, say exactly: "Yeah, if you want to send me an email, I'd be interested to check out the offering." If the rep agrees to the email but still asks for a day ("not in the calendar, not gonna happen", Wednesday or Thursday), laugh at the line and check your calendar: Wednesday and Thursday are rough, so suggest Tuesday. When they ask for Tuesday morning at 10 a.m., accept: "Tuesday at 10 works. Send me the invite." If the rep only takes your email and never asks for a meeting, stay polite and noncommittal: "Great, send it over and I'll take a look."
- Use at most one objection across the whole call (for example offshore was a mess before, how do you handle our customer data, what does it cost), and only when the rep goes off-script or right after your email line. Move on once they answer it with substance.

HOW YOU REACT TO BAD BEHAVIOR:
- If the rep rambles or reads robotically, cut in: "Okay, give me the short version."
- If the rep is pushy, asks for the meeting three times without answering you, or makes big promises, get cooler: "Hang on, you didn't answer my question."
- If the rep claims certifications or guarantees, be skeptical: "Everybody says that. How does it actually work?"
- If the rep is human, concise and respects that you keep control, warm up steadily. You want the escalation problem fixed, so you are winnable.`,
  objectives: [
    {
      id: 'opener_permission',
      description:
        'Opener: earn 27 seconds with the "I\'m not an AI" and Tabasco permission line, then get them describing how they handle support and ops volume today',
    },
    {
      id: 'problem_ai_risk',
      description:
        'Problem: discovery questions that get them talking: who catches AI mistakes, how often it happens, what it costs most and how many people handle it',
    },
    {
      id: 'solution_demo',
      description:
        'Solution: one-line AI + Human-in-the-Loop fit (AI on tier-1 volume, specialists check its work and take the exceptions), then the first workflow and who else weighs in',
    },
    {
      id: 'close_meeting',
      description:
        'Close: ask for a 15-minute look and turn "send me an email" into a booked demo with a confirmed day and time (Tuesday at 10 a.m.)',
    },
  ],
  initialScriptAssist: {
    objectionType: 'Burned by Offshore ("We tried offshore before and it was a mess")',
    recommendedScript:
      "Ugh, I hear that a lot, and I'd be skeptical too. Usually it breaks because a team gets thrown in cold, with no supervision and no say from you. We build the pod around your workflows, you keep the controls, and you see the work every day. Let me show you exactly how it's run. Wednesday or Thursday?",
    tacticalRationale:
      'Validate the bad experience without trashing anyone, name why it usually fails (no supervision, no control), reframe to her control and visibility, then offer an easy calendar choice.',
    arm: {
      acknowledge: 'Validate her bad offshore experience and her skepticism',
      respond: 'Explain the pod is built around her workflows, supervised, with her keeping the controls and seeing the work daily',
      move: 'Offer a short demo of how the pod is run: Wednesday or Thursday?',
    },
  },
};

/**
 * Practice mode resolves voices through PERSONA_VOICE_MAP / getPersonaVoiceByCountry, whose fallback
 * picks a male voice for unknown persona ids. Register this entry as
 * PERSONA_VOICE_MAP['demo-dialer-hitl-buyer'] so practice calls keep a female voice
 * (a copy of the existing burned-director entry: no new voice ids).
 */
export const BPO_HITL_VOICE_MAP: (typeof PERSONA_VOICE_MAP)[string] = {
  isFemale: true,
  USA: { voiceId: 'KVbz7a8CpMk4Pd1YNddI', label: 'American Direct Female (Samantha)' },
  Australia: { voiceId: 'uWAhmTxbFR3p3HsniNS9', label: 'Australian Confident Female (Elle)' },
  UK: { voiceId: 'tPDVQaZ6fdDCUmYpHyYd', label: 'British Direct Conversational Female (Isabelle)' },
};

// ---------------------------------------------------------------------------
// 4. Scripted prospect replies when the AI model is unavailable
// ---------------------------------------------------------------------------

/** A beat's scripted answer: matched against the rep's line (lowercase, straight apostrophes). */
export interface HitlFallbackBeat {
  /** The beat id in BPO_HITL_BEAT_STEPS. */
  id: string;
  match: RegExp;
  /** The canonical answer first; the next one only if it was already said on this call. */
  replies: string[];
  /** How many objectives (in order) are complete once she gives this answer. */
  done: number;
  sentiment: string;
  observation: string;
}

/**
 * Scripted replies for persona 'demo-dialer-hitl-buyer' (used by bpoHitlScriptedReply).
 * - beats: one entry per teleprompter beat, in script order. She answers each discovery question
 *   with her facts (the same facts as BPO_HITL_PERSONA and her demo lead note), so the prospect
 *   does ~70% of the talking.
 * - booked: replies once the rep locks Tuesday at 10 a.m.
 * - stage: replies to lines that match no beat, by the step the rep has open.
 * - objectionLines: at most one light objection per call, only after an off-script line.
 */
export const BPO_HITL_FALLBACK: {
  pickup: string;
  beats: HitlFallbackBeat[];
  booked: string[];
  stage: { opener: string[]; problem: string[]; solution: string[]; close: string[] };
  objectionLines: string[];
} = {
  pickup: 'Hello, speaking.',
  beats: [
    {
      id: 'permission',
      match: /27 seconds|twenty.seven seconds|tabasco|why i'?m calling|flesh.and.blood|not an ai\b/,
      replies: [
        "[laughs] Okay, sure, go ahead. That's a new one. You've got your 27 seconds, and I'm holding you to the Tabasco.",
        'Sure, go ahead.',
      ],
      done: 0,
      sentiment: 'neutral',
      observation: 'Prospect laughed at the Tabasco line and gave the rep 27 seconds.',
    },
    {
      id: 'current_setup',
      match: /handling support|support and ops|ops volume|how are you handling|scale support|local headcount/,
      replies: [
        "Mostly AI, honestly. We've got a chatbot handling tier-one and a lot of automation on the back-office side, which is how we've kept headcount flat while we grew. Anything the bot can't handle goes straight to my two support leads, and they're stretched.",
        'Like I said, mostly the chatbot, and my two support leads take whatever it can\'t handle.',
      ],
      done: 1,
      sentiment: 'neutral',
      observation: 'Prospect described an AI-first setup with two support leads on escalations.',
    },
    {
      id: 'who_catches',
      match: /who catches|catches it|gets something wrong|upset customer/,
      replies: [
        "Honestly? Usually the customer catches it first. My two leads only see it once the ticket escalates, and by then the customer's already annoyed. Last month the bot quoted the wrong refund policy to one of our bigger accounts, and we nearly lost them.",
        'Mostly the customer, then my leads once it escalates.',
      ],
      done: 2,
      sentiment: 'softened',
      observation: 'Prospect admitted customers usually catch AI mistakes first.',
    },
    {
      id: 'frequency',
      match: /how often|normal week|times a week|per week/,
      replies: [
        "A few times a week, I'd say. It gets worse around month-end, when billing questions spike and the bot starts guessing on invoices and proration. That's when my leads are buried in escalations and the normal queue backs up behind them.",
        'A few times a week, more around month-end.',
      ],
      done: 2,
      sentiment: 'softened',
      observation: 'Prospect sized the problem: a few times a week, worse at month-end.',
    },
    {
      id: 'cost',
      match: /cost you (the )?most|what does (that|it) cost you|costs? you/,
      replies: [
        "Churn risk, mostly. Our customers are finance teams, so one wrong answer about their invoices and they start doubting the whole product. Then we're handing out credits just to calm people down, and that adds up fast. Renewals get awkward, too.",
        'Churn risk, mostly, plus the credits.',
      ],
      done: 2,
      sentiment: 'softened',
      observation: 'Prospect named churn risk and credits as the main cost.',
    },
    {
      id: 'team_size',
      match: /how many people|how many (folks|of you)|people handle|handle that today/,
      replies: [
        "Just my two support leads, plus me jumping in when it gets bad. The rest of the team works the normal queue, so it's three of us catching whatever the bot gets wrong, on top of our actual jobs. It's a lot.",
        'Three of us: my two leads and me.',
      ],
      done: 2,
      sentiment: 'softened',
      observation: 'Prospect said three people (two leads plus her) handle AI mistakes.',
    },
    {
      id: 'fit',
      match: /where we fit|check its work|takes? the exceptions|before customers see/,
      replies: [
        "Okay, that's actually interesting. Having someone check the bot before customers see the mistakes is exactly what we're missing right now. As long as I keep control of how it's done, I'm listening.",
        'Okay, I like that. Go on.',
      ],
      done: 2,
      sentiment: 'softened',
      observation: 'Prospect reacted with interest to the AI + Human-in-the-Loop fit.',
    },
    {
      id: 'first_workflow',
      match: /one workflow|workflow first|fix first|which workflow/,
      replies: [
        "Tier-one plus escalations, no question. If someone was checking the bot's answers and owning the escalations before they hit my leads, that alone would take a ton of pressure off the whole team, especially at month-end. That's where it hurts.",
        'Tier-one plus escalations.',
      ],
      done: 3,
      sentiment: 'softened',
      observation: 'Prospect picked tier-one plus escalations as the first workflow.',
    },
    {
      id: 'decision',
      match: /who else|weigh in|besides you|decision/,
      replies: [
        "I'd loop in our CFO, since anything like this touches budget. But ops is my call, so if I bring it to them with a clear plan and numbers, they usually back me. They'll want it next to the cost of a local hire.",
        'Our CFO, since it touches budget.',
      ],
      done: 3,
      sentiment: 'softened',
      observation: 'Prospect named the CFO as the other decision maker.',
    },
    {
      id: 'demo_ask',
      match: /15.minute look|fifteen.minute look|worth a (quick )?(look|demo)|how a pod would run|should i show you|show you how/,
      replies: [
        "Yeah, if you want to send me an email, I'd be interested to check out the offering. It's pretty hectic on my end right now, so email's easier.",
        "Yeah, maybe. Send me an email and I'll check out the offering.",
      ],
      done: 3,
      sentiment: 'neutral',
      observation: 'Rep asked for the demo; prospect deflected to email.',
    },
    {
      id: 'slot',
      match: /not in the calendar|not gonna happen|not going to happen|in the calendar|\b(monday|wednesday|thursday|friday)\b|good day|which day|what day/,
      replies: [
        "Ha, fair enough. Hang on, let me look... Wednesday and Thursday are rough, that's month-end prep for us. How about Tuesday? Mornings are usually better for me.",
        "I'm pretty booked up. Could we do Tuesday?",
      ],
      done: 3,
      sentiment: 'softened',
      observation: 'Rep turned the email deflection into a calendar ask; prospect countered with Tuesday.',
    },
  ],
  booked: [
    "Tuesday at 10 works. Send me the invite, and send that email too, so I can forward it to our CFO before we talk. I'll bring one of my leads.",
    'Okay, Tuesday at 10. Put it in.',
    "Tuesday at 10 a.m. is fine. I'll look out for the invite.",
  ],
  stage: {
    opener: ["Sure. What's this about?", 'Okay, go ahead.'],
    problem: [
      "Hm. Honestly, escalations are where it hurts. The bot handles the easy stuff, but anything messy lands on my two leads.",
      "Yeah, that's fair. Month-end is the worst of it.",
    ],
    solution: ["Okay, I'm listening. That's the part we struggle with.", 'Hm, okay. Keep going.'],
    close: [
      'Ha, fair enough. Hang on, let me look... Wednesday and Thursday are rough. How about Tuesday?',
      "I'm pretty booked up. Could we do Tuesday?",
    ],
  },
  objectionLines: [
    "Honestly, our bot's been pretty solid. We're fine with AI.",
    'We tried offshore support a couple of years ago and it was a mess.',
    "It's our customers' data. How do you handle security?",
    'Okay, but what does this actually cost?',
    "It's not really a priority this quarter.",
    'We hire locally. We like keeping it in-house.',
    'How do I know your people are any good?',
  ],
};

export interface HitlScriptedReply {
  reply: string;
  completedIds: string[];
  sentiment: string;
  armObservation: string;
}

/**
 * Scripted (no AI model) replies for the AI + Human-in-the-Loop prospect. A cooperative demo prospect:
 * when the rep's line matches a beat (latest in the script first, since a rep may read a whole step
 * at once) she gives that beat's answer, never repeating a line she already said. Lines that match
 * no beat get the open step's reply; only an off-script line can draw ONE light objection, and
 * whatever the rep says next brings her straight back to the script. No randomness.
 */
export function bpoHitlScriptedReply(
  repMessage: string,
  history: Array<{ role: string; content: string }>,
  stageKey: string,
  objectionLine: string
): HitlScriptedReply {
  const F = BPO_HITL_FALLBACK;
  const lower = repMessage.toLowerCase().replace(/[‘’]/g, "'");
  const prospect = history.filter((t) => t.role === 'prospect').map((t) => String(t.content || '').trim().toLowerCase());
  const said = (line: string) => prospect.includes(line.toLowerCase());
  const pick = (lines: string[]) => lines.find((l) => !said(l)) ?? lines[lines.length - 1];
  const lastProspect = prospect[prospect.length - 1] || '';
  const objLine = objectionLine.trim();
  const objectionLines = objLine ? [objLine, ...F.objectionLines] : F.objectionLines;
  const objectionSaid = objectionLines.some(said);
  const lastWasObjection = objectionLines.some((l) => l.toLowerCase() === lastProspect);

  const ids = BPO_HITL_PERSONA.objectives.map((o) => o.id);
  const out = (reply: string, done: number, sentiment: string, armObservation: string): HitlScriptedReply => ({
    reply,
    completedIds: ids.slice(0, done),
    sentiment,
    armObservation,
  });

  // The rep locks the day she offered (or the meeting is already booked).
  if (F.booked.some(said) || /\btuesday\b/.test(lower)) {
    return out(pick(F.booked), 4, 'agreed', 'Rep held the calendar ask and booked Tuesday at 10 a.m.');
  }
  // On-script: the latest beat the line matches.
  for (let i = F.beats.length - 1; i >= 0; i--) {
    const b = F.beats[i];
    if (b.match.test(lower)) return out(pick(b.replies), b.done, b.sentiment, b.observation);
  }

  // Off-script line.
  const stage = (['opener', 'problem', 'solution', 'close'].includes(stageKey) ? stageKey : 'opener') as keyof typeof F.stage;
  const stageDone = { opener: 0, problem: 2, solution: 2, close: 3 }[stage];
  if (lastWasObjection) {
    // The rep answered the objection (with anything): straight back to the script flow.
    return out(pick(F.stage[stage]), stageDone, 'softened', 'Rep answered the objection; back on script.');
  }
  if (!objectionSaid && stage !== 'opener') {
    // At most one light objection per call, only when the rep goes off-script.
    const line = objLine || (stage === 'problem' ? F.objectionLines[0] : F.objectionLines[1]);
    return out(line, stage === 'problem' ? 1 : 2, 'skeptical', 'Prospect raised one objection after an off-script line.');
  }
  if (stage === 'opener' && !said(F.pickup)) return out(F.pickup, 0, 'neutral', 'Prospect picked up.');
  return out(pick(F.stage[stage]), stageDone, stage === 'opener' ? 'neutral' : 'softened', 'Prospect went along with the open step.');
}
