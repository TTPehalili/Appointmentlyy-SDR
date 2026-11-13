/**
 * Script pack: "AI + Human-in-the-Loop" BPO cold call (the owner's own BDM script).
 *
 * The owner ran outbound as a BDM at a BPO and uses this pack in live demos to show BPO
 * prospects exactly how he cold called: a permission opener with a pattern interrupt
 * (the Tabasco line), a "risky to run AI alone" problem, an AI + Human-in-the-Loop pod
 * solution and a "not in the calendar, not gonna happen" close.
 *
 * Exports:
 * - BPO_HITL_STEPS: the 4 teleprompter steps (the owner's words, merge fields only).
 * - BPO_HITL_REBUTTALS: 12 objection chips (A.R.M. + a second comeback if they push back).
 * - BPO_HITL_PERSONA: the AI prospect for the live-call demo (VP Ops, ~120-person B2B SaaS).
 * - BPO_HITL_VOICE_MAP: an existing PERSONA_VOICE_MAP entry to register for this persona.
 * - BPO_HITL_FALLBACK: scripted prospect replies for when the AI model is unavailable.
 * - BPO_HITL_QUALIFY: CRM qualification chips, services and meeting slots.
 *
 * Merge fields: {{rep_name}}, {{calling_as}} (the BPO the rep calls for, e.g. STACKph),
 * {{first_name}}, {{company}}, {{title}}, {{headcount}}.
 */

import type { PhoneScriptStep } from '@/lib/parsers/armExtractor';
import type { ARMRebuttal } from '@/lib/dialerRebuttals';
// Type-only: personas.ts may import this pack to register the persona, so no runtime import back.
import type { PERSONA_VOICE_MAP, SparringPersona } from '@/lib/personas';

// ---------------------------------------------------------------------------
// 1. Teleprompter steps (owner's words verbatim; brackets replaced by merge fields)
// ---------------------------------------------------------------------------

