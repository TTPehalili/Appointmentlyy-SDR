/**
 * The Dialer's objection chips and their A.R.M. rebuttals (Acknowledge, Respond, Move).
 * Shared by the Dialer and the Practice landing page, so reps drill the same objections they see on live calls.
 */

export interface ARMRebuttal {
  id: string;
  shortLabel: string;
  category: string;
  trigger: string;
  acknowledge: string;
  respond: string;
  move: string;
  fullSpoken: string;
}

// The platform owner's own pitch: demo workspace only.
export const DEMO_PRESET_REBUTTALS: ARMRebuttal[] = [
  {
    id: 'OBJ_SEND_EMAIL',
    shortLabel: 'Send Email / Busy',
    category: 'Brush-Off',
    trigger: "I'm busy. Just send me an email.",
    acknowledge: "Totally fair, {{first_name}}, you weren't expecting me.",
    respond: "I'll resend yesterday's note, but so it's actually useful, one quick question.",
    move: 'How long does it take a new rep to ramp at {{company}}?',
    fullSpoken: "Totally fair, {{first_name}}, you weren't expecting me. I'll resend yesterday's note, but so it's actually useful, one quick question. How long does it take a new rep to ramp at {{company}}?"
  },
  {
    id: 'OBJ_HAVE_TEAM',
    shortLabel: 'Have Internal Team',
    category: 'Internal Team',
    trigger: 'We already have our own SDR team.',
    acknowledge: 'Makes sense, {{first_name}}. Most floors your size do.',
    respond: "We don't replace them. We make them better: faster ramp and live objection help on every call.",
    move: 'How are your juniors handling price objections right now?',
    fullSpoken: "Makes sense, {{first_name}}. Most floors your size do. We don't replace them. We make them better: faster ramp and live objection help on every call. How are your juniors handling price objections right now?"
  },
  {
    id: 'OBJ_PRICING',
    shortLabel: 'How Much / Price?',
    category: 'Pricing',
    trigger: 'How much does this cost? Just tell me the price.',
    acknowledge: 'Fair, {{first_name}}, the numbers have to work.',
    respond: "It depends on seats and campaigns, so I won't guess. Emil can price your floor in 15 minutes.",
    move: 'Does Thursday at 2 PM or Friday morning work better?',
    fullSpoken: "Fair, {{first_name}}, the numbers have to work. It depends on seats and campaigns, so I won't guess. Emil can price your floor in 15 minutes. Does Thursday at 2 PM or Friday morning work better?"
  },
  {
    id: 'OBJ_NO_BUDGET',
    shortLabel: 'No Budget',
    category: 'Budget',
    trigger: "We don't have budget for this right now.",
    acknowledge: 'Totally get it, margins are tight.',
    respond: "So skip the budget line: run a pilot paid per booked meeting, funded by the new seats you're adding.",
    move: 'Worth 15 minutes with Emil to map it out?',
    fullSpoken: "Totally get it, margins are tight. So skip the budget line: run a pilot paid per booked meeting, funded by the new seats you're adding. Worth 15 minutes with Emil to map it out?"
  },
  {
    id: 'OBJ_SHARED_LEADS_OA',
    shortLabel: 'Use Lead Brokers',
    category: 'Lead Vendors',
    trigger: 'We already buy our leads from Outsource Accelerator.',
    acknowledge: "Makes sense, they're great for volume.",
    respond: 'But three or four rival BPOs often get the same list. We build private, verified lists only you call.',
    move: 'How often are your reps the first to call?',
    fullSpoken: "Makes sense, they're great for volume. But three or four rival BPOs often get the same list. We build private, verified lists only you call. How often are your reps the first to call?"
  },
  {
    id: 'OBJ_HOW_DID_YOU_GET_NUMBER',
    shortLabel: 'Got My Number?',
    category: 'Compliance',
    trigger: 'How did you get my direct number?',
    acknowledge: "Fair question, {{first_name}}, I'd ask the same.",
    respond: 'We use business data tools like Apollo and Sales Navigator to reach outbound leaders at growing BPOs.',
    move: "Since I've got you, how's new-rep ramp time looking this quarter?",
    fullSpoken: "Fair question, {{first_name}}, I'd ask the same. We use business data tools like Apollo and Sales Navigator to reach outbound leaders at growing BPOs. Since I've got you, how's new-rep ramp time looking this quarter?"
  }
];


