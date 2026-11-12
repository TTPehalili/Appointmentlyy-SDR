# BPO Client Acquisition: Cold Call Teleprompter, AI Assistant & Sparring Spec

> **Target Audience:** Developers, Full-Stack Engineers & AI/ML Engineers  
> **LMS Features:** 
> 1. Interactive Outbound Teleprompter & State Machine  
> 2. Real-Time AI Script Assist (Live Objection Rebuttal Suggester)  
> 3. AI Voice Sparring Agents (Pre-Call Roleplay Simulator)  
> **Methodology:** ARM (Acknowledge, Redirect, Move)  
> **Tone / Language Level:** 4th-Grade Simplicity (Zero sales jargon, consultative, human, peer-to-peer)

---

## 1. System Architecture & State Machine

```
[SCREEN 1: Opener & Role Verification]
          │
          ├──> (Not in Role / Left) ──> [Update CRM & Ask for Referral] ──> [End Call]
          │
          └──> (Confirmed in Role)
                    │
                    ▼
[SCREEN 2: Pattern Interrupt & Lead Quality Check]
          │
          ├──> (Yes / No / What is that?)
                    │
                    ▼
[SCREEN 3: Shared-Lead Problem & Confirmation Gate]
          │
          ├──> (Confirmed Pain: Price wars / Shared leads)
          │         │
          │         ▼
          │    [SCREEN 4: The Bigger Picture Pitch]
          │         │
          │         ▼
          │    [SCREEN 5: Dynamic Qualification & Response]
          │         │
          │         ├── [Selection A: Customer Support] ──> [Teleprompter: CS Response] ─────┐
          │         ├── [Selection B: Bookkeeping/Acct]  ──> [Teleprompter: BK Response] ─────┤
          │         ├── [Selection C: Outbound Sales]    ──> [Teleprompter: Sales Response] ──┤
          │         ├── [Selection D: Tech Support]      ──> [Teleprompter: Tech Response] ───┤
          │         └── [Selection E: Other Service]     ──> [Input + Universal Response] ───┘
          │                                                                                   │
          │                                                                                   ▼
          └───────────────────────────────────────────────────────────────────> [SCREEN 6: 20-Min Demo Close]
                                                                                              │
                                                                                              ▼
                                                                                    [Calendar Booked / Exit]
```

### Global LMS Features:
1. **Collapsible ARM Objection Drawer:** Instant access to scripts across all screens.
2. **Real-Time AI Script Assist:** Real-time audio stream listener that matches customer objections to the corresponding ARM rebuttal dynamically.
3. **AI Voice Sparring Agent Engine:** Pre-call simulation simulator configured with the exact objection set to train BDRs before live dials.

---

## 2. Interactive Screens & Developer Prompts

### Screen 1: Opener & Role/Department Verification Gate

#### Teleprompter Script:
> "Hi **{{prospect.first_name}}**, this is **{{rep.first_name}}** with **{{rep.company_name}}**. I know you weren't expecting my call—do you have 30 seconds?  
>  
> I’m reaching out because my notes show you’re still leading **{{prospect.department}}** as the **{{prospect.title}}** over at **{{prospect.company_name}}**—is that still accurate?"

#### UI Actions & State Buttons:
* `[ Button: Confirmed in Role ]` ➔ Advances to **Screen 2**.
* `[ Button: Promoted / New Title ]` ➔ Opens inline text field `[ Updated Title ]` ➔ Saves to state ➔ Advances to **Screen 2**.
* `[ Button: No Longer in Role / Left Company ]` ➔ Displays Referral Capture Script:
  > *"Got it, thanks for letting me know! Who stepped into your shoes over at {{prospect.company_name}} to handle {{prospect.department}}?"*  
  *(Captures new contact, updates CRM, and prompts rep to end call).*

---

### Screen 2: Pattern Interrupt & Lead Quality Check

