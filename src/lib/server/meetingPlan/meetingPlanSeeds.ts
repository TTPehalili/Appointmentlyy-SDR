/**
 * Sample Meeting Action Plans for the demo (APPOINTMENTLYY) workspace only, so the Meetings page is
 * never empty in a sales demo. Client workspaces never get these.
 *
 * Every company, person and email here is fictional (.example domains). The plans sell Appointmentlyy
 * itself: done-for-you appointment setting plus the SDR platform (Dialer with live ARM objection
 * prompts, Sparring Arena practice calls, ICP List Builder, Cold Email and LinkedIn Studios, Floor
 * Monitor, Workflows). Numbers in the plans are only ones the fictional prospect "said" on the call;
 * there are no prices, guarantees or case-study results. Each seed passes normalizeActionPlan /
 * normalizeOnePager unchanged (see plan.ts).
 */
import type { ActionPlan, CallContext, LeadSnapshot, OnePagerCopy, ResearchSummary } from '@/lib/meetingPlan';

export interface MeetingPlanSeed {
  seedKey: string;
  lead: LeadSnapshot;
  call: CallContext;
  research: ResearchSummary;
  plan: ActionPlan;
  onePager: OnePagerCopy;
  status: 'ready' | 'sent';
  daysAgo: number;
}

const SAMPLE_RESEARCH = { sources: [], websiteRead: false, searched: false, limitations: 'Sample plan for demo.' };

// ---------------------------------------------------------------------------------------------
// (a) Mid-size BPO evaluating outsourced outbound appointment setting
// ---------------------------------------------------------------------------------------------