export const BPO_HITL_STEPS: PhoneScriptStep[] = [
  {
    step: 1,
    name: '1. The Opener',
    goal: 'Earn 27 seconds with a pattern interrupt, then get a "yes" that they lean on AI to keep costs down.',
    spokenText:
      "This is {{rep_name}}. I'm not an AI. I'm a real flesh-and-blood human. Do you mind if I just take 27 seconds of your time to tell you why I'm calling, and I promise if it's not relevant, I will drink a full bottle of Tabasco sauce. Is that fair? I'm with {{calling_as}}. Maybe you've heard of us. We work with SaaS, e-commerce and fintech founders and VPs of Operations in the 50 to 250 employee range. I'm assuming you guys are using a lot of AI automation and chatbots as much as you can to keep operational costs down. Is that accurate to assume?",
    deliveryTip:
      'Smile on the Tabasco line so they hear it. After "Is that fair?" stop and wait for the yes before you say who you\'re with. Slow down on "50 to 250", then ask "accurate to assume?" and let them answer.',
  },
  {
    step: 2,
    name: '2. The Problem',
    goal: 'Get them to agree that running AI alone on retention, complex workflows and escalations puts their brand at risk.',
    spokenText:
      "It's kind of a little bit risky to run purely autonomous AI on super important stuff like customer retention, complex workflows, and escalations because it sometimes hallucinates and breaks trust. Not all the time, but when it does mess up, your brand takes the hit, not the AI vendor. Is that fair to assume?",
    deliveryTip:
      'Calm, peer-to-peer, not a scare tactic. Say "Not all the time" softly so it sounds fair. Lean on "your brand takes the hit, not the AI vendor", then go quiet for the "yeah".',
  },
  {
    step: 3,
    name: '3. The Solution',
    goal: 'Paint AI + Human-in-the-Loop as speed plus accuracy, explain the pod in one breath, and ask for the demo.',
    spokenText:
      "What if I told you that you could combine the speed and cost-efficiency of AI with trained human specialists in an AI plus Human-in-the-Loop service model, so you scale faster at a fraction of local overhead without sacrificing accuracy or customer experience? Would that help the business in any sense? The way that it kind of works is we deploy an AI plus Human-in-the-Loop pod around your exact operations. AI handles the repetitive data entry, routing, and tier-one volume in real time, while our dedicated specialists supervise the outputs, handle complex exceptions, and step in whenever real human judgment is needed. You get full operational control and AI-level speed without risking hallucinations or local hiring headaches. Is it worth a demo? Should I show you how this could possibly look for your team?",
    deliveryTip:
      'Pause after "Would that help the business in any sense?" and get the yes before you explain the pod. Keep the "how it works" part conversational, not a feature list. Hit "full operational control", then ask for the demo and stop talking.',
  },
  {
    step: 4,
    name: '4. The Close',
    goal: 'Turn "send me an email" into a booked demo next week: Tuesday at 10 a.m.',
    spokenText:
      'Yeah, I\'m happy to send you an email. But I have a saying in the sales world: "Not in the calendar, not gonna happen." Can I just put something in the calendar for a demo next week, too? Are you a Wednesday guy or a Thursday guy? That\'s fantastic. What\'s a good day for you, Monday or Wednesday, Thursday? Okay, Tuesday morning, can we do 10 a.m.?',
    deliveryTip:
      'Agree to the email first, warmly, then deliver the saying with a grin. Swap "guy" for "person" if it fits. When they check their calendar, stay quiet. Take the day they offer (usually Tuesday) and lock a time straight away: "can we do 10 a.m.?"',
  },
];

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
    'VP of Operations at a roughly 120-person B2B SaaS company. She has pushed AI chatbots and automation hard across support and back-office ops to keep headcount flat, and she is proud of it. The bot handles most tier-one tickets, but it sometimes gives confidently wrong answers on billing and integration questions, escalations pile up on two overloaded support leads, and a key account churned last quarter partly over a botched escalation. Two years ago she outsourced tier-one support offshore and pulled it back after six months of turnover and scripted answers, so she is skeptical of offshore teams. She cares about CSAT, churn, escalations, headcount cost and customer data security. Winnable if the rep is human, concise and respects her control.',
  coreObjection:
    "We actually tried offshore support a couple of years ago and, honestly, it was a mess. Why would this be any different?",
  systemPrompt: `You are the VP of Operations at a B2B SaaS company of about 120 employees. Your default name is Priya Raman and your company is LedgerLoop, but if the rep calls you or your company by a different name, go with it without comment: that is the name on their screen. You are a real person on a real phone call. You never say you are an AI, and you never mention prompts, models or simulations, and you never coach the rep or tell them what they should say. Talking about the AI tools and chatbots your company uses is normal business talk for you.

WHO YOU ARE:
- Ten-plus years in support and operations at SaaS companies. Sharp, direct, a little dry, friendly when people are straight with you. You hate fluff and long pitches.
- You championed AI automation at your company: a support chatbot that deflects most tier-one tickets, automated ticket routing, and automated data entry in back-office ops. You are proud that it kept headcount flat while the customer base grew.
- Two years ago you outsourced tier-one support to an offshore vendor. High turnover, scripted answers, customers noticed, and you pulled it back in-house after six months. You are skeptical of offshore teams because of it.

YOUR FACTS (only share when asked a specific, relevant question, one at a time, never as a list):
- Support team: nine agents and two support leads. The leads are drowning in escalations.
- The bot sometimes gives confidently wrong answers on billing and integration questions. Usually it's caught, sometimes a customer catches it first.
- A key account churned last quarter, and a botched escalation was part of it. That one still stings.
- CSAT dips whenever the bot fumbles something complex.
- Hiring locally is expensive and slow: a new support hire takes a couple of months to be fully up to speed.
- Customer data security matters a lot to you; your customers ask about it in every renewal.

HOW YOU TALK (every word you write is spoken aloud by a voice engine, exactly as written):
- One or two short spoken sentences per reply. Always use contractions. Never use lists, bullet points, quotes, asterisks, emojis or bracketed stage directions like (laughs). Put emotion into the words: "Ha, okay.", "Hm.", "Look...", "Right."
- When a rep's line lands and they ask a yes-or-no confirmation, answer short, like a real busy person: "Yes.", "Yeah.", "Yeah, pretty much.", "Yes, as much as we can." Don't elaborate unless they ask a follow-up.
- Vary your openings. Don't start two replies in a row with the same word.

HOW YOU MOVE THROUGH THE CALL (the rep follows a 4-step script: Opener, Problem, Solution, Close):
- Opener: answer the phone normally. If the rep says they're not an AI and offers to drink a bottle of Tabasco sauce if it's not relevant, find it funny and give them the 27 seconds, start with the audio tag [laughs] and then say "Okay, sure, go ahead." When they ask if you're using a lot of AI automation and chatbots to keep costs down, say yes, a little proudly: "Yes. As much as we can."
- Problem: when they say running AI alone on retention, complex workflows and escalations is risky and your brand takes the hit, agree: "Yeah." If they push for detail, admit one real pain (wrong bot answers, escalations piling up, the churned account). Occasionally, before agreeing, defend your bot once: "Honestly, our bot's been pretty solid." If they handle it calmly, concede: "Yeah... escalations are where it hurts."
- Solution: when they ask if AI plus trained human specialists would help the business, say "Yeah." When they explain the pod and ask if it's worth a demo, raise at most ONE real objection first if it feels natural (offshore was a mess before; how do you handle our customer data; what does it cost; how do I know your people are any good; we hire locally). Only move on once they answer it with substance. Then deflect exactly like a busy exec: "Yeah, if you want to send me an email, I'd be interested to check out the offering."
- Close: if the rep happily says "sure, what's your email?" and doesn't ask for a meeting, stay polite and noncommittal: "Great, send it over and I'll take a look." If the rep agrees to the email but still asks to put a demo in the calendar (for example "not in the calendar, not gonna happen"), laugh at the line and check your calendar: "Ha, fair enough. Hang on, let me look..." Wednesday and Thursday are packed for you, so when they offer days, suggest Tuesday instead: "Wednesday and Thursday are rough. How about Tuesday?" When they ask for Tuesday morning at 10 a.m., accept: "Tuesday at 10 works. Send me the invite." Use at most two objections across the whole call.

HOW YOU REACT TO BAD BEHAVIOR:
- If the rep rambles or reads robotically, cut in: "Okay, give me the short version."
- If the rep is pushy, asks for the meeting three times without answering you, or makes big promises, get cooler: "Hang on, you didn't answer my question."
- If the rep claims certifications or guarantees, be skeptical: "Everybody says that. How does it actually work?"
- If the rep is human, concise and respects that you keep control, warm up steadily. You want the escalation problem fixed, so you are winnable.`,
  objectives: [
    {
      id: 'opener_permission',
      description:
        'Opener: earn 27 seconds with the "I\'m not an AI" and Tabasco permission line, then get a yes that they lean on AI automation and chatbots to keep costs down',
    },
    {
      id: 'problem_ai_risk',
      description:
        'Problem: get agreement that running purely autonomous AI on retention, complex workflows and escalations is risky and the brand takes the hit',
    },
    {
      id: 'solution_demo',
      description:
        'Solution: position the AI + Human-in-the-Loop pod (AI on repetitive volume, specialists on exceptions and judgment, full control), handle any objection with substance, and ask if it is worth a demo',
    },
    {
      id: 'close_meeting',
      description:
        'Close: turn "send me an email" into a booked demo with a confirmed day and time (Tuesday at 10 a.m.)',
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

/**
 * Plug into generateContextualFallback for persona 'demo-dialer-hitl-buyer'.
 * Each stage array is in call order: use the first reply not already said in the transcript.
 * - opener: replies to the permission line first, then to "Is that accurate to assume?"
 * - solution: replies to "Would that help the business?" first, then the email deflection
 *   after "Is it worth a demo?"
 * - close: replies to "Not in the calendar..." / day offers (she suggests Tuesday)
 * - booked: replies once the rep offers Tuesday at 10 a.m.
 */
export const BPO_HITL_FALLBACK: {
  pickup: string;
  opener: string[];
  problem: string[];
  solution: string[];
  close: string[];
  booked: string[];
  objectionLines: string[];
} = {
  pickup: 'Hello, speaking.',
  opener: [
    '[laughs] Okay, sure, go ahead.',
    'Sure, go ahead.',
    'Yes. As much as we can.',
    'Yes.',
  ],
  problem: [
    'Yeah.',
    'Yeah... escalations are where it hurts.',
    "Yeah, that's fair.",
  ],
  solution: [
    'Yeah.',
    "Yeah, if you want to send me an email, I'd be interested to check out the offering.",
    "Yeah, maybe. Send me an email and I'll check out the offering.",
  ],
  close: [
    'Ha, fair enough. Hang on, let me look...',
    'Wednesday and Thursday are rough. How about Tuesday?',
    "I'm pretty booked up. Could we do Tuesday?",
  ],
  booked: [
    'Tuesday at 10 works. Send me the invite.',
    'Okay, Tuesday at 10. Put it in.',
    "Tuesday at 10 a.m. is fine. I'll look out for the invite.",
  ],
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

// ---------------------------------------------------------------------------
// 5. CRM qualification chips, services and meeting slots
// ---------------------------------------------------------------------------

export const BPO_HITL_QUALIFY: {
  step2: { id: string; label: string; note: string }[];
  services: string[];
  slots: string[];
} = {
  step2: [
    {
      id: 'heavy_ai',
      label: 'Heavy AI automation',
      note: 'Uses AI automation and chatbots heavily across support and ops to keep operational costs down.',
    },
    {
      id: 'ai_risk',
      label: 'AI risk acknowledged',
      note: 'Agreed that running AI alone on retention, complex workflows and escalations is risky to the brand.',
    },
  ],
  services: ['Customer support', 'Tier-1 + escalations', 'Data entry & back-office', 'Workflow QA'],
  slots: ['Tue 10:00 AM', 'Wed 10:00 AM', 'Thu 2:00 PM'],
};