#### Teleprompter Script:
> "Appreciate that, **{{prospect.first_name}}**. We work with BPO bosses who buy lists of people to call. A lot of folks we talk to tell us a big chunk of those lists bounce, ring wrong numbers, or reach people who left—does that sound familiar?"

#### UI Actions & State Buttons:
* `[ Button: Yes / Familiar ]` ➔ Sets `prospect.has_lead_quality_pain = true` ➔ Advances to **Screen 3**.
* `[ Button: No / Lists Are Fine ]` ➔ Sets `prospect.has_lead_quality_pain = false` ➔ Advances to **Screen 3**.

---

### Screen 3: The Shared-Lead Trap & Confirmation Gate

#### Teleprompter Script:
> "Got it. The biggest headache BPO bosses share with us is that lead vendors sell those exact same names to 3 to 5 other BPOs.  
>  
> So when your team gets on the phone, the buyer hits them right away saying: *'I already talked to three other BPOs this week, and someone else said they’ll do it way cheaper.'*  
>  
> **Are you guys noticing that too, where your team is constantly fighting off cheaper prices on those shared leads?**"

*Developer Alert Box: `[ PAUSE - DO NOT SPEAK. LET THEM VENT & CONFIRM. ]`*

#### UI Actions & State Buttons:
* `[ Button: Confirmed Pain ("Yes, happens all the time") ]` ➔ Advances to **Screen 4**.
* `[ Button: Denied Pain ("No, our leads are exclusive") ]` ➔ Triggers Quick ARM Hook:
  > *"Understood! Even when vendors say they are exclusive, reps often find prospects were already pitched by cheaper rivals weeks ago."* ➔ Advances to **Screen 4**.

---

### Screen 4: Paint the Bigger Picture

#### Teleprompter Script:
> "Here is the bigger picture of what is really happening:  
>  
> **The Real Problem:** When you buy shared leads and hand them straight to your reps, you are paying top dollar for leads, but your reps are using those expensive calls as practice swings. Because they don't know the buyer's real issues, they sound just like the other 4 BPOs. That forces you into an ugly price war where your profit gets chopped in half.  
>  
> **The Real Fix:** You need two things working together:  
> 1. **Private, Fresh Lists:** We use Claude AI to build and fully enrich your dream list so you own the names and nobody else is calling them.  
> 2. **AI Practice Before Live Dials:** Before your reps touch a single expensive lead, they jump on a 2-minute test call with our **AI Sparring Agent**. The AI throws hard price pushback at them and coaches them on what to say.  
>  
> That way, your reps never burn your money practicing on real buyers—they show up ready to win.  
>  
> To see how this fits your model—**what are your top 2 or 3 kinds of businesses to work with? And what services bring in the most money—is it customer service, sales, or bookkeeping?**"

#### UI Actions:
* Renders the dynamic qualification matrix for **Screen 5**.

---

### Screen 5: Dynamic Qualification Matrix & Auto-Responses

*Developer Note: Clicking an option below automatically updates the teleprompter with the tailored response.*

#### Option A: Customer Service / Support
* **Teleprompter Response:**
  > "Got it. If your callers just talk about basic support, buyers treat you like a cheap commodity and push for \$7 or \$8 an hour. Our AI Sparring Agent acts like a tough buyer who demands cheap rates, training your rep to focus on fast reply times, CSAT, and quality so they defend your margins instead of dropping your price."
* `[ Button: Proceed to Demo Close ]` ➔ Advances to **Screen 6**.

#### Option B: Bookkeeping / Accounting / Back-Office
* **Teleprompter Response:**
  > "Makes total sense. Bookkeeping needs real trust. Our Claude lists find companies using QuickBooks or NetSuite, and the AI Sparring Agent tests your reps on accounting terms and compliance questions. That way, your team sounds like real financial pros on minute one."
* `[ Button: Proceed to Demo Close ]` ➔ Advances to **Screen 6**.