const bpo: MeetingPlanSeed = {
  seedKey: 'demo-northwind-bpo',
  status: 'ready',
  daysAgo: 1,
  lead: {
    name: 'Dana Reyes',
    email: 'dana.reyes@northwind-bpo.example',
    company: 'Northwind Contact Solutions',
    title: 'Head of Growth',
    phone: '+63 2 5550 0142',
    website: 'northwind-bpo.example',
    industry: 'BPO / Contact centre',
    location: 'Cebu, Philippines',
    headcount: '201-500',
  },
  call: {
    outcome: 'Meeting Booked',
    meetingAt: 'Thursday, 10:00 AM (PHT)',
    notes:
      'Dana runs growth at a 180-seat BPO (customer support and back office for US and AU clients). Most new clients come from referrals and one outsourcing broker. She said the broker "takes a big slice of the margin" and sends the same leads to other BPOs, so every deal turns into a price fight. They tried two in-house SDRs last year; both left before they were ramped. 40 new seats open in Cebu in Q1 and need to be filled. Wants to see how we book meetings with decision makers and whether it could run alongside her one remaining BDR. CEO (Paolo) signs off on anything new. Booked 30 min with our AE.',
    transcript:
      'Rep: How are new clients finding Northwind today?\nProspect: Honestly, referrals and one broker. The broker takes a big slice of the margin, and we are never the only BPO they send.\nRep: What happened with outbound before?\nProspect: We hired two SDRs. Both were gone before they were any good.\nRep: What makes this a priority now?\nProspect: We have 40 seats opening in Q1 and I cannot fill them from referrals.\nProspect: If you can show me how the meetings are qualified, Paolo will take the call.',
  },
  research: {
    ...SAMPLE_RESEARCH,
    overview:
      'Northwind Contact Solutions is a Philippines-based BPO providing customer support and back-office services to US and Australian mid-market companies. It appears to be expanding its Cebu site.',
    whatTheyDo: 'Outsourced customer support (voice, chat, email) and back-office processing.',
    sizeAndSegment: 'Mid-size BPO, ~180 seats, serving US/AU mid-market clients',
    recentSignals: ['Job ads for team leaders at a new Cebu floor', 'Recently listed on an outsourcing marketplace'],
    likelyPriorities: ['Filling new seats quickly with the right clients', 'Reducing dependence on brokers'],
    painHypotheses: [
      'Broker-sourced deals may compress margins and invite price shopping',
      'Founder- or referral-led growth may not scale to the new site',
    ],
  },
  plan: {
    callSummary: {
      recap:
        'Dana leads growth at Northwind, a 180-seat BPO serving US and AU clients. New business comes from referrals and one broker, which takes margin and shares the same leads with competing BPOs. Two in-house SDR hires last year left before ramping. With 40 seats opening in Cebu in Q1, she wants to see how we book qualified meetings and whether it can run alongside her remaining BDR.',
      keyPoints: [
        '180 seats today; 40 new seats open in Cebu in Q1',
        'Pipeline relies on referrals and one outsourcing broker',
        'Broker takes margin and sends the same leads to other BPOs',
        'Two in-house SDRs left before they ramped',
        'One BDR remains; CEO Paolo approves new vendors',
      ],
      prospectQuotes: [
        'The broker takes a big slice of the margin, and we are never the only BPO they send.',
        'We have 40 seats opening in Q1 and I cannot fill them from referrals.',
        'If you can show me how the meetings are qualified, Paolo will take the call.',
      ],
      agreedNextStep: 'Thursday 10:00 AM (PHT), 30 minutes with our AE: show how meetings are qualified and whether it fits alongside her BDR.',
    },
    researchSummary:
      'Northwind is a mid-size Philippines BPO (customer support and back office) serving US and AU mid-market companies, and appears to be opening a new Cebu floor. Their growth likely depends on filling seats with the right client mix rather than more volume. A likely pain is margin lost to brokers and price competition on shared leads; test whether exclusive, decision-maker meetings would change win rates. Sample plan for demo.',
    meetingGoal: 'Agree on a scoped appointment-setting pilot for the Q1 Cebu seats and get Paolo (CEO) into the next call.',
    agenda: [
      {
        topic: 'Open: confirm goals for today',
        minutes: 3,
        whyItMatters: 'Dana booked this to see how meetings are qualified. Confirm that and what she needs to take to Paolo.',
        questions: ['What would make this 30 minutes worth it for you?', 'What will Paolo want to see before he takes a call?'],
        mapsTo: 'Discovery only',
      },
      {
        topic: 'Where new clients come from today',
        minutes: 8,
        whyItMatters: 'She said the broker "takes a big slice of the margin" and shares leads. Quantify what that costs per deal.',
        questions: [
          'Roughly what share of new clients came through the broker this year?',
          'When a broker lead turns into a price fight, how does that usually end?',
          'What does a great-fit client look like for the new Cebu floor?',
        ],
        mapsTo: 'Exclusive appointment setting with decision makers',
      },
      {
        topic: 'What happened with in-house SDRs',
        minutes: 6,
        whyItMatters: 'Two SDRs left before ramping. Understand why, so we do not repeat it with her remaining BDR.',
        questions: ['What did ramp look like for those two hires?', 'Where did they get stuck on calls?'],
        mapsTo: 'Sparring Arena practice calls and live ARM objection prompts in the Dialer',
      },
      {
        topic: 'How meetings are qualified',
        minutes: 8,
        whyItMatters: 'This is the condition she set for bringing Paolo in. Walk through the qualification criteria together.',
        questions: ['Which criteria would make a meeting worth Paolo\'s time?', 'Which industries or regions should we never book?'],
        mapsTo: 'ICP List Builder and qualified meeting handoff',
      },
      {
        topic: 'Agree next steps',
        minutes: 5,
        whyItMatters: 'The Q1 seats set the timeline. Leave with a dated next call that includes Paolo.',
        questions: ['What does Paolo need from us before that call?', 'When do the Q1 seats need to be live?'],
        mapsTo: 'Pilot scoping',
      },
    ],
    discoveryQuestions: [
      { question: 'Walk me through how a new client went from first contact to signed in the last quarter.', purpose: 'Situation: maps the current acquisition path.' },
      { question: 'You mentioned broker leads turn into price fights. How often does that happen?', purpose: 'Pain: confirms the shared-lead problem in her words.' },
      { question: 'What does a lost or discounted broker deal cost you over a typical contract?', purpose: 'Impact: quantifies the margin leak in her own numbers.' },
      { question: 'What happens if the 40 Cebu seats are still empty at the end of Q1?', purpose: 'Critical event: ties urgency to the new site.' },
      { question: 'Besides Paolo, who weighs in when you bring on a new growth partner?', purpose: 'Decision process: surfaces other stakeholders and steps.' },
      { question: 'What would you need to see in the first month to call a pilot a success?', purpose: 'Decision criteria: defines success before any proposal.' },
      { question: 'How does Paolo usually decide on spend for growth initiatives?', purpose: 'Economic buyer: confirms authority and budget path.' },
      { question: 'What would you want Paolo to hear from you after today?', purpose: 'Champion: tests whether Dana will sponsor this internally.' },
      { question: 'Besides the broker, what other options are you weighing, including hiring again?', purpose: 'Competition: surfaces alternatives and doing nothing.' },
      { question: 'How would booked meetings be handed to your BDR or sales lead today?', purpose: 'Situation: checks handoff and who runs the meetings.' },
    ],
    likelyObjections: [
      {
        objection: 'We tried outbound with our own SDRs and it did not work.',
        response:
          'That is a fair reason to be cautious, especially after losing two hires. The difference is you are not carrying the ramp: the meetings are booked and qualified before they reach you. What would you need to see in a pilot to trust it this time?',
      },
      {
        objection: 'The broker already sends us leads.',
        response:
          'Makes sense to keep what is working. The question is whether you want every deal shared with other BPOs. Exclusive meetings would sit alongside the broker, not replace it. How many broker deals would you want to replace with exclusive ones?',
      },
      {
        objection: 'I need to run this past Paolo first.',
        response:
          'Of course, he signs off on new partners. Let us make that easy: we can put the qualification criteria and a pilot outline on one page for him. Would he join a 20-minute call next week?',
      },
      {
        objection: 'What does this cost?',
        response:
          'Fair question. It depends on the number of meetings and markets, so I would rather price it on real scope than guess. Which markets matter most for the Cebu seats?',
      },
    ],
    risks: [
      'Paolo (economic buyer) has not been part of any conversation yet',
      'Budget for outsourced outbound is unknown',
      'Broker contract terms or exclusivity are unknown',
      'Unclear who runs booked meetings: Dana, the BDR or sales leadership',
    ],
    proposedNextSteps: [
      'Appointmentlyy: send a one-page pilot outline with the qualification criteria within 2 business days',
      'Northwind: share the ideal client profile and markets for the Cebu seats',
      'Both: 20-minute call with Paolo to agree pilot scope',
      'Appointmentlyy: start list building for the agreed markets once scope is signed off',
    ],
  },
  onePager: {
    headline: 'Filling the new Cebu seats with the right clients',
    subheadline: 'A short recap of our call, Dana, so we start Thursday on the right foot.',
    whatWeHeard: [
      'Most of your new clients come from referrals and one broker who shares leads with other BPOs.',
      'Broker deals often become price fights and cost you margin.',
      'Your two in-house SDR hires left before they were ramped.',
      'You have 40 seats opening in Cebu in Q1 to fill.',
    ],
    whyItMatters: [
      'New seats need clients who value service, not just the lowest price.',
      'Paolo needs to see how meetings are qualified before taking the next step.',
    ],
    nextSteps: [
      { step: 'Walk through how meetings are qualified', when: 'Thursday, 10:00 AM (PHT)' },
      { step: 'Share your ideal client profile and target markets' },
      { step: 'Short call with Paolo to agree a pilot scope' },
    ],
    howWeHelp: [
      { title: 'Exclusive meetings', detail: 'We book meetings with decision makers who are not hearing the same pitch from other BPOs.' },
      { title: 'Qualified before handoff', detail: 'Every meeting is checked against criteria you agree, so your team only takes good calls.' },
      { title: 'Support for your BDR', detail: 'Live objection prompts and practice calls help your own BDR ramp faster.' },
    ],
    cta: "If anything here is off, reply and we'll adjust before we meet.",
  },
};

