import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/apiSession';
import { SPARRING_PERSONAS, SparringPersona, getPersonaVoiceByCountry, SparringCountry } from '@/lib/personas';
import { applyRateLimit, validateTextPayload } from '@/lib/security';
import { ELEVENLABS_MODELS } from '@/lib/elevenlabs/voiceEngine';
import { synthesizeWithElevenLabs } from '@/lib/server/elevenlabsTts';

function extractJson(text: string) {
  try {
    const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

// Persona-specific contextual fallback logic that acts as an authentic adversarial sparring partner
function generateContextualFallback(
  persona: SparringPersona,
  repMessage: string,
  history: Array<{ role: string; content: string }>
): { reply: string; completedIds: string[]; sentiment: string; armObservation: string } {
  const lower = repMessage.toLowerCase();
  const pastReplies = history
    .filter(t => t.role === 'prospect')
    .map(t => t.content.toLowerCase());
  const turnCount = history.filter(t => t.role === 'rep').length;

  const hasEmpathy = lower.includes('understand') || lower.includes('hear you') || lower.includes('fair') || lower.includes('appreciate') || lower.includes('makes sense');
  const hasValue = lower.includes('benchmark') || lower.includes('diagnostic') || lower.includes('sla') || lower.includes('rate') || lower.includes('conversion') || lower.includes('drop-off') || lower.includes('percent') || lower.includes('%') || lower.includes('save') || lower.includes('pipeline');
  const hasClose = (lower.includes('?') || lower.includes('open to') || lower.includes('calendar')) && (lower.includes('tuesday') || lower.includes('thursday') || lower.includes('minute') || lower.includes('review') || lower.includes('compare') || lower.includes('diagnostic'));
  const isAskingQuestion = lower.includes('?') && (lower.includes('how do you') || lower.includes('what is') || lower.includes('who') || lower.includes('tell me') || lower.includes('why'));

  let candidateReplies: string[] = [];
  let completedIds: string[] = [];
  let sentiment = 'skeptical';
  let armObservation = 'Prospect raised cold-call friction.';

  if (persona.id === 'bpo-directory-buyer') {
    // Julian Vance (BPO buyer whose pains are lead quality and pipeline health).
    // The matchers below also catch legacy wording reps may still use (internal matching only).
    const mentionsOA = lower.includes('outsource accelerator') || lower.includes('directory') || lower.includes('broker') || lower.includes('lead vendor') || lower.includes('oa');
    const mentionsSharedTrap = lower.includes('shared') || lower.includes('price war') || lower.includes('3 to 5') || lower.includes('margin') || lower.includes('cheaper') || lower.includes('8');
    const mentionsEmil = lower.includes('emil') || lower.includes('17 years') || lower.includes('claude') || lower.includes('sparring');

    if (turnCount >= 2 && (mentionsEmil || (hasEmpathy && hasValue)) && hasClose) {
      candidateReplies = [
        "If Emil has 17 years in the BPO space and can show us verified contacts and a pipeline we can actually forecast, I'll take a look Thursday at 2:00 PM.",
        "Alright, if it's strictly a 20-minute screen share with Emil to see how the sparring simulator works on our floor, put Friday morning on my calendar."
      ];
      completedIds = persona.objectives.map(o => o.id);
      sentiment = 'agreed';
      armObservation = 'Rep executed BPO playbook and locked 20-min demo with Founder Emil.';
    } else if (isAskingQuestion) {
      candidateReplies = [
        "Why are you asking about our internal SDR floor? We've got our lists and we hit quota. What are you actually selling?",
        "I don't share internal operational headcounts with cold callers. What makes your data any different from the lists we already have?"
      ];
      completedIds = [];
      sentiment = 'hostile';
      armObservation = 'Prospect challenged unsolicited qualification.';
    } else if (mentionsSharedTrap || lower.includes('price') || lower.includes('competing')) {
      candidateReplies = [
        "Yeah, that is a headache. We pay good money for lists and half the numbers are wrong or the person left months ago. How do you stop that?",
        "It's true—our pipeline swings all over the place month to month and deals stall after the first meeting. But our senior reps know how to close. What's your alternative?"
      ];
      completedIds = [persona.objectives[0].id, persona.objectives[1].id];
      sentiment = 'softened';
      armObservation = 'Prospect confirmed lead-quality and pipeline-health pain.';
    } else if (mentionsOA || hasEmpathy) {
      candidateReplies = [
        "Yeah, we buy lead lists every month. The data's hit and miss, but our senior reps don't need roleplay practice. Why are you calling me?",
        "Yes, we buy our data. But my team has years of experience in the BPO space. Why would we need an AI simulator?"
      ];
      completedIds = [persona.objectives[0].id];
      sentiment = 'neutral';
      armObservation = 'Prospect acknowledged patchy lead data but defended veteran reps.';
    } else {
      candidateReplies = [
        "Look, we already buy all our leads and our senior reps don't need roleplay. What is this regarding?",
        "I'm heading into an operational review with our Manila floor. Give me the headline—what does this actually solve?"
      ];
      completedIds = [];
      sentiment = 'skeptical';
      armObservation = 'Prospect raised initial "we already have leads" defense.';
    }
  } else if (persona.id === 'incumbent-loyalist') {
    // David Reynolds (Incumbent Loyalist)
    if (turnCount >= 2 && hasEmpathy && hasValue && hasClose) {
      candidateReplies = [
        "Look, if it's strictly a 10-minute SLA benchmark comparison and not a pitch to fire my agency, send an invite for Thursday at 10:30 AM.",
        "Fair enough. If you can actually show where our incumbent has conversion blindspots in 10 minutes without disrupting our team, put Thursday on my calendar."
      ];
      completedIds = persona.objectives.map((o: any) => o.id);
      sentiment = 'agreed';
      armObservation = 'Rep executed full ARM framework and earned 10-minute benchmark.';
    } else if (isAskingQuestion) {
      candidateReplies = [
        "Why are you asking about our internal SDR workflow? We have an established partner who manages that. What are you actually offering?",
        "I don't share our internal metrics with cold callers. If you know our space, tell me what specific bottleneck you think we have."
      ];
      completedIds = [];
      sentiment = 'hostile';
      armObservation = 'Prospect resisted qualification questioning.';
    } else if (hasClose && turnCount < 2) {
      candidateReplies = [
        "I'm not putting anything on my calendar. We've worked with our current agency for 3 years and we are completely satisfied. Why would we switch?",
        "Hold on, you haven't even told me why I'd spend 10 minutes with you. What makes your team any different from everyone else?"
      ];
      completedIds = [];
      sentiment = 'skeptical';
      armObservation = 'Prospect pushed back against premature close.';
    } else if (hasValue) {
      candidateReplies = [
        "Those metrics sound great on a slide, but our agency is deeply embedded in our CRM. Why would I risk disrupting an established partner that hits quota?",
        "We're completely satisfied with our current vendors. Unless you can pinpoint a specific leak in our SDR hold rate, why would we switch?"
      ];
      completedIds = [persona.objectives[0].id, persona.objectives[1].id];
      sentiment = 'softened';
      armObservation = 'Rep probed vendor relationship with value focus; prospect demanded proof.';
    } else if (hasEmpathy) {
      candidateReplies = [
        "I appreciate you acknowledging that. We value our partners. What makes you think our current team has any performance gaps?",
        "Glad you understand. Most reps just bash our existing agency. But why should we spend any time evaluating another tool?"
      ];
      completedIds = [persona.objectives[0].id];
      sentiment = 'neutral';
      armObservation = 'Rep demonstrated tactical empathy; prospect maintained defensive posture.';
    } else {
      candidateReplies = [
        "Like I said, we have an established vendor handling this. Why are you reaching out to us right now?",
        "What specifically is your team offering that would ever justify disrupting our current workflow?",
        "I don't have time for a generic pitch. If you know our space, what exact problem are you solving?"
      ];
      completedIds = [];
      sentiment = 'skeptical';
      armObservation = 'Prospect defended incumbent vendor.';
    }
  } else if (persona.id === 'rushed-vp') {
    // Marcus Vance (Rushed VP)
    if (turnCount >= 2 && hasEmpathy && hasValue && hasClose) {
      candidateReplies = [
        "Alright, fair enough on the 10-minute diagnostic. Send an invite for Thursday at 8:00 AM sharp before my standup. I'm stepping into the boardroom right now.",
        "Fine, if it's strictly 10 minutes to review that hold rate diagnostic, put Thursday morning on my calendar. Now let me go."
      ];
      completedIds = persona.objectives.map((o: any) => o.id);
      sentiment = 'agreed';
      armObservation = 'Rep executed ARM under pressure and secured diagnostic commitment.';
    } else if (isAskingQuestion) {
      candidateReplies = [
        "I don't have time to answer survey questions. If you have a specific value proposition, give me the headline in 10 seconds or I'm hanging up.",
        "Look, I'm walking into an executive meeting. Don't grill me on our pipeline—tell me why you called."
      ];
      completedIds = [];
      sentiment = 'hostile';
      armObservation = 'Prospect rejected survey questions under time crunch.';
    } else if (hasClose && turnCount < 2) {
      candidateReplies = [
        "I'm not putting anything on my calendar. I have literally 20 seconds before my board meeting—what is the bottom line?",
        "Thursday for what? You haven't even told me what you do. Give me the headline."
      ];
      completedIds = [];
      sentiment = 'hostile';
      armObservation = 'Prospect pushed back against premature close.';
    } else if (hasValue) {
      candidateReplies = [
        "Every vendor claims double-digit hold rates. How does your model actually integrate without burning my team's bandwidth?",
        "What kind of SDR hold rate can you realistically commit to for high-growth fintech?"
      ];
      completedIds = [persona.objectives[0].id, persona.objectives[1].id];
      sentiment = 'softened';
      armObservation = 'Rep cited ROI metric; prospect challenged feasibility.';
    } else if (hasEmpathy) {
      candidateReplies = [
        "I appreciate you being brief. You've got 15 seconds—what is the metric?",
        "Fair enough on the time crunch. What exactly is the headline?"
      ];
      completedIds = [persona.objectives[0].id];
      sentiment = 'neutral';
      armObservation = 'Rep acknowledged time constraint under 5 seconds.';
    } else {
      candidateReplies = [
        "Look, I have 15 seconds before my meeting starts. Give me the bottom line or let me go.",
        "I don't have time for fluff right now. What is this regarding?"
      ];
      completedIds = [];
      sentiment = 'hostile';
      armObservation = 'Prospect pressed for brevity.';
    }
  } else {
    // General adversarial persona dynamic replies
    if (turnCount >= 2 && hasEmpathy && hasValue && hasClose) {
      candidateReplies = [
        `Look, I'm still skeptical, but if it's literally just a 10-minute diagnostic without high pressure, send an invite for Thursday morning.`,
        `Fair enough. Send through a tentative 10-minute hold for Thursday and I'll review the diagnostic data.`
      ];
      completedIds = persona.objectives.map((o: any) => o.id);
      sentiment = 'agreed';
      armObservation = 'Rep executed ARM and earned diagnostic meeting.';
    } else if (isAskingQuestion) {
      candidateReplies = [
        `Why are you asking about our internal process? I don't share internal operational details with cold callers.`,
        `I didn't ask for a consultation. What is the reason you called my direct line today?`
      ];
      completedIds = [];
      sentiment = 'skeptical';
      armObservation = 'Prospect pushed back on unsolicited qualification.';
    } else if (hasValue) {
      candidateReplies = [
        `Those numbers sound fine on paper, but every vendor makes big promises. How do you actually prove that?`,
        `That sounds good in theory, but what kind of turnaround time and hold rate do you guarantee in writing?`
      ];
      completedIds = [persona.objectives[0]?.id, persona.objectives[1]?.id].filter(Boolean);
      sentiment = 'softened';
      armObservation = 'Rep cited value metrics; prospect demanded proof.';
    } else if (hasEmpathy) {
      candidateReplies = [
        `I appreciate you hearing me out, but that doesn't change our situation. Why should we prioritize this over our current initiatives?`,
        `Fair point. But what makes you think we have any problems we can't solve ourselves?`
      ];
      completedIds = [persona.objectives[0]?.id].filter(Boolean);
      sentiment = 'neutral';
      armObservation = 'Rep used tactical empathy; prospect maintained skepticism.';
    } else {
      candidateReplies = [
        `Look, what specifically does this solve for my team right now?`,
        `I need concrete specifics, not a generic pitch. What are you actually offering?`,
        `Why should I spend my time discussing this today?`
      ];
      completedIds = [];
      sentiment = 'skeptical';
      armObservation = 'Prospect pushed back on value clarity.';
    }
  }

  // Find the first candidate reply that hasn't been said yet
  const chosenReply = candidateReplies.find(r => !pastReplies.includes(r.toLowerCase())) || candidateReplies[0];

  return {
    reply: chosenReply,
    completedIds,
    sentiment,
    armObservation
  };
}

// Derive instant tactical ScriptAssist teleprompter content based on buyer reply & persona
function deriveDynamicScriptAssist(
  persona: SparringPersona,
  buyerReply: string,
  sentiment: string
): any {
  const lower = buyerReply.toLowerCase();
  const firstName = persona.name.split(' ')[0];

  if (sentiment === 'agreed' || lower.includes('invite') || lower.includes('calendar') || lower.includes('put') || lower.includes('thursday') || lower.includes('tuesday') || lower.includes('friday')) {
    return {
      objectionType: 'Agreement Reached (Lock down 20-min demo with Founder Emil)',
      recommendedScript: `Fantastic, ${firstName}. I'll lock in Thursday at 2:00 PM for the screen share with our founder, Emil. What is the best direct email address to send the calendar invite and the 1-page sample list preview?`,
      tacticalRationale: 'Confirm demo timeslot cleanly, mention Founder Emil, and secure direct email for calendar invite and private sample list.',
      arm: {
        acknowledge: 'Acknowledge agreed timeslot cleanly',
        respond: 'Promise calendar invite and 1-page sample list preview with Emil',
        move: 'Ask for direct email address to lock in the calendar invite'
      }
    };
  }

  // 1. SCENARIO 1: OBJ_NEED_CLIENTS_NOT_TOOLS
  if (lower.includes('need clients') || lower.includes('need customers') || lower.includes('another tool') || lower.includes('revenue not software') || lower.includes('more tools') || lower.includes('software to manage') || lower.includes('payroll') || lower.includes('only looking for clients') || lower.includes('only want customers')) {
    return {
      objectionType: 'Need Clients, Not Tools ("We just need clients, not another tool")',
      recommendedScript: `100% fair, ${firstName}. At the end of the day, you can't pay payroll with software—you need paying clients. That's exactly why we don't sell 'just software.' The problem is, buying more leads doesn't fix anything if half the numbers are wrong and the rest were never a fit. We give you the targeted client pipeline—built and fully enriched by Claude—and give your reps the sparring tool so they actually win and close those clients instead of letting them stall. Emil built this specifically to put signed client contracts in your pipeline. Give him 20 minutes to show you how the client acquisition engine works. How does Thursday at 2:00 PM look?`,
      tacticalRationale: 'Validate payroll reality (Acknowledge). Contrast lead purchase vs. pitch execution (Redirect). Propose 20-min demo with Emil (Move).',
      arm: {
        acknowledge: "100% fair—you can't pay payroll with software, you need paying clients.",
        respond: "Buying more leads doesn't fix bad data or a stalled pipeline. We give Claude-enriched lists AND sparring so reps win deals.",
        move: "Give Emil 20 minutes to show how the acquisition engine works. How does Thursday at 2:00 PM look?"
      }
    };
  }

  // 2. SCENARIO 2A: OBJ_PRICE_TELL_ME_NOW
  if (lower.includes('just tell me the price') || lower.includes('give me the price') || lower.includes('how much is it') || lower.includes('how much do you charge') || lower.includes('what does it cost') || lower.includes("what's the cost") || lower.includes('what are you charging')) {
    return {
      objectionType: 'Price Demand ("How much does this cost? Just tell me the price")',
      recommendedScript: `I completely get it, ${firstName}—you need to know if the numbers make sense before spending any time on this. Because everything we do is custom built, there’s no flat price tag. Our pricing depends strictly on your scope: how many enriched prospect records you need pulled each month, and how we customize the AI Sparring Agent to match your exact sales scripts. We need to be 100% clear on your outbound roadmap before we quote a dime so you never pay for things you don't need. Emil can map out that roadmap with you in 10 minutes on a screen share and give you an exact price based on your volume. How does Thursday at 2:00 PM look?`,
      tacticalRationale: 'Validate cost sensitivity (Acknowledge). Explain pricing is scope and roadmap based (Redirect). Propose Emil 10-min pricing roadmap (Move).',
      arm: {
        acknowledge: "Completely get it—you need to know if numbers make sense before spending time.",
        respond: "Pricing depends strictly on scope: number of enriched records and custom script tuning. We need a clear roadmap before quoting.",
        move: "Emil can map that out with you in 10 minutes and give exact numbers. How does Thursday at 2:00 PM look?"
      }
    };
  }

  // 3. SCENARIO 2B: OBJ_PRICE_RATE_CARD
  if (lower.includes('rate card') || lower.includes('price sheet') || lower.includes('rate sheet') || lower.includes('pricing sheet') || lower.includes('pdf of prices') || lower.includes('send pricing')) {
    return {
      objectionType: 'Rate Card Request ("Just email me a rate card or price sheet")',
      recommendedScript: `I can definitely send information over, ${firstName}—I know you want to protect your calendar. The reason we don't have a static one-page rate card is because we aren't selling generic list packages. We build custom data pipelines for your specific service lines and train custom AI sparring bots on your internal scripts. Giving you a generic sheet would just be guessing at your needs. Hop on with Emil for 20 minutes. He’ll look at how many seats and leads you run, show you the custom sparring tool live, and walk you through an exact price breakdown. Would Thursday afternoon or Friday morning work better?`,
      tacticalRationale: 'Agree to send info (Acknowledge). Explain generic rate cards do not fit custom data pipelines (Redirect). Propose Emil 20-min demo (Move).',
      arm: {
        acknowledge: "Definitely can send info over—protecting your calendar is important.",
        respond: "No static rate card because we build custom data pipelines and train custom sparring bots on your scripts.",
        move: "Hop on with Emil for 20 minutes to see the tool live and get an exact breakdown. Thursday afternoon or Friday morning?"
      }
    };
  }

  // 4. SCENARIO 2C: OBJ_PRICE_NO_BUDGET
  if (lower.includes('no budget') || lower.includes('tight on money') || lower.includes('cannot afford') || lower.includes("can't afford") || lower.includes('not spending on software') || lower.includes('cost-cutting') || lower.includes('budget freeze')) {
    return {
      objectionType: 'Budget Constraint ("We don\'t have budget for new software right now")',
      recommendedScript: `I completely respect that, ${firstName}. Running a BPO means keeping a tight lid on expenses. This isn't an extra software expense; it replaces the money you're already burning when reps dial wrong numbers, chase bad-fit leads or let deals stall. We customize the whole scope to fit right inside what you already spend on lead data. Let’s take money off the table completely: take 20 minutes with Emil to see how the system stops lead burn. If the math doesn't show an immediate return, we shake hands and walk away. Does next Tuesday at 10:00 AM work?`,
      tacticalRationale: 'Respect tight budget (Acknowledge). Frame as lead-burn replacement, not added cost (Redirect). Zero-risk demo ask (Move).',
      arm: {
        acknowledge: "Completely respect that—running a BPO requires tight expense control.",
        respond: "Not an extra cost; it replaces the money burned on bad data, bad-fit leads and stalled deals.",
        move: "Take money off the table: 20 minutes with Emil to see the math. If no immediate return, we walk away. Next Tuesday at 10 AM?"
      }
    };
  }

  // 5. SCENARIO 3A: OBJ_VENDOR_ALREADY_BUY_LEADS ("we already buy leads"; also matches legacy wording)
  if (lower.includes('outsource accelerator') || lower.includes('oa') || lower.includes('buy our leads') || lower.includes('directory') || lower.includes('lead vendor') || lower.includes('broker')) {
    return {
      objectionType: 'Lead Source Status Quo ("We already buy our leads")',
      recommendedScript: `That makes total sense, ${firstName}—volume matters on a floor your size. The catch is quality: when a chunk of those contacts bounce, ring wrong numbers or were never a fit, your reps burn the day and the pipeline stays thin. Let’s grab 20 minutes with Emil so he can show you how verified contacts and our AI sparring tool turn more of those dials into held meetings. How does Thursday look?`,
      tacticalRationale: 'Validate lead volume (Acknowledge). Expose the cost of bad data and a thin pipeline (Redirect). Propose Emil 20-min pipeline health demo (Move).',
      arm: {
        acknowledge: "Totally makes sense—volume matters on a floor your size.",
        respond: "Bounced emails, wrong numbers and bad-fit leads burn rep time and keep the pipeline thin.",
        move: "Grab 20 minutes with Emil to see how verified contacts and AI sparring lift held meetings. How does Thursday look?"
      }
    };
  }

  // 6. SCENARIO 3B: OBJ_VENDOR_EXCLUSIVE_LEADS
  if (lower.includes('exclusive leads') || lower.includes('leads are exclusive') || lower.includes('exclusive to us') || lower.includes('we get exclusive')) {
    return {
      objectionType: 'Exclusive Lead Claim ("Our lead vendor gives us exclusive leads")',
      recommendedScript: `I hear that a lot, ${firstName}, and on paper, that's what they bill you for. Exclusive doesn't mean accurate, though: if the contact changed roles or the number is dead, it's still a wasted dial, and if reps sound like every other vendor, the meeting still stalls. Emil can show you in 20 minutes how verified contacts and AI sparring keep those leads moving through your pipeline. Would Friday morning work?`,
      tacticalRationale: 'Validate what vendor bills (Acknowledge). Separate exclusive from accurate and on-fit (Redirect). Emil 20-min pipeline demo (Move).',
      arm: {
        acknowledge: "Hear that a lot, and on paper, that's what they bill you for.",
        respond: "Exclusive isn't the same as accurate. Dead numbers and role changes still waste dials, and weak calls still stall.",
        move: "Emil can show in 20 minutes how verified data and sparring keep leads moving. Would Friday morning work?"
      }
    };
  }

  // 7. SCENARIO 4A: OBJ_REPS_EXPERIENCED
  if (lower.includes('experience') || lower.includes('senior') || lower.includes('veteran') || lower.includes('practice') || lower.includes('roleplay') || lower.includes('years') || lower.includes("don't need training")) {
    return {
      objectionType: 'Veteran Rep Defense ("Our reps have years of experience, they don\'t need practice")',
      recommendedScript: `That’s awesome, ${firstName}—having experienced callers is a huge advantage. The trouble is, leads cost too much money to use as warm-up swings. Even your best reps can get caught off guard when a buyer throws an objection they haven't heard in a while. Emil built this so reps can sharpen their edge in 2 minutes before dialing. Would 20 minutes with him next Tuesday be worth a look?`,
      tacticalRationale: 'Praise experienced team (Acknowledge). Contrast burning expensive leads as warm-up swings (Redirect). 20-min look with Emil (Move).',
      arm: {
        acknowledge: "That's awesome—having experienced callers is a huge advantage.",
        respond: "Leads cost too much money to use as warm-up swings. Even best reps get caught off guard by a new objection.",
        move: "Emil built this so reps sharpen edge in 2 minutes before dialing. 20 minutes with him next Tuesday worth a look?"
      }
    };
  }

  // 8. SCENARIO 4B: OBJ_INTERNAL_LMS_EXISTS
  if (lower.includes('internally') || lower.includes('internal') || lower.includes('team lead') || lower.includes('train our') || lower.includes('coaching') || lower.includes('have our own lms') || lower.includes('internal coaches')) {
    return {
      objectionType: 'Internal Training Defense ("We already have internal trainers and an LMS")',
      recommendedScript: `That's great, ${firstName}! Internal coaches are super important for company culture and compliance. The hard part is team leaders can't roleplay with every single rep for an hour every morning before they dial. The AI Sparring Agent lets every rep do 5 practice calls before breakfast without taking up your manager's time. Let’s grab 20 quick minutes with Emil so you can see how much time this saves your trainers. How does Wednesday morning look?`,
      tacticalRationale: 'Compliment internal training (Acknowledge). Highlight manager bandwidth bottleneck vs. 5 automated AI practice calls (Redirect). Propose 20-min demo with Emil (Move).',
      arm: {
        acknowledge: "That's great! Internal coaches are super important for culture and compliance.",
        respond: "Team leaders can't roleplay with every rep every morning. AI Sparring lets every rep do 5 practice calls without manager time.",
        move: "Grab 20 quick minutes with Emil to see how much time this saves trainers. How does Wednesday morning look?"
      }
    };
  }

  // 9. SCENARIO 5A: OBJ_BRUSH_OFF_EMAIL
  if (lower.includes('send an email') || lower.includes('shoot me an email') || lower.includes('email me details') || lower.includes('send me some info') || lower.includes('send me info') || lower.includes('email me some info') || lower.includes('just email me')) {
    return {
      objectionType: 'Email Brush-Off ("Just send me an email")',
      recommendedScript: `Happy to do that, ${firstName}! I know your inbox is swamped. Because Emil trains these AI agents on your specific work, a plain paper won't show you how the AI voice coaching actually works. Give Emil just 20 minutes. You can test out an AI sparring call yourself on screen. If you don't like it in 5 minutes, you can hang up. Would Thursday afternoon work?`,
      tacticalRationale: 'Acknowledge swamped inbox (Acknowledge). Contrast static paper vs. live voice simulation (Redirect). Low-risk 20-min Emil test call ask (Move).',
      arm: {
        acknowledge: "Happy to do that! I know your inbox is swamped.",
        respond: "Because AI agents are trained on your specific services, a plain PDF won't show how voice coaching works.",
        move: "Give Emil 20 minutes to test an AI call on screen. If you don't like it in 5 mins, hang up. Thursday afternoon?"
      }
    };
  }

  // 10. SCENARIO 5B: OBJ_TIMING_BUSY
  if (lower.includes('too busy') || lower.includes('call back in 6 months') || lower.includes('swamped right now') || lower.includes('running a floor') || lower.includes('busy shop') || lower.includes('bad time') || lower.includes('busy right now')) {
    return {
      objectionType: 'Time Constraint ("We are too busy right now / Call back in 6 months")',
      recommendedScript: `I get it, ${firstName}! You have a busy shop to run and deals to close. The only reason other BPO bosses jump on with Emil is because every month they wait, they are burning thousands of dollars on bad data and deals that stall in the pipeline. Let’s grab 20 quick minutes with Emil early next week before your day gets crazy. How does Wednesday morning look?`,
      tacticalRationale: 'Validate busy shop (Acknowledge). Expose ongoing lead-burn bleed while waiting (Redirect). Propose 20-min early next week (Move).',
      arm: {
        acknowledge: "I get it! You have a busy shop to run and deals to close.",
        respond: "Other BPO bosses jump on with Emil because every month they wait, they burn thousands on bad data and stalled deals.",
        move: "Let's grab 20 quick minutes with Emil early next week before your day gets crazy. How does Wednesday morning look?"
      }
    };
  }

  // Past Agency Burn (Samantha Cross specialized objection)
  if (lower.includes('burned') || lower.includes('disaster') || lower.includes('spam') || lower.includes('domain') || lower.includes('reputation')) {
    return {
      objectionType: 'Burned by Past Agency (Spam Leads & Domain Blacklist)',
      recommendedScript: `I don't blame you at all, ${firstName}—most offshore teams spam generic lists and ruin deliverability. We enforce live audio QA and Boris acoustic monitoring to guarantee zero domain risk. Can I share a 2-minute sample call audit on Thursday?`,
      tacticalRationale: 'Validate her past agency trauma. Detail acoustic QA safety guards and offer a concrete call audit preview rather than a pitch.',
      arm: {
        acknowledge: 'Validate previous bad agency disaster with tactical empathy',
        respond: 'Detail live audio interception and domain safety controls',
        move: 'Offer a 2-minute sample call listening preview on Thursday'
      }
    };
  }

  // Technical compliance scrutiny (Vikram Patel)
  if (lower.includes('soc') || lower.includes('latency') || lower.includes('security') || lower.includes('api') || lower.includes('compliance')) {
    return {
      objectionType: 'Technical Architecture & Compliance Scrutiny',
      recommendedScript: `We maintain full SOC2 Type II compliance with on-premise PII tokenization and sub-second Web Audio inference. Can I share our architectural security brief on Thursday?`,
      tacticalRationale: 'Respect technical diligence, cite concrete SOC2 and sub-second latency specs, and offer an engineer-to-engineer review.',
      arm: {
        acknowledge: 'Respect technical diligence and security standards',
        respond: 'Cite sub-second STT latency and SOC2 Type II PII tokenization',
        move: 'Offer a 10-minute architectural walkthrough on Thursday'
      }
    };
  }

  return persona.initialScriptAssist;
}

export async function POST(req: NextRequest) {
  try {
    const rateLimitResponse = applyRateLimit(req, { maxRequests: 120, windowMs: 60000 });
    if (rateLimitResponse) return rateLimitResponse;
    const auth = await requireApiSession(req);
    if (auth instanceof NextResponse) return auth;

    const { personaId, transcript = [], repMessage = '', objectives = [], country = 'USA', mode = '', scriptStage = '', scriptStepGoal = '', scriptStepText = '', scriptStepTip = '', objectionLabel = '', objectionLine = '', difficulty = '' } = await req.json();
    // Script context sent by the Dialer (plain text only; backticks/dollar signs stripped for the prompt).
    const cleanScript = (v: unknown) => String(v || '').replace(/[`$]/g, '').slice(0, 900);
    const stepGoal = cleanScript(scriptStepGoal);
    const stepText = cleanScript(scriptStepText);
    const stepTip = cleanScript(scriptStepTip);
    const objLabel = cleanScript(objectionLabel).slice(0, 80);
    const objLine = cleanScript(objectionLine).slice(0, 300);
    const isBrushOff = /email|busy|number/i.test(objLabel);
    // Dialer demo: a live call that follows the rep's 4-step script (Opener → Problem → Solution → Close).
    const liveCall = mode === 'live_call';
    const persona = SPARRING_PERSONAS.find(p => p.id === personaId) || SPARRING_PERSONAS[0];
    // The BPO buyers keep their BPO-specific pains; other practice personas use their own scenario.
    const bpoBuyer = persona.id === 'demo-dialer-julian' || persona.id === 'bpo-directory-buyer';
    // Practice mode only: how hard the buyer is to win. Absent on normal Dialer calls (no change).
    const DIFFICULTY_LINES: Record<string, string> = {
      friendly: 'DIFFICULTY FOR THIS PRACTICE CALL: friendly. Be open and warm. Raise your objection once, mildly, and accept any reasonable answer; agree to a meeting at the Close if asked politely.',
      realistic: 'DIFFICULTY FOR THIS PRACTICE CALL: realistic. Behave like a typical busy prospect: push back once or twice and soften when the rep handles it well.',
      tough: 'DIFFICULTY FOR THIS PRACTICE CALL: tough. Be more resistant and impatient than usual: press your objection at least twice, challenge vague or generic answers, and only agree to a meeting if the rep acknowledges your concern, answers with specifics and asks for a clear next step.',
    };
    const difficultyText = DIFFICULTY_LINES[String(difficulty || '').toLowerCase()];
    const difficultyLine = difficultyText ? `- ${difficultyText}\n` : '';
    const STAGES: Record<string, string> = {
      opener: `OPENER: the call just started. Answer like a normal person picking up the phone: confirm who you are and return pleasantries naturally (e.g. "Yes, this is him. How's it going?" / "Good, good, thanks. Who's this?"). Stay friendly until they say why they are calling; only then become a little busy and guarded, and give them a short chance if they are respectful and relevant (e.g. "Okay, I've got a minute, what's this about?").`,
      problem: bpoBuyer
        ? 'PROBLEM: the rep is asking discovery questions. Answer like a real executive: reveal one genuine pain per good question (stale or inaccurate contact data, bounced emails and wrong numbers, reps wasting dials on bad-fit leads, a thin and unpredictable pipeline, deals stalling after the first meeting, no clear view of pipeline stages, inconsistent follow-up). Short, honest, a little frustrated. Do not refuse to talk about your business.'
        : 'PROBLEM: the rep is asking discovery questions. Answer like a real executive: reveal one genuine pain from your situation per good question. Short, honest, a little frustrated. Do not refuse to talk about your business.',
      solution: 'SOLUTION: the rep is pitching how they solve it. Raise one realistic objection at a time (cost, "my senior reps are experienced", "we already buy leads", "prove it"). Soften when they answer with specifics, numbers or proof.',
      close: 'CLOSE: the rep is asking for a meeting. If they handled your objections reasonably, agree to a short meeting and confirm a day/time (e.g. "Fine, Thursday at 2 works, send me the invite."). If they rushed or ignored your concerns, push back once more before agreeing.',
    };
    const stageKey = String(scriptStage || '').toLowerCase().replace(/[^a-z]/g, '');
    const liveCallBlock = liveCall
      ? `

LIVE PHONE CALL MODE (this overrides the sparring rules above wherever they conflict):
- This is a realistic sales call, not a stress test. Behave like a real, busy but reasonable prospect who can be won over.
${difficultyLine}- The rep follows a 4-step call script: Opener, Problem, Solution, Close. Respond naturally to whichever step they are on, and let the call progress.
- Current script step on the rep's screen: ${STAGES[stageKey] || 'Infer the step from what the rep just said.'}
- You MAY discuss your business, pains and numbers when asked good questions. You MAY agree to a meeting at the Close if it was earned (even before turn 3).
- Keep every reply to 1-2 short spoken sentences, like a real phone call. No lists, no stage directions, no quotes around your reply.
${stepText ? `- The rep's call script for this step. Goal: ${stepGoal}. The line they are reading (roughly): ${stepText}. Coaching note for the rep: ${stepTip}.
- Respond the way a real prospect in your situation would respond to THAT line, so the call naturally moves to the next step: at the Opener, half-remember the email and give them a moment; at the Problem, ${bpoBuyer ? 'vent honestly about your lead quality and pipeline health' : 'share an honest pain from your situation'}; at the Solution, raise ${objLabel ? 'your main objection for this call (below)' : bpoBuyer ? 'your signature "no budget" objection' : 'your core pushback'} (unless they already handled it); at the Close, pick one of the times they offered if your concerns were handled.
` : ''}${objLabel ? `- YOUR MAIN OBJECTION ON THIS CALL (the rep chose to practise it): "${objLine}" (${objLabel}). It replaces your usual "no budget" objection${/budget/i.test(objLabel) ? '' : ': on this call do NOT mention budget, finance freezes or spend approvals at all; when they pitch at the Solution step, push back with this objection (or a natural variation of it) instead'}. Raise it ${isBrushOff ? 'early, at the Opener, as soon as they say why they are calling' : 'at the natural moment, usually right after they pitch at the Solution step'}, in your own words and with real emotion. Keep pressing it until the rep handles it well (acknowledges you, answers with substance, proposes a sensible next step); then soften and let the call move on.
` : ''}- React ONLY to what the rep has actually said so far. Never bring up emails, your pains, budget or numbers before the rep raises the topic or asks. Answer greetings and small talk like a normal human first.`
      : '';

    if (repMessage) {
      const validation = validateTextPayload(repMessage, 2000);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
    }

    const voiceConfig = getPersonaVoiceByCountry(persona, (country as SparringCountry) || 'USA');
    const googleApiKey = process.env.GOOGLE_API_KEY;

    // Format transcript turns for the prompt
    const formattedHistory = transcript
      .slice(-6)
      .map((t: { role: string; content: string }) => `${t.role === 'rep' ? 'Sales Rep' : persona.name}: "${t.content}"`)
      .join('\n');

    const prompt = `YOU ARE AN ADVERSARIAL B2B BUYER IN AN INTENSE AI SALES SPARRING SIMULATION.
You are roleplaying as ${persona.name}, ${persona.title} at ${persona.companyType}.
Your Scenario: ${persona.scenario}
Your Core Pushback: "${persona.coreObjection}"
Your Behavioral Rules & Personality:
${persona.systemPrompt}

Current Objectives the Sales Rep must achieve:
${persona.objectives.map((o: any, idx: number) => `Objective ${idx + 1} [id: ${o.id}]: ${o.description}`).join('\n')}

Conversation History so far:
${formattedHistory}

The Sales Rep just said to you: "${repMessage}"

CRITICAL SPARRING & OBJECTION ROLEPLAY RULES:
1. YOU ARE NOT AN AI ASSISTANT. YOU ARE A TOUGH, BUSY, SKEPTICAL B2B EXECUTIVE ON AN UNINVITED COLD CALL.
   - Do NOT respond with logical explanations, advice, or consultative answers!
   - Do NOT volunteer information about your internal team or workflow.
   - If the rep asks qualification questions (e.g. "What is your biggest bottleneck?", "How do you handle SDRs?"), PUSH BACK:
     * "Why would I discuss our internal workflow with a cold caller?"
     * "Look, I didn't ask for a consultation. What is the reason you called my direct line?"
2. IN EVERY TURN, YOU MUST THROW A REALISTIC OBJECTION OR POINT OF FRICTION:
   - Challenge their claims ("Everyone promises double-digit lift, sounds like marketing buzzwords").
   - Push for time ("I have literally 15 seconds before my meeting starts, give me the headline").
   - Deflect to email ("Shoot an email to our general inbox, I don't take sales calls").
   - Defend the status quo ("We already have an established vendor and we are completely satisfied").
   - Challenge proof ("What actual hard data do you have to back that up?").
3. NEVER AGREE ON TURN 1 OR TURN 2:
   - Even if the rep asks for a meeting or mentions Thursday early on, DO NOT agree.
   - Push back: "Hold on, you haven't even told me why I'd spend 10 minutes with you. What makes your team any different from everyone else?"
4. WHEN TO SOFTEN (AND ONLY WHEN EARNED):
   - You ONLY soften if the rep has reached at least turn 2+ AND properly executed the A.R.M. Framework:
     * Acknowledge: Validated your specific time crunch, frustration, or objection with tactical empathy.
     * Respond: Delivered a clear, credible, quantified metric or social proof (e.g., hold rate lift, SLA numbers).
     * Move: Closes with a low-friction 10-minute diagnostic comparison (NOT a long demo).
   - Even when agreeing, stay grounded: "Look, I'm still skeptical, but if it's strictly a 10-minute diagnostic comparison and not a sales pitch, I'll take a look Thursday morning."
5. PUNCHY SPOKEN PHONE CADENCE:
   - Deliver 1 to 2 short, punchy sentences (15 to 25 words total).
   - Sound like a real person talking on a phone, not an AI writing an essay.
6. REAL-TIME SCRIPT ASSIST:
   - Return a real-time "scriptAssist" battlecard showing the exact verbatim counter-script the rep should say to handle your objection.

${liveCallBlock}

Return STRICT JSON only:
{
  "reply": "Your spoken in-character pushback/objection directly challenging the rep",
  "completedObjectiveIds": ["id_of_completed_objective_if_earned"],
  "sentiment": "hostile" | "skeptical" | "neutral" | "softened" | "agreed",
  "armObservation": "One sentence assessing rep's ARM execution",
  "scriptAssist": {
    "objectionType": "Short label of the friction/objection you just raised",
    "recommendedScript": "Exact verbatim sentence(s) the rep should speak aloud right now using ARM to handle your objection",
    "tacticalRationale": "Why this specific counter-script works against this objection",
    "arm": {
      "acknowledge": "How to validate your friction",
      "respond": "How to reframe with metrics/differentiation",
      "move": "The low-friction closing question"
    }
  }
}`;

    let personaReply = '';
    let completedIds: string[] = [];
    let sentiment = 'skeptical';
    let armObservation = '';
    let scriptAssist: any = null;

    // 1. Try Gemini 3.5 Flash Lite first (fastest sub-second model), then 3.5 Flash
    if (googleApiKey) {
      const candidateModels = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
      for (const model of candidateModels) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6500);

          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleApiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  responseMimeType: 'application/json',
                  temperature: 0.75,
                  maxOutputTokens: 800
                }
              })
            }
          );
          clearTimeout(timeoutId);

          if (res.ok) {
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              const parsed = extractJson(text);
              if (parsed && parsed.reply) {
                personaReply = parsed.reply;
                completedIds = parsed.completedObjectiveIds || [];
                sentiment = parsed.sentiment || 'skeptical';
                armObservation = parsed.armObservation || '';
                if (parsed.scriptAssist && parsed.scriptAssist.recommendedScript) {
                  scriptAssist = parsed.scriptAssist;
                }
                break;
              }
            }
          } else {
            console.warn(`[Sparring Chat] Gemini ${model} status ${res.status}:`, (await res.text()).slice(0, 80));
          }
        } catch (geminiErr) {
          console.warn(`[Sparring Chat] Gemini ${model} note:`, geminiErr);
        }
      }
    }

    // 2. Intelligent persona-aware fallback if Gemini was unreachable
    if (!personaReply) {
      const fallbackResult = generateContextualFallback(persona, repMessage, transcript);
      personaReply = fallbackResult.reply;
      completedIds = fallbackResult.completedIds;
      sentiment = fallbackResult.sentiment;
      armObservation = fallbackResult.armObservation;
    }

    // 3. Ensure scriptAssist is always computed and robust
    if (!scriptAssist || !scriptAssist.recommendedScript) {
      scriptAssist = deriveDynamicScriptAssist(persona, personaReply, sentiment);
    }

    // 4. Voice the reply with ElevenLabs (persona's conversational voice settings). On failure the
    //    client shows "Voice unavailable, retry"; there is no other TTS provider or browser voice.
    let audioUrl: string | null = null;
    let voiceModel: string | null = null;
    let voiceError: { code: string; message: string } | null = null;
    if (personaReply) {
      const voice = await synthesizeWithElevenLabs({
        text: personaReply,
        // Live calls (demo Dialer / Mock dialer) use the persona's own voice, matching the "Hello?" pickup.
        voiceId: liveCall && persona.voiceId ? persona.voiceId : voiceConfig.voiceId,
        voiceSettings: persona.voiceSettings,
        modelId: ELEVENLABS_MODELS.realtime,
      });
      if (voice.ok) {
        audioUrl = voice.audio;
        voiceModel = voice.model;
      } else {
        voiceError = { code: voice.code, message: voice.error };
      }
    }

    return NextResponse.json({
      reply: personaReply,
      audioUrl,
      voiceModel,
      voiceError,
      completedObjectiveIds: completedIds,
      sentiment,
      armObservation,
      scriptAssist
    });

  } catch (error: any) {
    console.error('[Sparring Chat Route] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Sparring turn processing failed' },
      { status: 500 }
    );
  }
}