#### Option C: Outbound Sales / Lead Generation
* **Teleprompter Response:**
  > "Understood. With sales, buyers want results immediately. The AI Sparring Agent acts like a super busy boss trying to hang up fast, training your reps to hook their attention in 10 seconds flat so they stop burning through expensive leads."
* `[ Button: Proceed to Demo Close ]` ➔ Advances to **Screen 6**.

#### Option D: Technical Support / IT Helpdesk
* **Teleprompter Response:**
  > "Got it. Tech support deals fail when reps sound like script-readers. The AI Sparring Agent drills your reps on tier-1 escalation rules and SLA commitments, turning your reps from basic callers into trusted tech partners."
* `[ Button: Proceed to Demo Close ]` ➔ Advances to **Screen 6**.

#### Option E: Other Service / Niche
* **UI Component:** Input field: `[ Enter Custom Service / Industry: __________ ]`
* **Teleprompter Dynamic Response:**
  > "Makes complete sense. For **{{input.custom_service}}**, generic pitches get ignored fast. We train the AI Sparring Agent on that exact line of work, so your reps practice handling objections specific to **{{input.custom_service}}** before touching a single real lead."
* `[ Button: Save & Proceed to Demo Close ]` ➔ Advances to **Screen 6**.

---

### Screen 6: The 20-Minute Demo Close (Positioning Founder Emil)

#### Teleprompter Script:
> "Look, **{{prospect.first_name}}**, we didn’t build this software in a bubble. Our founder, **Emil**, was a BPO business development director for over 17 years. He lived through this exact pain and built this system right from the trenches to stop BPOs from losing deals to cheaper rivals.  
>  
> I'd love to set up a quick 20-minute screen share directly with Emil. He’ll show you the big picture in action—how Claude builds your private list and how your reps use the AI Sparring Agent to warm up before dialing.  
>  
> Do you have your calendar open—would Thursday at 2:00 PM work, or is Friday morning better for 20 minutes with Emil?"

#### UI Actions:
* Direct embedded calendar widget.
* `[ Button: Meeting Booked ]` ➔ Confirms appointment & syncs with CRM.
* `[ Button: Objection Raised ]` ➔ Auto-focuses the **ARM Objection Playbook Drawer**.

---

## 3. Comprehensive Objection Playbook (ARM Method)

### SCENARIO 1: "We Just Need Clients, We Don't Need Another Tool"
*System ID: `OBJ_NEED_CLIENTS_NOT_TOOLS`*  
*Intent:* Prospect thinks this is just another piece of software to manage and wants immediate revenue/leads.

* **Acknowledge (Agree):**  
  > "100% fair, {{prospect.first_name}}. At the end of the day, you can't pay payroll with software—you need paying clients."