// ---------------------------------------------------------------------------------------------
// (b) Commercial solar installer (warehouses and factories) needing qualified meetings
// ---------------------------------------------------------------------------------------------

const solar: MeetingPlanSeed = {
  seedKey: 'demo-brightfield-solar',
  status: 'ready',
  daysAgo: 3,
  lead: {
    name: 'Marcus Lindqvist',
    email: 'marcus.lindqvist@brightfield-solar.example',
    company: 'Brightfield Commercial Solar',
    title: 'Sales Director',
    phone: '+61 7 5550 0198',
    website: 'brightfield-solar.example',
    industry: 'Commercial solar',
    location: 'Brisbane, Australia',
    headcount: '51-200',
  },
  call: {
    outcome: 'Booked: Qualified Demo',
    meetingAt: 'Tuesday, 2:00 PM (AEST)',
    notes:
      'Marcus runs sales at a commercial solar installer: rooftop systems for warehouses, cold storage and factories in QLD and NSW. No residential. Their 3 BDRs work lead-aggregator lists and he said most of those are "homeowners or businesses that rent and can\'t sign". Average deal takes 4 to 6 months and needs the facility manager and the CFO. He wants 6 to 8 qualified meetings a month with owner-occupiers of large sites. Board planning for next financial year is in March and he wants a pipeline to show by then. Currently uses an aggregator plus trade shows. Open to a platform for his BDRs or done-for-you meetings, not sure which. Meeting Tuesday with our AE.',
  },
  research: {
    ...SAMPLE_RESEARCH,
    overview:
      'Brightfield Commercial Solar designs and installs rooftop solar for warehouses, cold storage and manufacturing sites in Queensland and New South Wales. It focuses only on commercial and industrial clients.',
    whatTheyDo: 'Commercial and industrial rooftop solar design, installation and maintenance.',
    sizeAndSegment: 'Mid-size installer, ~120 staff, commercial and industrial only, QLD/NSW',
    recentSignals: ['Hiring a Business Development Representative', 'Exhibited at a regional logistics trade show'],
    likelyPriorities: ['Reaching owner-occupiers of large sites', 'Shortening long, multi-stakeholder sales cycles'],
    painHypotheses: [
      'Aggregator leads may include tenants and residential enquiries that cannot buy',
      'BDRs may struggle to reach CFOs and facility managers directly',
    ],
  },
  plan: {
    callSummary: {
      recap:
        'Marcus leads sales at Brightfield, a commercial-only solar installer for warehouses, cold storage and factories in QLD and NSW. His 3 BDRs work aggregator lists that are mostly homeowners or tenants who cannot sign. Deals take 4 to 6 months and need both the facility manager and the CFO. He wants 6 to 8 qualified meetings a month with owner-occupiers before March board planning, and is unsure whether a platform for his BDRs or done-for-you meetings fits better.',
      keyPoints: [
        'Commercial only: warehouses, cold storage, factories in QLD and NSW',
        '3 BDRs working lead-aggregator lists',
        'Most aggregator leads are homeowners or tenants who cannot sign',
        'Deals take 4 to 6 months and involve facility manager and CFO',
        'Target: 6 to 8 qualified meetings a month before March board planning',
      ],
      prospectQuotes: ["Homeowners or businesses that rent and can't sign"],
      agreedNextStep: 'Tuesday 2:00 PM (AEST) with our AE: compare a BDR platform with done-for-you meetings for reaching owner-occupiers.',
    },
    researchSummary:
      'Brightfield is a mid-size commercial and industrial solar installer in QLD and NSW and appears to be hiring another BDR. Their buyers are owner-occupiers of large sites, so the likely bottleneck is reaching the right site owner and the CFO, not lead volume. Test whether aggregator leads are mostly non-buyers and how much BDR time that wastes. Sample plan for demo.',
    meetingGoal: 'Decide together between a BDR platform rollout and done-for-you meetings, and agree a pilot that shows pipeline before March.',
    agenda: [
      {
        topic: 'Open: confirm what Marcus needs by March',
        minutes: 3,
        whyItMatters: 'March board planning is his deadline. Anchor the meeting on what pipeline he needs to show.',
        questions: ['What does the board need to see in March?', 'What would make today worth your time?'],
        mapsTo: 'Discovery only',
      },
      {
        topic: 'Who a real buyer is',
        minutes: 7,
        whyItMatters: 'He said most aggregator leads "rent and can\'t sign". Define owner-occupier criteria precisely.',
        questions: ['What site size or energy spend makes a site worth a meeting?', 'How do you tell an owner from a tenant today?'],
        mapsTo: 'ICP List Builder',
      },
      {
        topic: 'How the BDR team works today',
        minutes: 7,
        whyItMatters: 'Three BDRs are working lists that rarely convert. Understand their day before choosing an approach.',
        questions: [
          'Walk me through a typical BDR day.',
          'Where do calls with facility managers usually stall?',
          'How do your BDRs get to the CFO?',
        ],
        mapsTo: 'AI Dialer with live ARM objection prompts',
      },
      {
        topic: 'Platform or done-for-you',
        minutes: 8,
        whyItMatters: 'He is unsure which fits. Lay out both against his team, timeline and 6 to 8 meetings a month.',
        questions: ['What would you want your BDRs doing if meetings were booked for them?', 'How much control do you want over messaging?'],
        mapsTo: 'Exclusive appointment setting or the SDR platform',
      },
      {
        topic: 'Agree next steps',
        minutes: 5,
        whyItMatters: 'A 4 to 6 month cycle means a pilot has to start soon to show pipeline by March.',
        questions: ['Who else should see a pilot proposal?', 'When would you want the first meetings booked?'],
        mapsTo: 'Pilot scoping',
      },
    ],
    discoveryQuestions: [
      { question: 'Walk me through where your last five signed projects came from.', purpose: 'Situation: shows which channels actually produce deals.' },
      { question: 'You said most aggregator leads cannot sign. How much BDR time goes into those each week?', purpose: 'Pain: confirms and sizes wasted effort.' },
      { question: 'What is one signed warehouse project worth to Brightfield over its life?', purpose: 'Impact: lets him value each qualified meeting himself.' },
      { question: 'What happens in March if the pipeline is not where you want it?', purpose: 'Critical event: ties urgency to board planning.' },
      { question: 'How do new sales tools or partners usually get approved at Brightfield?', purpose: 'Decision process: maps the steps and timing.' },
      { question: 'How will you judge whether a pilot worked: meetings held, site visits or proposals?', purpose: 'Decision criteria: agrees the success measure up front.' },
      { question: 'Who owns the budget for sales and marketing spend?', purpose: 'Economic buyer: identifies who signs.' },
      { question: 'Who on your team would own this day to day?', purpose: 'Champion: finds the internal owner.' },
      { question: 'Besides the aggregator and trade shows, what else have you tried or considered?', purpose: 'Competition: surfaces alternatives, including hiring.' },
      { question: 'When a facility manager is interested, how do you bring the CFO in?', purpose: 'Decision process: tests multi-stakeholder selling.' },
    ],
    likelyObjections: [
      {
        objection: 'Our sales cycle is too long for outbound to show results quickly.',
        response:
          'You are right, signed projects take months. What a pilot can show quickly is qualified first meetings with owner-occupiers, which is the start of that cycle. Would meetings held be a fair early measure for the board?',
      },
      {
        objection: 'We already pay for an aggregator.',
        response:
          'Makes sense to keep a channel that brings some deals. The issue you raised is fit, not volume. Would it help to compare a month of aggregator leads with a list built only from owner-occupied sites?',
      },
      {
        objection: 'My BDRs should be able to do this themselves.',
        response:
          'They may well be, with the right list and support on calls. That is the platform option: verified lists and live objection prompts in the Dialer. What do you think holds them back most today?',
      },
    ],
    risks: [
      'Budget owner and amount unknown',
      'Unclear whether the CFO or board must approve a pilot',
      'Owner-occupier criteria not yet defined',
      'Aggregator contract length unknown',
    ],
    proposedNextSteps: [
      'Brightfield: share target site criteria and regions',
      'Appointmentlyy: send a pilot outline comparing both options within 2 business days',
      'Both: agree pilot scope and success measure for the March board update',
      'Appointmentlyy: build a sample owner-occupier list for one region to review together',
    ],
  },
  onePager: {
    headline: 'Qualified meetings with owner-occupied sites',
    subheadline: 'A recap of our call, Marcus, ahead of Tuesday.',
    whatWeHeard: [
      'You work only with warehouses, cold storage and factories in QLD and NSW.',
      'Most of your aggregator leads are homeowners or tenants who cannot sign.',
      'Your deals take 4 to 6 months and need the facility manager and the CFO.',
      'You want 6 to 8 qualified meetings a month before March planning.',
    ],
    whyItMatters: [
      'Your BDRs spend time on leads that can never buy.',
      'The board will look at pipeline in March, so the timing is tight.',
    ],
    nextSteps: [
      { step: 'Compare the platform and done-for-you options', when: 'Tuesday, 2:00 PM (AEST)' },
      { step: 'Share your target site criteria and regions' },
      { step: 'Agree a pilot and how to measure it' },
    ],
    howWeHelp: [
      { title: 'Lists of real buyers', detail: 'We build lists of owner-occupied sites that match your criteria, not tenants or homeowners.' },
      { title: 'Meetings booked for you', detail: 'Our team books qualified meetings with facility managers and finance leads.' },
      { title: 'Or support your BDRs', detail: 'Your BDRs get verified lists and live objection prompts on every call.' },
    ],
    cta: 'If we missed anything, reply and we will fold it into Tuesday.',
  },
};