const armRebuttal = (r: Omit<ARMRebuttal, 'fullSpoken'>): ARMRebuttal => ({
  ...r,
  fullSpoken: `${r.acknowledge} ${r.respond} ${r.move}`,
});

/** Neutral starter rebuttals for client workspaces ({{my_company}} is the workspace name). */
export const NEUTRAL_PRESET_REBUTTALS: ARMRebuttal[] = [
  armRebuttal({
    id: 'OBJ_SEND_EMAIL',
    shortLabel: 'Send Email / Busy',
    category: 'Brush-Off',
    trigger: 'Just send me an email / I am busy right now',
    acknowledge: 'Happy to, {{first_name}}. I know I caught you in the middle of your day.',
    respond: 'So I send you something useful instead of another generic email, can I ask one quick question about how {{company}} handles this today?',
    move: "If it isn't relevant, I'll say thanks and let you go. Fair enough?",
  }),
  armRebuttal({
    id: 'OBJ_HAVE_TEAM',
    shortLabel: 'Already Covered',
    category: 'Incumbent',
    trigger: 'We already have a team / provider for this',
    acknowledge: 'That makes sense, {{first_name}}. Most teams like yours already have something in place.',
    respond: 'We usually work alongside what you already have, and the teams we help often just wanted better results in one specific area.',
    move: "Would it hurt to compare notes for 15 minutes and see if there's anything worth improving?",
  }),
  armRebuttal({
    id: 'OBJ_PRICING',
    shortLabel: 'How Much / Price?',
    category: 'Pricing',
    trigger: 'How much does this cost? Just tell me the price.',
    acknowledge: 'Completely fair, {{first_name}}. You need to know the numbers make sense before you spend any time on this.',
    respond: "Pricing depends on what {{company}} actually needs, so I don't want to quote you something that doesn't fit.",
    move: 'Can we set up a short call where we look at your situation and give you a real number? How does later this week look?',
  }),
  armRebuttal({
    id: 'OBJ_NO_BUDGET',
    shortLabel: 'No Budget',
    category: 'Budget',
    trigger: "We don't have budget for this right now",
    acknowledge: 'I hear you. Budgets are tight and every spend has to earn its place.',
    respond: "Most of the people we work with didn't have a budget line for this either until they saw what it could save or bring in.",
    move: "Let's leave money aside for now: would a 15-minute look at whether it's worth it be useful?",
  }),
  armRebuttal({
    id: 'OBJ_NOT_INTERESTED',
    shortLabel: 'Not Interested',
    category: 'Brush-Off',
    trigger: "I'm not interested",
    acknowledge: "Totally fair, {{first_name}}. You didn't expect my call.",
    respond: "Before I go, is that because this isn't a priority at {{company}} right now, or because you've already solved it?",
    move: "If it's timing, when would be a better moment to check back in?",
  }),
  armRebuttal({
    id: 'OBJ_HOW_DID_YOU_GET_NUMBER',
    shortLabel: 'Got My Number?',
    category: 'Compliance',
    trigger: 'How did you get my direct phone number?',
    acknowledge: "Fair question, {{first_name}}. I'd ask the same thing.",
    respond: 'We use business contact data providers to reach the people who lead this area at companies like {{company}}.',
    move: 'Since I have you for a moment, is this something on your radar this quarter?',
  }),
];

/** The objection chips for this workspace: the owner's own pitch in the demo workspace, neutral starters elsewhere. */
export function getPresetRebuttals(isDemo: boolean): ARMRebuttal[] {
  return isDemo ? DEMO_PRESET_REBUTTALS : NEUTRAL_PRESET_REBUTTALS;
}