* **Redirect (Leads Won't Close Without Pitch Execution):**  
  > "That's exactly why we don't sell 'just software.' The problem is, buying more leads or appointments doesn't fix anything if your reps get cut down on price the moment a prospect picks up. We give you the targeted client pipeline—built and fully enriched by Claude—and give your reps the sparring tool so they actually win and close those clients instead of losing them to cheaper BPOs."
* **Move (Low-Friction Demo Ask):**  
  > "Emil built this specifically to put signed client contracts in your pipeline, not add tech clutter. Give him 20 minutes to show you how the client acquisition engine works. How does Thursday at 2:00 PM look?"

---

### SCENARIO 2: Pricing Objections (Scope & Custom Roadmap Alignment)
*Core Logic: Because we custom build, we charge based on scope (number of enriched records needed) and customize the AI LMS to match their specific outbound pitch scripts. We need a clear roadmap before giving pricing.*

#### Objection 2A: "How much does this cost? Just tell me the price."
*System ID: `OBJ_PRICE_TELL_ME_NOW`*
* **Acknowledge (Agree):**  
  > "I completely get it, {{prospect.first_name}}—you need to know if the numbers make sense before spending any time on this."
* **Redirect (The Scope & Roadmap Reality):**  
  > "Because everything we do is custom built, there’s no flat price tag. Our pricing depends strictly on your scope: how many enriched prospect records you need pulled each month, and how we customize the AI Sparring Agent to match your BPO's exact sales scripts and service lines. We need to be 100% clear on your outbound roadmap before we quote a dime so you never pay for things you don't need."
* **Move (Low-Friction Demo Ask):**  
  > "Emil can map out that roadmap with you in 10 minutes on a screen share and give you an exact price based on your volume. How does Thursday at 2:00 PM look to look over the numbers?"

#### Objection 2B: "Just email me a rate card or price sheet."
*System ID: `OBJ_PRICE_RATE_CARD`*
* **Acknowledge (Agree):**  
  > "I can definitely send information over—I know you want to protect your calendar."
* **Redirect (No One-Size-Fits-All Rate Sheet):**  
  > "The reason we don't have a static one-page rate card is because we aren't selling generic list packages. We build custom data pipelines for your specific service in {{session.selected_service}} and train custom AI sparring bots on your internal scripts. Giving you a generic sheet would just be guessing at your needs."
* **Move (Low-Friction Demo Ask):**  
  > "Hop on with Emil for 20 minutes. He’ll look at how many seats and leads you run, show you the custom sparring tool live, and walk you through an exact price breakdown. Would Thursday afternoon or Friday morning work better?"

#### Objection 2C: "We don't have budget for new software right now."
*System ID: `OBJ_PRICE_NO_BUDGET`*
* **Acknowledge (Agree):**  
  > "I completely respect that. Running a BPO means keeping a tight lid on expenses."
* **Redirect (Lead Waste vs. Tool Cost):**  
  > "This isn't an extra software expense; it replaces the money you're already burning when reps fumble expensive leads or get beaten by cheaper offshore bids. We customize the whole scope to fit right inside what you already spend on lead data."
* **Move (Low-Friction Demo Ask):**  
  > "Let’s take money off the table completely. Take 20 minutes with Emil to see how the system stops lead burn. If the math doesn't show an immediate return, we shake hands and walk away. Does next Tuesday at 10:00 AM work?"

---

### SCENARIO 3: Lead Vendor & Directory Objections

#### Objection 3A: "We already buy our leads from a list vendor."
*System ID: `OBJ_VENDOR_LEAD_LISTS`*
* **Acknowledge (Agree):**  
  > "That makes total sense—you need volume to keep the floor busy."
* **Redirect (Lead Quality & Pipeline Health):**  
  > "Quick gut check: how much of that list actually connects? When emails bounce and numbers are wrong, your reps burn the shift on dead dials and the pipeline gets thin and hard to forecast. That's lead spend you can't tie back to meetings."
* **Move (Low-Friction Demo Ask):**  
  > "Let’s grab 20 minutes with Emil so he can show you verified lists and how your pipeline looks stage by stage. How does Thursday look?"

#### Objection 3B: "Our lead vendor gives us exclusive leads."
*System ID: `OBJ_VENDOR_EXCLUSIVE_LEADS`*
* **Acknowledge (Agree):**  
  > "I hear that a lot, and on paper, that's what they bill you for."
* **Redirect (Marketplace Reality):**  
  > "Even if the calendar invite wasn't sold twice today, that same prospect was pitched by two other BPOs two weeks ago. If your reps sound like every other vendor pitching seats, the buyer will still shop you against offshore bargain rates."
* **Move (Low-Friction Demo Ask):**  
  > "Emil can show you in 20 minutes how our AI sparring drills reps to completely steer the conversation away from hourly rates. Would Friday morning work?"

---

### SCENARIO 4: Training & Internal Readiness Objections

#### Objection 4A: "Our reps have years of experience, they don't need practice."
*System ID: `OBJ_REPS_EXPERIENCED`*
* **Acknowledge (Agree):**  
  > "That’s awesome—having experienced callers is a huge advantage."
* **Redirect (Expensive Practice Swings):**  
  > "The trouble is, leads cost too much money to use as warm-up swings. Even your best reps can get caught off guard when a buyer brings up a cheaper competitor's quote out of nowhere."
* **Move (Low-Friction Demo Ask):**  
  > "Emil built this so reps can sharpen their edge in 2 minutes before dialing. Would 20 minutes with him next Tuesday be worth a look?"

#### Objection 4B: "We already have internal trainers and an LMS."
*System ID: `OBJ_INTERNAL_LMS_EXISTS`*
* **Acknowledge (Agree):**  
  > "That's great! Internal coaches are super important for company culture and compliance."
* **Redirect (Bandwidth Bottleneck):**  
  > "The hard part is team leaders can't roleplay with every single rep for an hour every morning before they dial. The AI Sparring Agent lets every rep do 5 practice calls before breakfast without taking up your manager's time."
* **Move (Low-Friction Demo Ask):**  
  > "Let’s grab 20 quick minutes with Emil so you can see how much time this saves your trainers. How does Wednesday morning look?"

---

### SCENARIO 5: The Brush-Off & Timing Objections

#### Objection 5A: "Just send me an email."
*System ID: `OBJ_BRUSH_OFF_EMAIL`*
* **Acknowledge (Agree):**  
  > "Happy to do that! I know your inbox is swamped."
* **Redirect (Static PDF vs. Live Voice Tool):**  
  > "Because Emil trains these AI agents on your specific work—like your {{session.selected_service}} calls—a plain paper won't show you how the AI voice coaching actually works."
* **Move (Low-Friction Demo Ask):**  
  > "Give Emil just 20 minutes. You can test out an AI sparring call yourself on screen. If you don't like it in 5 minutes, you can hang up. Would Thursday afternoon work?"

#### Objection 5B: "We are too busy right now / Call back in 6 months."
*System ID: `OBJ_TIMING_BUSY`*
* **Acknowledge (Agree):**  
  > "I get it! You have a busy shop to run and deals to close."
* **Redirect (Ongoing Bleed):**  
  > "The only reason other BPO bosses jump on with Emil is because every month they wait, they are burning thousands of dollars on shared leads that get stolen by cheaper competitors."
* **Move (Low-Friction Demo Ask):**  
  > "Let’s grab 20 quick minutes with Emil early next week before your day gets crazy. How does Wednesday morning look?"

---

## 4. Developer Spec: Real-Time AI Script Assist

### Functional Requirement:
Build a streaming audio classifier that intercepts customer dialogue, identifies objections, and renders an active teleprompter card with the exact ARM response in under 600ms.

```
[Customer Audio Stream]
        │
        ▼ (Live STT: Deepgram / Whisper)
[Transcript Stream Buffer]
        │
        ▼ (Embedding / Vector Intent Classifier)
[Objection Classifier: Cosine Similarity >= 0.82]
        │
        ├──> Matches: "we just need clients" / "don't need tools"
        │       │
        │       ▼
        │    [Emit Event: PUSH_REBUTTAL_CARD]
        │       │
        │       ▼
        │    UI Renders: `OBJ_NEED_CLIENTS_NOT_TOOLS` ARM Card
```

### Intent Matching Matrix for AI Assist:
| Intent / Objection Key | Trigger Phrases (STT Keywords & Semantic Vectors) | Dynamic Rebuttal Component |
| :--- | :--- | :--- |
| `OBJ_NEED_CLIENTS_NOT_TOOLS` | "we just need clients", "don't need more tools", "need revenue not software", "only looking for customers" | Render Scenario 1 Rebuttal |
| `OBJ_PRICE_TELL_ME_NOW` | "how much is it", "give me the price", "what's the cost", "how much do you charge" | Render Scenario 2A Rebuttal |
| `OBJ_PRICE_RATE_CARD` | "send rate card", "send pricing sheet", "email me the prices", "send PDF of prices" | Render Scenario 2B Rebuttal |
| `OBJ_PRICE_NO_BUDGET` | "no budget", "money is tight", "not spending on software", "cannot afford" | Render Scenario 2C Rebuttal |
| `OBJ_VENDOR_LEAD_LISTS` | "we buy our leads", "already have a list vendor", "buying from brokers", "happy with vendors" | Render Scenario 3A Rebuttal |
| `OBJ_REPS_EXPERIENCED` | "reps don't need training", "experienced callers", "seniors reps only", "already trained" | Render Scenario 4A Rebuttal |
| `OBJ_BRUSH_OFF_EMAIL` | "send an email", "shoot me a message", "email me details" | Render Scenario 5A Rebuttal |

---

## 5. Developer Spec: AI Sparring Model Configuration

### Functional Requirement:
Configure the pre-call LLM/Voice agent (e.g., ElevenLabs + Groq/Claude/OpenAI Realtime) so that when BDRs conduct practice sparring sessions, the AI opponent dynamically draws from these exact objection personas.

### Persona Configuration Schema (System Prompt Template):
```yaml
agent_config:
  agent_name: "BPO Lead Sparring Bot"
  system_prompt: |
    You are a skeptical, time-poor decision maker (CEO or Head of Sales) at a mid-market e-commerce, healthcare, or SaaS brand.
    You frequently receive cold calls from BPO and offshore staffing providers.
    
    YOUR OBJECTIVE:
    Push the trainee rep with realistic objections from the list below. Challenge them to defend their value, resist commodity pricing, and test their rapport.

    BEHAVIOR RULES:
    1. Interrupt the trainee after 10-15 seconds if they ramble.
    2. Deploy at least TWO of the following core objections during the simulation:
       - "We already looked at offshore support and got quoted $7/hr from another BPO."
       - "We don't need any software or tools, we just need paying customers right now."
       - "We already buy our leads from a list vendor, we are good."
       - "Just send me an email with your pricing sheet."
    3. Evaluate if the trainee:
       - Acknowledges your point without being defensive.
       - Redirects to their Claude enrichment or AI sparring advantage.
       - Moves to secure a 20-minute meeting with Emil.
    4. Provide actionable scoring (1-10) on:
       - Tone (did they sound like a peer or a telemarketer?)
       - Objection Defense (did they use the ARM framework?)
       - Control of the Call.
```

---

## 6. Frontend Data Schema (JSON Contract)

```json
{
  "call_session_id": "call_98471203",
  "rep": {
    "first_name": "Jordan",
    "company_name": "AcquisitionOS"
  },
  "prospect": {
    "first_name": "Marcus",
    "last_name": "Vance",
    "company_name": "Apex Support Solutions",
    "title": "VP of Business Development",
    "department": "Client Acquisition",
    "is_active_role": true,
    "has_lead_quality_pain": true,
    "confirmed_shared_lead_pain": true
  },
  "qualification": {
    "top_industries": ["E-commerce", "FinTech"],
    "primary_service_line": "Customer Support",
    "custom_service_text": null
  },
  "ai_script_assist": {
    "enabled": true,
    "current_detected_intent": "OBJ_NEED_CLIENTS_NOT_TOOLS",
    "confidence_score": 0.94,
    "suggested_rebuttal_key": "OBJ_NEED_CLIENTS_NOT_TOOLS"
  },
  "ai_sparring_simulation": {
    "assigned_model": "bpo_skeptical_executive_v2",
    "active_objection_pool": [
      "OBJ_NEED_CLIENTS_NOT_TOOLS",
      "OBJ_PRICE_TELL_ME_NOW",
      "OBJ_VENDOR_LEAD_LISTS"
    ],
    "last_session_score": {
      "arm_compliance_percent": 88,
      "tone_rating": "Peer-to-Peer",
      "recommended_coaching_notes": "Watch out for rushing when prospect says they only need clients."
    }
  },
  "booking": {
    "status": "SCHEDULED",
    "founder_name": "Emil",
    "duration_minutes": 20,
    "appointment_timestamp": "2026-10-23T14:00:00Z"
  }
}
```