// ---------------------------------------------------------------------------------------------
// (c) B2B IT managed-services firm building a repeatable outbound motion
// ---------------------------------------------------------------------------------------------

const msp: MeetingPlanSeed = {
  seedKey: 'demo-ironbark-it',
  status: 'sent',
  daysAgo: 6,
  lead: {
    name: 'Priya Nair',
    email: 'priya.nair@ironbark-it.example',
    company: 'Ironbark IT Services',
    title: 'Commercial Director',
    phone: '+64 9 5550 0167',
    website: 'ironbark-it.example',
    industry: 'IT managed services',
    location: 'Auckland, New Zealand',
    headcount: '11-50',
  },
  call: {
    outcome: 'Meeting Booked',
    meetingAt: 'Wednesday, 9:30 AM (NZDT)',
    notes:
      'Priya is Commercial Director at a 45-person managed IT and cybersecurity provider. Clients are professional-services firms (law, accounting, engineering) with 50 to 250 staff. Growth has come from the founder\'s network and is flattening. Last year they paid a cold email agency for 3 months: "lots of opens, two meetings, both the wrong size." Two account managers have started making outbound calls but have no process or call scripts and "hate the phone". She wants a repeatable outbound motion owned in-house. Asked about cyber insurance renewals as a trigger. Founder (Tom) needs to be involved. Meeting Wednesday with our AE.',
  },
  research: {
    ...SAMPLE_RESEARCH,
    overview:
      'Ironbark IT Services is an Auckland managed service provider offering IT support, cloud and cybersecurity to professional-services firms. It is founder-led and around 45 staff.',
    whatTheyDo: 'Managed IT support, Microsoft 365 and cloud management, cybersecurity services.',
    sizeAndSegment: 'Small MSP, ~45 staff, NZ professional-services firms with 50-250 staff',
    recentSignals: ['Published a guide on cyber insurance requirements for small firms', 'Hiring a service desk engineer'],
    likelyPriorities: ['Moving beyond founder-led sales', 'Winning clients of the right size'],
    painHypotheses: [
      'Account managers may lack the confidence and structure for cold calls',
      'Past outbound may have targeted firms that were too small',
    ],
  },
  plan: {
    callSummary: {
      recap:
        'Priya is Commercial Director at Ironbark, a 45-person MSP serving NZ professional-services firms with 50 to 250 staff. Growth from the founder\'s network is flattening. A 3-month cold email agency produced two meetings, both the wrong size. Two account managers now make calls without a process and dislike the phone. She wants an in-house outbound motion and raised cyber insurance renewals as a possible trigger.',
      keyPoints: [
        'Target clients: law, accounting and engineering firms with 50 to 250 staff',
        'Founder-network growth is flattening',
        'Cold email agency: many opens, two meetings, both the wrong size',
        'Two account managers call without process or scripts',
        'Founder Tom needs to be involved in the decision',
      ],
      prospectQuotes: ['Lots of opens, two meetings, both the wrong size.', 'Hate the phone'],
      agreedNextStep: 'Wednesday 9:30 AM (NZDT) with our AE: how an in-house outbound motion could work for her two account managers.',
    },
    researchSummary:
      'Ironbark is a founder-led Auckland MSP (IT support, cloud, cybersecurity) for professional-services firms. Recent content on cyber insurance requirements suggests a timely conversation starter. The likely gap is structure and confidence for the account managers, and targeting firms of the right size. Test both. Sample plan for demo.',
    meetingGoal: 'Agree a short pilot of the Dialer and Sparring Arena for both account managers, with Tom joining the review.',
    agenda: [
      {
        topic: 'Open: confirm goals and Tom\'s role',
        minutes: 3,
        whyItMatters: 'Tom must be involved. Confirm what Priya needs to bring him.',
        questions: ['What does a good outcome from today look like?', 'How involved does Tom want to be?'],
        mapsTo: 'Discovery only',
      },
      {
        topic: 'Lessons from the email agency',
        minutes: 6,
        whyItMatters: 'Two meetings, both the wrong size. Learn what targeting went wrong so it is not repeated.',
        questions: ['How was the target list built?', 'What size and type of firm would have been a win?'],
        mapsTo: 'ICP List Builder',
      },
      {
        topic: 'Getting the account managers comfortable on the phone',
        minutes: 9,
        whyItMatters: 'She said they "hate the phone" and have no scripts. Confidence is the first thing to fix.',
        questions: [
          'What happens on a typical call that goes badly?',
          'Which objections do they hear most?',
          'How much time each week can they give to outbound?',
        ],
        mapsTo: 'Sparring Arena practice calls and live ARM objection prompts in the Dialer',
      },
      {
        topic: 'Cyber insurance renewals as a trigger',
        minutes: 7,
        whyItMatters: 'Priya raised renewals herself. Explore whether it can anchor a campaign across email, LinkedIn and calls.',
        questions: ['When do most of your clients renew?', 'What do insurers ask firms to prove?'],
        mapsTo: 'Cold Email Studio, LinkedIn Studio and Workflows',
      },
      {
        topic: 'Agree next steps',
        minutes: 5,
        whyItMatters: 'Leave with a pilot scope and a time for Tom to review it.',
        questions: ['What would Tom need to see to agree?', 'When could the account managers start?'],
        mapsTo: 'Pilot scoping',
      },
    ],
    discoveryQuestions: [
      { question: 'Walk me through how your last three clients found Ironbark.', purpose: 'Situation: confirms reliance on the founder\'s network.' },
      { question: 'What happens when the account managers pick up the phone today?', purpose: 'Pain: hears the problem in her words.' },
      { question: 'What is a new 100-person client worth to Ironbark per year?', purpose: 'Impact: lets her value each right-sized meeting.' },
      { question: 'What happens if growth stays flat for another two quarters?', purpose: 'Critical event: tests urgency.' },
      { question: 'How do you and Tom usually decide on new tools?', purpose: 'Decision process: maps steps and timing.' },
      { question: 'What would a pilot need to show for you to call it a success?', purpose: 'Decision criteria: agrees success measures up front.' },
      { question: 'Who holds the budget for sales tools?', purpose: 'Economic buyer: confirms whether it is Tom.' },
      { question: 'Who would make sure the account managers keep calling after week one?', purpose: 'Champion: finds the day-to-day owner.' },
      { question: 'Are you considering another agency or a dedicated sales hire?', purpose: 'Competition: surfaces alternatives.' },
    ],
    likelyObjections: [
      {
        objection: 'We tried outbound with an agency and it did not work.',
        response:
          'That is a fair worry after paying for two wrong-size meetings. This keeps outbound in-house, with your own list criteria and your own people. What would have to be different this time?',
      },
      {
        objection: 'My account managers do not have time for calling.',
        response:
          'Understood, they have clients to look after. The point is to make the time they do have count, with practice and prompts on calls. How many hours a week could they realistically give?',
      },
      {
        objection: 'Tom will want to think about it.',
        response:
          'Makes sense, it is his business. Let us give him something concrete to react to: a short pilot outline and a 15-minute review. Would that work for him this week?',
      },
    ],
    risks: [
      'Tom\'s view and budget are unknown',
      'Account managers may not commit time to outbound',
      'Right-size target criteria not yet agreed',
      'Unclear whether they are also talking to agencies',
    ],
    proposedNextSteps: [
      'Ironbark: confirm target firm size, sectors and regions',
      'Appointmentlyy: send a pilot outline within 2 business days',
      'Both: 15-minute review with Tom',
      'Appointmentlyy: set up practice scenarios on the objections the account managers hear most',
    ],
  },
  onePager: {
    headline: 'A repeatable way to win right-sized clients',
    subheadline: 'A short recap of our call, Priya, before we meet Wednesday.',
    whatWeHeard: [
      'Growth from your founder\'s network is flattening.',
      'Your email agency brought two meetings, both the wrong size.',
      'Your account managers are calling without a process and dislike the phone.',
      'Cyber insurance renewals could be a timely reason to reach out.',
    ],
    whyItMatters: [
      'You want an outbound motion your own team owns, not another agency.',
      'Firms with 50 to 250 staff are where Ironbark fits best.',
    ],
    nextSteps: [
      { step: 'Walk through a pilot for your account managers', when: 'Wednesday, 9:30 AM (NZDT)' },
      { step: 'Confirm target firm size, sectors and regions' },
      { step: 'Short review with Tom' },
    ],
    howWeHelp: [
      { title: 'Confidence on the phone', detail: 'Practice calls with an AI buyer, so your team rehearses objections before live calls.' },
      { title: 'Help during live calls', detail: 'The Dialer shows simple prompts when a prospect pushes back.' },
      { title: 'Right-sized lists', detail: 'Build lists of firms that match the size and sectors you choose.' },
    ],
    cta: "If anything here is off, reply and we'll adjust before we meet.",
  },
};

export const DEMO_MEETING_PLAN_SEEDS: MeetingPlanSeed[] = [bpo, solar, msp];
