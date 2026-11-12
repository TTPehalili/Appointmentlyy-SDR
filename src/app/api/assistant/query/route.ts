import { NextRequest, NextResponse } from 'next/server';
import { DEMO_INITIAL_DEMO_ACTIVITIES } from '@/lib/activityStore';
import { DEMO_LOGIN, isDemoSession } from '@/lib/demoMode';
import { getServerSession, type ServerSession } from '@/lib/server/session';
import { getTenantStore } from '@/lib/server/tenantStore';
import { ROLE_RANK, isRepLevel, parseRole, type Role } from '@/lib/roles';
import { detectCopilotIntent, reportMetrics, sanitizeReportData, type ReportData } from '@/lib/copilotReport';
import { raceGemini } from '@/lib/server/gemini';
import {
  coachingReply,
  objectionStatsReply,
  personalSummaryReply,
  repChatReply,
  reportEmailReply,
  writingReply,
  type CopilotReply,
  type Turn,
} from '@/lib/server/copilotAnswers';
import { INITIAL_DEFAULT_DISPOSITIONS } from '@/lib/dispositionStore';
import { SPARRING_PERSONAS } from '@/lib/personas';
import { CADENCE_TOUCHES, DEMO_CADENCE_LEADS } from '@/lib/cadenceMaster';

// Hardcoded Baseline Benchmark Knowledge (Used for Historical Delta & Fallback)
const FLOOR_STATS_KNOWLEDGE = {
  today: {
    callsMade: 284,
    connectRate: '32.7%',
    emailsSent: 160,
    linkedInTouches: 63,
    appointmentsBooked: 9,
    dncCount: 4,
    notInterested: 33,
    callbacksScheduled: 20,
    topRep: 'Alex Mercer (3 bookings, 58 dials)'
  },
  yesterday: {
    callsMade: 310,
    connectRate: '34.1%',
    emailsSent: 175,
    linkedInTouches: 70,
    appointmentsBooked: 11,
    dncCount: 3,
    notInterested: 38,
    callbacksScheduled: 24,
    topRep: 'Sarah Jenkins (4 bookings, 64 dials)'
  },
  lastWeek: {
    callsMade: 1402,
    connectRate: '33.1%',
    emailsSent: 747,
    linkedInTouches: 308,
    appointmentsBooked: 51,
    dncCount: 15,
    notInterested: 151,
    callbacksScheduled: 92,
    holdRate: '88.9%',
    quotaAttainment: '78.5%'
  },
  lastMonth: {
    callsMade: 5730,
    connectRate: '33.8%',
    emailsSent: 3080,
    linkedInTouches: 1255,
    appointmentsBooked: 212,
    dncCount: 56,
    notInterested: 619,
    callbacksScheduled: 381,
    holdRate: '87.4%',
    quotaAttainment: '81.5%'
  },
  nextWeekForecast: {
    scheduledFollowups: 92,
    pipelineCarryOverLeads: 48,
    projectedBookings: '16–22 meetings',
    highPriorityCampaign: 'Apex Global BPO (Day 9 & Day 15 touches due)'
  }
};

const CALL_DRIVERS_ANALYSIS = {
  primaryPositiveDrivers: [
    {
      driver: 'Immediate Email Subject Reference in Opener (Screen 1)',
      impact: '+22.2% Hold Rate Lift',
      description: 'When reps speak the exact Day 1/Day 7 email subject line within the first 5 seconds ("Sent an email yesterday titled quick question on your lead data..."), prospect defensiveness drops from 68% to 26%.'
    },
    {
      driver: 'Desktop Attendance Verification Gate (Screen 6)',
      impact: '88.9% Calendar Show-Up Rate',
      description: 'Asking prospects if they will have their laptop open and sending the calendar invite while on the line eliminates 70% of ghosted demos.'
    },
    {
      driver: 'Day 15 Negative Reverse Selling (Pipeline Check-In)',
      impact: '16.4% Conversion on Cold Callbacks',
      description: 'Replying "Usually when I haven\'t connected by now, it means either your pipeline is full and reps are crushing quotas or you are swamped" generated 14 executive callbacks last week.'
    }
  ],
  primaryNegativeDrivers: [
    {
      driver: 'Lead Quality Freeze (Reps defending the list instead of asking about it)',
      impact: '48% of All Lost Calls',
      description: 'Call notes reveal that when buyers say "We already buy our leads", reps who fail to acknowledge and pivot to bounced emails, wrong numbers and stalled pipeline lose the prospect in under 45 seconds.'
    },
    {
      driver: 'Premature Calendly Pushes without Role Verification',
      impact: '24% of Disqualifications',
      description: 'Reps pitching the 20-min founder demo before confirming whether the prospect leads outbound sales or operations led to 18 gatekeeper / wrong-desk rejections.'
    },
    {
      driver: 'Skipping Voicemail Drop Audio on Day 3 Unanswered Calls',
      impact: '-15% Email #2 Open Rate Drop',
      description: 'Leads who received the 15s voice AI voicemail drop prior to Email #2 opened at 48%, compared to only 33% for leads who received an unannounced email.'
    }
  ]
};

/**
 * Renders the client-supplied live workspace snapshot (real contacts, folders, pipeline) as prompt context
 */
interface LiveSnapshot {
  tenantName?: string;
  role?: string;
  totals?: {
    contacts: number;
    folders: number;
    pipelineValueUsd: number;
    bookedCount: number;
    bookedValueUsd: number;
    withWebsite: number;
    withLinkedin: number;
  };
  folders?: { name: string; totalLeads: number; createdAt: string; reps: { repName: string; leadCount: number }[] }[];
  stages?: { label: string; statusValue: string; count: number; valueUsd: number }[];
  reps?: { repName: string; leads: number; valueUsd: number }[];
  sampleLeads?: { name: string; title: string; company: string; status: string; rep: string; dealValueUsd: number; folder: string }[];
}

const usd = (n: number) => `$${Math.round(n || 0).toLocaleString()}`;

function renderSnapshot(s?: LiveSnapshot | null): string {
  if (!s || !s.totals) return '';
  const folders = (s.folders || [])
    .map((f) => `• "${f.name}": ${f.totalLeads} leads (reps: ${f.reps.map((r) => `${r.repName} ${r.leadCount}`).join(', ') || 'n/a'})`)
    .join('\n');
  const stages = (s.stages || [])
    .map((st) => `• ${st.label}: ${st.count} leads, ${usd(st.valueUsd)}`)
    .join('\n');
  const reps = (s.reps || [])
    .map((r) => `• ${r.repName}: ${r.leads} leads, ${usd(r.valueUsd)} pipeline`)
    .join('\n');
  const sample = (s.sampleLeads || [])
    .map((l) => `• ${l.name} (${l.title}, ${l.company}) - ${l.status} - rep ${l.rep} - ${usd(l.dealValueUsd)} - folder ${l.folder}`)
    .join('\n');
  return `
[LIVE WORKSPACE DATA - authoritative, real data for ${s.tenantName || 'this workspace'}; always prefer this for questions about lists, folders, contacts, leads, pipeline stages, deal values and reps]
- Total contacts: ${s.totals.contacts.toLocaleString()} | ICP contact lists (folders): ${s.totals.folders}
- Total pipeline value: ${usd(s.totals.pipelineValueUsd)} | Meetings booked: ${s.totals.bookedCount} (${usd(s.totals.bookedValueUsd)})
- Contacts with company website: ${s.totals.withWebsite} | with LinkedIn: ${s.totals.withLinkedin}
Contact lists (ICP folders):
${folders || '• none yet'}
Pipeline stages:
${stages || '• none'}
Leads per rep:
${reps || '• none'}
Sample leads:
${sample || '• none'}
`;
}

/**
 * Builds live operational system context from platform stores
 */
function compileLiveSystemContext(snapshot?: LiveSnapshot | null): string {
  // 1. Recent Activities & Call Notes
  const recentActivitySummaries = DEMO_INITIAL_DEMO_ACTIVITIES.slice(0, 10).map((act) => 
    `• [${act.timestamp}] Rep ${act.repName} reached ${act.prospectName} (${act.companyName}) via ${act.channel} (Day ${act.cadenceDay}, Touch #${act.touchNumber}). Disposition: "${act.disposition}". Note: "${act.notesSnippet}"`
  ).join('\n');

  // 2. Active Dispositions & Workflows
  const activeDispositionsSummary = INITIAL_DEFAULT_DISPOSITIONS.map((d) => 
    `• Code: ${d.code} | Name: "${d.name}" | Category: ${d.category} | Trigger Action: ${d.actionTrigger} | Script: "${d.rebuttalScriptPrompt}"`
  ).join('\n');

  // 3. 10 Sparring Personas
  const personasSummary = SPARRING_PERSONAS.map((p) => 
    `• Persona: ${p.name} (${p.title}, ${p.companyType}) - Difficulty: ${p.difficulty}. Core Objection: ${p.coreObjection}. Recommended ARM Move: "${p.initialScriptAssist.arm.move}"`
  ).join('\n');

  // 4. Cadence Touches
  const cadenceSummary = CADENCE_TOUCHES.slice(0, 7).map((c) =>
    `• Day ${c.day}: ${c.stepName} (${c.channel}) - ${c.mechanism}`
  ).join('\n');

  // 5. Active Target Leads
  const leadsSummary = DEMO_CADENCE_LEADS.slice(0, 5).map((l) =>
    `• Lead: ${l.name} (${l.title} at ${l.company}) - Phone: ${l.phone} | Headcount: ${l.headcount} | Pain: ${l.painPoint || 'Lead quality and pipeline health'}`
  ).join('\n');

  return `
--- LIVE SYSTEM TELEMETRY & KNOWLEDGE REPOSITORY ---
${renderSnapshot(snapshot)}
[CURRENT FLOOR PERFORMANCE BENCHMARKS (calling-floor telemetry)]:
- Today's Output: 284 Dials, 32.7% Connect Rate, 9 Appointments Booked, 4 DNC Quarantined. Top Rep: Alex Mercer.
- Yesterday's Output: 310 Dials, 34.1% Connect Rate, 11 Appointments Booked. Top Rep: Sarah Jenkins.
- Last Week Aggregate: 1,402 Dials, 51 Bookings, 88.9% Calendar Hold Rate, 78.5% Quota Attainment.
- Next Week Pipeline Carry-over: 92 Scheduled Follow-ups, 48 Pipeline Carry-Over Accounts, 16–22 Projected Bookings.

[RECENT LIVE CALL LOGS & SYNTHESIZED CRM NOTES]:
${recentActivitySummaries}

[SYSTEM DISPOSITION RULES & TRIGGERS]:
${activeDispositionsSummary}

[SPARRING LMS PERSONAS & REBUTTAL BATTLECARDS]:
${personasSummary}

[16-DAY MULTI-CHANNEL CADENCE BLUEPRINTS]:
${cadenceSummary}

[ACTIVE CAMPAIGN LEADS IN QUEUE]:
${leadsSummary}

[THE 6-SCREEN BPO PLAYBOOK METHODOLOGY]:
1. Screen 1: Role Verification Gate (Enforce Director/VP of Outbound check before pitching).
2. Screen 2: Lead Quality & Pipeline Health Check (Surface stale contact data, wrong numbers, bad-fit leads and a thin or stalled pipeline).
3. Screen 3: Problem vs Fix (Highlight $6k/mo in wasted leads when untrained reps fumble objections).
4. Screen 4: Diagnostic Engine (Benchmark SLA, ramp time, and talk tracks).
5. Screen 5: The Dual Attendance Close (Lock 20-min strategy demo with Founder Emil).
6. Screen 6: Desktop Screen-Share Gate (Verify prospect is in front of laptop and accepts calendar invite live on call; secures 88.9% show-up rate).
`;
}

/**
 * Client workspaces: answers come only from the real snapshot the browser sends. No sample
 * benchmarks, reps, leads or call notes; with no data yet, the answer says so.
 */
function snapshotHasData(s?: LiveSnapshot | null): boolean {
  return Boolean(s?.totals && (s.totals.contacts > 0 || s.totals.folders > 0));
}

/** The team's logged activity for the asked period, as prompt context (all numbers precomputed). */
function renderActivity(d: ReportData | null): string {
  if (!d) return '';
  if (d.totals.activities === 0)
    return `\n[ACTIVITY LOG - ${d.periodLabel} (${d.rangeLabel})]\nNo calls, emails or LinkedIn touches logged in this period (${d.allTimeActivities} logged in total).\n`;
  return `\n[ACTIVITY LOG - ${d.periodLabel} (${d.rangeLabel}); authoritative for calls, connects, meetings, callbacks and rep activity]
${reportMetrics(d).map((m) => `- ${m.label}: ${m.value}`).join('\n')}
Per rep: ${d.reps.map((r) => `${r.name} (${r.dials} dials, ${r.connectRate ?? 'n/a'}% connect, ${r.meetings} meetings, ${r.callbacks} callbacks)`).join('; ') || 'none'}
Top objections: ${d.objections.map((o) => `${o.label} (${o.count})`).join(', ') || 'none recorded'}
`;
}

function activityAnswer(d: ReportData): string {
  if (d.totals.activities === 0) return '';
  const rows = reportMetrics(d).map((m) => `| ${m.label} | ${m.value} |`).join('\n');
  return `\n\n**Logged activity: ${d.periodLabel} (${d.rangeLabel})**\n\n| Metric | Value |\n| :--- | :--- |\n${rows}`;
}

function snapshotAnswer(s: LiveSnapshot): string {
  const t = s.totals!;
  const folderLines = (s.folders || [])
    .map((f) => `| ${f.name} | ${f.totalLeads.toLocaleString()} | ${f.reps.map((r) => `${r.repName} (${r.leadCount})`).join(', ') || '-'} |`)
    .join('\n');
  const stageLines = (s.stages || [])
    .filter((st) => st.count > 0)
    .map((st) => `| ${st.label} | ${st.count.toLocaleString()} | ${usd(st.valueUsd)} |`)
    .join('\n');
  const repLines = (s.reps || [])
    .map((r) => `| ${r.repName} | ${r.leads.toLocaleString()} | ${usd(r.valueUsd)} |`)
    .join('\n');
  return `### Workspace snapshot${s.tenantName ? `: ${s.tenantName}` : ''}

You have **${t.folders} contact list${t.folders === 1 ? '' : 's'}** holding **${t.contacts.toLocaleString()} contacts**, **${usd(t.pipelineValueUsd)}** in pipeline value and **${t.bookedCount} meeting${t.bookedCount === 1 ? '' : 's'} booked**.

**Contact lists**

| List | Leads | Rep split |
| :--- | :--- | :--- |
${folderLines || '| _No lists yet_ | 0 | - |'}

**Pipeline stages**

| Stage | Leads | Deal value |
| :--- | :--- | :--- |
${stageLines || '| _No leads in any stage yet_ | 0 | - |'}

**Leads per rep**

| Rep | Leads | Pipeline value |
| :--- | :--- | :--- |
${repLines || '| _None_ | 0 | - |'}

> Call, email and booking metrics appear here once your team starts logging activity.`;
}

const NO_DATA_ANSWER = `### No data yet

This workspace doesn't have any contacts, calls or activity yet, so there's nothing to report.

Import or add leads in **Contacts** or **Lead Finder**, then start calling from the **Dialer**. Your numbers will show up here as your team works.`;

async function answerForWorkspace(question: string, snapshot: LiveSnapshot | null, apiKey?: string, activity: ReportData | null = null) {
  const hasActivity = Boolean(activity && activity.allTimeActivities > 0);
  const hasData = snapshotHasData(snapshot) || hasActivity;
  if (apiKey && hasData) {
    const prompt = `You are the operations assistant for a sales team's workspace${snapshot?.tenantName ? ` (${snapshot.tenantName})` : ''}.
Answer ONLY from the workspace data below. It is the complete set of data you have. If the question needs data that isn't there (for example call outcomes, connect rates, bookings over time or rep activity), say plainly that there's no data for that yet. Never invent numbers, people, companies or benchmarks.
Format with clean Markdown (short headings, bullets, small tables).

WORKSPACE DATA:
${renderSnapshot(snapshot)}${renderActivity(activity)}

USER QUESTION:
${question}`;
    const winner = await raceGemini(apiKey, prompt, { timeoutMs: 15000 });
    if (winner) {
      return NextResponse.json({
        answer: winner.text,
        category: 'live_ai_intelligence',
        source: `gemini_rag_${winner.model}`,
        timestamp: new Date().toISOString(),
      });
    }
  }
  const answer = !hasData
    ? NO_DATA_ANSWER
    : snapshotHasData(snapshot)
    ? snapshotAnswer(snapshot!) + (activity ? activityAnswer(activity) : '')
    : `### Workspace activity${activityAnswer(activity!) || `\n\nNo activity was logged ${activity!.periodLabel.toLowerCase()} (${activity!.rangeLabel}).`}`;
  return NextResponse.json({
    answer,
    category: hasData ? 'workspace_snapshot' : 'no_data',
    timestamp: new Date().toISOString(),
  });
}

const MAX_BODY_CHARS = 200_000;
/** Questions about the workspace's own data (answered from it, honestly, even when it's empty). */
const DATA_QUESTION =
  /\b(how many|pipeline|deals?|leads?|contacts?|lists?|folders?|stages?|meetings?|book(ed|ings?)?|calls?|dials?|connects?|reps?|team|floor|stats?|numbers?|perform\w*|reports?|activity|activities|today|yesterday|week|month|quota|callbacks?|stalling|top)\b/i;
const clipText = (v: unknown, max = 120) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/**
 * The role to answer as. The browser sends the role it shows (it follows a Super Admin's "View as"
 * preview), which may only NARROW the signed-in user's real role, never widen it.
 */
function effectiveRole(session: ServerSession | null, asked: unknown): Role {
  const real: Role = session ? (session.isPlatformAdmin ? 'Super Admin' : session.role) : DEMO_LOGIN ? 'Super Admin' : 'Rep';
  const want = parseRole(asked);
  return want && ROLE_RANK[want] <= ROLE_RANK[real] ? want : real;
}

function cleanHistory(v: unknown): Turn[] {
  if (!Array.isArray(v)) return [];
  return v.slice(-6).flatMap((t) => {
    const from = (t as Turn)?.from === 'ai' ? 'ai' : (t as Turn)?.from === 'user' ? 'user' : null;
    const text = typeof (t as Turn)?.text === 'string' ? (t as Turn).text.slice(0, 700) : '';
    return from && text ? [{ from, text } as Turn] : [];
  });
}

/** Active members of the signed-in user's own workspace (from the session, never the request). */
async function activeMemberCount(session: ServerSession | null): Promise<number | undefined> {
  if (!session) return undefined;
  try {
    const members = await getTenantStore().listMembers({ tenantCode: session.tenantCode });
    const n = members.filter((m) => m.status === 'active').length;
    return n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_CHARS) {
      return NextResponse.json({ error: 'That request is too large. Try a shorter question.' }, { status: 413 });
    }
    let body: { question?: unknown; context?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }
    const question = typeof body.question === 'string' ? body.question.trim().slice(0, 2000) : '';
    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }
    const context = (body.context && typeof body.context === 'object' ? body.context : {}) as Record<string, unknown>;

    const session = await getServerSession(req);
    if (!session && !DEMO_LOGIN) {
      return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    }
    // Sample benchmarks, reps and call notes are for the platform owner's demo workspace only.
    const isDemo = isDemoSession(session);
    const role = effectiveRole(session, context.role);
    const canSeeTeam = ROLE_RANK[role] >= ROLE_RANK.Supervisor;
    const snapshot = (context.snapshot && typeof context.snapshot === 'object' ? context.snapshot : null) as LiveSnapshot | null;
    const tenantName = session?.identity.tenant.name || clipText(snapshot?.tenantName) || 'your workspace';
    const senderName = session?.name || clipText(context.repName, 80) || 'Your name';
    const history = cleanHistory(context.history);
    const apiKey = process.env.GOOGLE_API_KEY;

    // Metrics the browser computed (copilotReport). Sample data is only accepted for the demo workspace,
    // and team figures only for Supervisor and above.
    const reportIn = (context.report && typeof context.report === 'object' ? context.report : null) as { team?: unknown; personal?: unknown } | null;
    const accept = (d: ReportData | null) => (d && (d.source !== 'demo_sample' || isDemo) ? d : null);
    const team = canSeeTeam ? accept(sanitizeReportData(reportIn?.team)) : null;
    const mine = accept(sanitizeReportData(reportIn?.personal));
    const personal = mine && mine.scope === 'rep' ? mine : null;

    const reply = (r: CopilotReply) => NextResponse.json({ ...r, role, timestamp: new Date().toISOString() });
    const intent = detectCopilotIntent(question);

    if (reportIn && (intent === 'report' || intent === 'coaching' || intent === 'objection_stats' || intent === 'personal')) {
      if (!canSeeTeam || intent === 'personal') {
        if (intent === 'objection_stats' && personal) {
          return reply(objectionStatsReply(personal, { isDemo, tenantName, scopeLabel: ' you heard' }));
        }
        return reply(personalSummaryReply(personal, { askedForTeam: !canSeeTeam && intent !== 'personal' }));
      }
      if (!team) {
        return reply({
          answer: "I couldn't read this period's activity, so I can't build the report right now. Open **Reports** and then ask again.",
          category: 'no_data',
        });
      }
      if (intent === 'report') {
        const activeMembers = isDemo ? undefined : await activeMemberCount(session);
        return reply(await reportEmailReply(team, { tenantName, senderName, activeMembers, apiKey }));
      }
      if (intent === 'coaching') return reply(coachingReply(team));
      return reply(objectionStatsReply(team, { isDemo, tenantName, scopeLabel: '' }));
    }

    if (intent === 'objection_help' || intent === 'email' || intent === 'linkedin') {
      return reply(await writingReply(intent, question, { isDemo, tenantName, senderName, history, apiKey }));
    }

    // Reps (and Account Executives, who have a Rep's access) get a coach that only knows their own numbers.
    if (isRepLevel(role)) {
      const extraContext = snapshotHasData(snapshot) ? `MY LEADS (real workspace data):${renderSnapshot(snapshot)}` : '';
      return reply(await repChatReply(question, { isDemo, tenantName, senderName, history, apiKey, personal, extraContext }));
    }

    if (!isDemo) {
      // Writing / coaching questions don't need workspace data; data questions are answered from it.
      if (!DATA_QUESTION.test(question)) {
        return reply(await repChatReply(question, { isDemo, tenantName, senderName, history, apiKey, personal: null, audience: 'lead' }));
      }
      return answerForWorkspace(question, snapshot, apiKey, team);
    }

    const qLower = question.toLowerCase();
    const systemContext = compileLiveSystemContext(snapshot) + renderActivity(team);
    const googleApiKey = apiKey;

    // --- TIER 1: LIVE AI INFERENCE (Gemini Flash Model) ---
    if (googleApiKey) {
      const systemPrompt = `You are AI Boris Operations Intelligence, an elite BPO Operations, QA & Sales Telemetry specialist for Appointmentlyy.
You have real-time visibility into the calling floor, rep activities, call telemetry, auto-synthesized CRM notes, objection matrices, and cadence blueprints.

YOUR OBJECTIVE:
Provide direct, authoritative, highly structured executive operations intelligence to the user.
Answer the user's specific inquiry using the verified system data provided below.

DATA CONTEXT:
${systemContext}

OUTPUT GUIDELINES:
1. Format with clean GitHub-flavored Markdown: use bolding, bullet points, clean tables, and callout blocks (> [!NOTE] or > **Executive Takeaway**).
2. Be specific: cite actual numbers, SDR names (e.g. Alex Mercer, Sarah Jenkins), lead names (e.g. Julian Vance, Marcus Brody), and exact percentages from the system data.
3. If asked about performance, stats, drivers, objections, or reps, include root-cause telemetry and actionable operational recommendations.
4. Keep the tone sharp, executive, and operationally rigorous.`;

      const fullPrompt = `${systemPrompt}\n\nUSER QUESTION:\n${question}`;

      // Race all candidate models in parallel; the first non-empty answer wins (keeps demo latency low)
      const winner = await raceGemini(googleApiKey, fullPrompt, { timeoutMs: 15000 });

      if (winner) {
        return NextResponse.json({
          answer: winner.text,
          category: 'live_ai_intelligence',
          source: `gemini_rag_${winner.model}`,
          timestamp: new Date().toISOString()
        });
      }
    }

    // --- TIER 2: DETERMINISTIC FALLBACK (If LLM is offline or no API key) ---
    // 0. LIVE WORKSPACE DATA INQUIRY (lists, folders, contacts, pipeline, deal value) answered from real snapshot
    if (
      snapshot?.totals &&
      /(list|folder|contact|lead|pipeline|deal|value|stage|how many|kanban)/.test(qLower) &&
      !/(driver|objection|rebuttal|quota|leaderboard|yesterday|last week|next week|last month)/.test(qLower)
    ) {
      const t = snapshot.totals;
      const folderLines = (snapshot.folders || [])
        .map((f) => `| ${f.name} | ${f.totalLeads.toLocaleString()} | ${f.reps.map((r) => `${r.repName} (${r.leadCount})`).join(', ') || '-'} |`)
        .join('\n');
      const stageLines = (snapshot.stages || [])
        .map((st) => `| ${st.label} | ${st.count.toLocaleString()} | ${usd(st.valueUsd)} |`)
        .join('\n');
      const repLines = (snapshot.reps || [])
        .map((r) => `| ${r.repName} | ${r.leads.toLocaleString()} | ${usd(r.valueUsd)} |`)
        .join('\n');
      const md = `### 📇 Live Workspace Snapshot${snapshot.tenantName ? ` — ${snapshot.tenantName}` : ''}

You currently have **${t.folders} contact list${t.folders === 1 ? '' : 's'}** holding **${t.contacts.toLocaleString()} contacts**, with **${usd(t.pipelineValueUsd)}** total pipeline value and **${t.bookedCount} meeting${t.bookedCount === 1 ? '' : 's'} booked** (${usd(t.bookedValueUsd)}).

**Contact Lists (ICP Folders)**

| List | Leads | Rep Split |
| :--- | :--- | :--- |
${folderLines || '| _No lists yet_ | 0 | - |'}

**Pipeline Stages**

| Stage | Leads | Deal Value |
| :--- | :--- | :--- |
${stageLines || '| _No stages_ | 0 | - |'}

**Leads per Rep**

| Rep | Leads | Pipeline Value |
| :--- | :--- | :--- |
${repLines || '| _None_ | 0 | - |'}

> **Data Coverage:** ${t.withWebsite.toLocaleString()} contacts have a company website and ${t.withLinkedin.toLocaleString()} have a LinkedIn profile.`;

      return NextResponse.json({
        answer: md,
        category: 'workspace_snapshot',
        timestamp: new Date().toISOString()
      });
    }

    // 1. STATS INQUIRY (today, yesterday, last week, next week, last month)
    if (
      qLower.includes('stat') ||
      qLower.includes('overall') ||
      qLower.includes('performance') ||
      qLower.includes('yesterday') ||
      qLower.includes('today') ||
      qLower.includes('last week') ||
      qLower.includes('last month') ||
      qLower.includes('next week')
    ) {
      const responseMarkdown = `### 📊 Floor Performance & Activity Report

Here is the verified data for your sales organization across your requested timeframes:

| Metric | Today | Yesterday | Last Week | Last Month |
| :--- | :--- | :--- | :--- | :--- |
| **Calls Made** | **${FLOOR_STATS_KNOWLEDGE.today.callsMade}** | ${FLOOR_STATS_KNOWLEDGE.yesterday.callsMade} | ${FLOOR_STATS_KNOWLEDGE.lastWeek.callsMade} | ${FLOOR_STATS_KNOWLEDGE.lastMonth.callsMade} |
| **Connect Rate** | **${FLOOR_STATS_KNOWLEDGE.today.connectRate}** | ${FLOOR_STATS_KNOWLEDGE.yesterday.connectRate} | ${FLOOR_STATS_KNOWLEDGE.lastWeek.connectRate} | ${FLOOR_STATS_KNOWLEDGE.lastMonth.connectRate} |
| **Emails Sent** | **${FLOOR_STATS_KNOWLEDGE.today.emailsSent}** | ${FLOOR_STATS_KNOWLEDGE.yesterday.emailsSent} | ${FLOOR_STATS_KNOWLEDGE.lastWeek.emailsSent} | ${FLOOR_STATS_KNOWLEDGE.lastMonth.emailsSent} |
| **LinkedIn Touches** | **${FLOOR_STATS_KNOWLEDGE.today.linkedInTouches}** | ${FLOOR_STATS_KNOWLEDGE.yesterday.linkedInTouches} | ${FLOOR_STATS_KNOWLEDGE.lastWeek.linkedInTouches} | ${FLOOR_STATS_KNOWLEDGE.lastMonth.linkedInTouches} |
| **Appointments Booked** | **${FLOOR_STATS_KNOWLEDGE.today.appointmentsBooked}** 🎯 | **${FLOOR_STATS_KNOWLEDGE.yesterday.appointmentsBooked}** 🎯 | **${FLOOR_STATS_KNOWLEDGE.lastWeek.appointmentsBooked}** 🎯 | **${FLOOR_STATS_KNOWLEDGE.lastMonth.appointmentsBooked}** 🎯 |
| **DNC Quarantined** | **${FLOOR_STATS_KNOWLEDGE.today.dncCount}** 🚫 | ${FLOOR_STATS_KNOWLEDGE.yesterday.dncCount} | ${FLOOR_STATS_KNOWLEDGE.lastWeek.dncCount} | ${FLOOR_STATS_KNOWLEDGE.lastMonth.dncCount} |
| **Carry-Over Callbacks** | **${FLOOR_STATS_KNOWLEDGE.today.callbacksScheduled}** 🔄 | ${FLOOR_STATS_KNOWLEDGE.yesterday.callbacksScheduled} | ${FLOOR_STATS_KNOWLEDGE.lastWeek.callbacksScheduled} | ${FLOOR_STATS_KNOWLEDGE.lastMonth.callbacksScheduled} |

---

### 🔮 Next Week Forecast & Carry-Over Backlog:
* **Scheduled Follow-ups:** **${FLOOR_STATS_KNOWLEDGE.nextWeekForecast.scheduledFollowups} leads** carrying over from earlier cadence days.
* **Pipeline Carry-over Leads:** **${FLOOR_STATS_KNOWLEDGE.nextWeekForecast.pipelineCarryOverLeads} high-intent accounts** currently at Day 9 and Day 15.
* **Projected Bookings:** **${FLOOR_STATS_KNOWLEDGE.nextWeekForecast.projectedBookings}** based on current connect velocity.
* **Top Contributing Campaign:** *${FLOOR_STATS_KNOWLEDGE.nextWeekForecast.highPriorityCampaign}*.

> **Executive Takeaway:** Floor booking velocity is up **+18.4% week-over-week**, with **${FLOOR_STATS_KNOWLEDGE.today.topRep}** leading the floor today.`;

      return NextResponse.json({
        answer: responseMarkdown,
        category: 'stats_overview',
        timestamp: new Date().toISOString()
      });
    }

    // 2. CALL DRIVERS & BOOKING RATE IMPACT (based on call notes & dispositions)
    if (
      qLower.includes('driver') ||
      qLower.includes('booking rate') ||
      qLower.includes('impact') ||
      qLower.includes('call notes') ||
      qLower.includes('disposition') ||
      qLower.includes('why') ||
      qLower.includes('leak')
    ) {
      const responseMarkdown = `### 📊 EXECUTIVE QA & OUTBOUND OPERATIONS INTELLIGENCE BRIEFING
**Subject:** Root-Cause Call Drivers Impacting Outbound Booking Rate & Floor Velocity  
**Analyst:** Senior Outbound Operations, QA & Telemetry Systems Specialist  
**Data Scope:** 1,482 Live Outbound Dials • 426 Conversations • 84 Dispositioned Call Notes Across 5 SDRs  

---

### 📈 EXECUTIVE SUMMARY: PERFORMANCE CORRELATION MATRIX

| Operational Driver | High-Performing Cohort | Floor Average / Lagging | Net Booking Impact | Action Priority |
| :--- | :--- | :--- | :--- | :--- |
| **Email Context Opener (Screen 1)** | 91.4% Adherence | 34.2% Adherence | **+22.2% Hold Rate** | **CRITICAL (P0)** |
| **Pivot to Lead Quality & Pipeline Health** | 82.5% Rebuttal Use | 19.8% Rebuttal Use | **+18.6% Reversal Rate** | **HIGH (P1)** |
| **Calendar Screen-Share Lock (Screen 6)** | 94.1% Live Verification | 41.0% Premature Push | **+36.8% Show-Up Rate** | **HIGH (P1)** |
| **Day 3 Voicemail Drop Trigger** | 88.0% Audio Drop Rate | 32.5% Manual Hang-Up | **+15.0% Email #2 Opens** | **MEDIUM (P2)** |
| **Premature Closing w/o Role Check** | 4.2% Occurrence | 28.6% Occurrence | **-24.0% Disqualification** | **CRITICAL (P0)** |

---

### 🚀 POSITIVE CALL DRIVERS (ACCELERATING BOOKING RATE)

#### 1. Immediate Prior-Email Context Injection in Opening 7 Seconds
* **📊 The Data:**
  * Dials opening with the exact prior email subject registered a **36.2% connect-to-conversation hold rate** vs. only **14.0%** on generic cold openers.
  * Prospect instant hang-up rate dropped from **68.4% to 26.1%** across 420 verified recordings.
* **🧠 Why It's Impacting:**
  * Executive buyers receive 40+ vendor solicitations daily. Referencing an existing subject line shifts the prospect's mental frame from telemarketing ambush to administrative follow-up, neutralizing threat detection.

#### 2. Dual-Confirmation Desktop Screen Share Lock (Screen 6 Gate)
* **📊 The Data:**
  * Verified calendar acceptance hold rate reached **88.9% (32 attended out of 36 booked demos)** when reps enforced the Screen 6 zero-prep desktop check, compared to **52.1%** when reps simply emailed a calendar invite post-call.

#### 3. Chris Voss Accusation Audit on Stalled Cadence Dials (Day 15 & Day 24)
* **📊 The Data:**
  * Negative reverse selling yielded **14 high-intent callbacks** and **4 direct meetings** from previously cold accounts.`;

      return NextResponse.json({
        answer: responseMarkdown,
        category: 'call_drivers_analysis',
        timestamp: new Date().toISOString()
      });
    }

    // 3. LEAD-SPECIFIC & CALL RECORD INQUIRIES (e.g. Julian Vance, Apex Global, Specific Call Notes)
    if (
      qLower.includes('julian') ||
      qLower.includes('vance') ||
      qLower.includes('apex global') ||
      qLower.includes('shared lead') ||
      qLower.includes('outsource accelerator') ||
      qLower.includes('rookie tax')
    ) {
      const responseMarkdown = `### 🎯 Targeted Lead Intelligence: Julian Vance (Apex Global BPO)

**Contact Profile:**
* **Name & Role:** Julian Vance, Managing Director & Head of Outbound
* **Company:** Apex Global BPO (250 Seats • Manila & Cebu)
* **Phone:** +1 (415) 890-1284 | **Email:** julian@apexglobalbpo.com
* **Current Lead Status:** **Meeting Booked (Thursday 2:00 PM)**
* **Assigned Rep:** Alex Mercer

---

### 🔍 Exact Objections Raised on Call:
1. **The Bad Data Drain:**  
   Julian expressed frustration that a big share of every purchased list is stale: bounced emails, wrong numbers and contacts who left months ago, so reps burn the shift on dials that never connect.
2. **The Unpredictable Pipeline:**  
   Julian said the pipeline swings month to month, deals stall after the first meeting, follow-up depends on which rep remembers, and he has no clear view of how many deals sit at each stage.
3. **The "Rookie Tax" Resistance:**  
   Julian worried that onboarding outside appointment setters or new SDRs would burn through paid leads while taking weeks to reach quota.

---

### 🛡️ What SDRs Must Do (Playbook Recommendations):
1. **Deploy Screen 2 (Lead Quality & Pipeline Check):**  
   Acknowledge the wasted dials immediately:  
   > *"I hear you Julian—when a chunk of every list bounces or rings a wrong number, your reps burn the day and the pipeline stays thin. That's why our AI builds verified account lists matched to the clients you actually want."*
2. **Pivot to the $6,000 List Leak (Screen 3):**  
   Highlight that $6k/mo in purchased lists is wasted if nobody can tie them to booked meetings, and if reps fumble the few good conversations they do get.
3. **Lock 20-Minute Strategy Demo with Founder Emil (Screen 5):**  
   Do not pitch a long contract. Propose a strict **20-minute diagnostic screen-share** with Founder Emil (17+ yrs BDM).
4. **Enforce Screen 6 Desktop Verification Gate:**  
   Ask: *"Will you have your laptop open Thursday at 2:00 PM? Once you see the invite from emil@appointmentlyy.com, go ahead and hit accept while we're on the line."*  
   *(Enforcing this step maintains our 88.9% calendar show-up rate).*`;

      return NextResponse.json({
        answer: responseMarkdown,
        category: 'lead_intelligence',
        timestamp: new Date().toISOString()
      });
    }

    // 4. OBJECTION BATTLECARDS & ARM METHODOLOGY
    if (
      qLower.includes('objection') ||
      qLower.includes('rebuttal') ||
      qLower.includes('arm') ||
      qLower.includes('price') ||
      qLower.includes('incumbent') ||
      qLower.includes('competitor')
    ) {
      const responseMarkdown = `### 🛡️ System Objection Intelligence & ARM Battlecard Matrix

Here are the highest-converting objection responses actively configured in your system:

| Objection Category | Listen-For Friction | [A] Acknowledge (Empathy) | [R] Respond (Reframe) | [M] Move (Diagnostic CTA) |
| :--- | :--- | :--- | :--- | :--- |
| **Price / Cost** | *"Your price is too high / we already pay for leads"* | *"Completely understand—every dollar counts on an outbound floor."* | *"Lists full of wrong numbers and bad-fit contacts burn $6k/mo before a rep books a single meeting."* | *"Would you be opposed to a 10-minute diagnostic on your connect and meeting rates?"* |
| **Incumbent Vendor** | *"We already have an agency / internal team"* | *"Fair point—you already have an established rhythm with them."* | *"We don't replace your team; we take repetitive cold outreach off their plate."* | *"How about a 10-minute SLA benchmark comparison this Thursday?"* |
| **Brush-off / Send Email** | *"Send me an email / not a good time"* | *"Gladly—I know your inbox gets flooded daily."* | *"Usually when leaders ask for an email, it gets buried with 50 other pitches."* | *"Give me 30 seconds to explain our 72-hour ramp, and if no fit, we hang up?"* |
| **Gatekeeper / Authority** | *"I'm not the decision maker"* | *"Appreciate you pointing me in the right direction."* | *"I want to ensure this only goes to whoever owns the floor's booked revenue."* | *"Who on your executive team manages the outbound sales quota?"* |

> **Floor Recommendation:** Reps must strictly follow the **A.R.M. Sequence** (Acknowledge before Responding). Reps who acknowledge first achieve **+18.6% higher reversal rates**.`;

      return NextResponse.json({
        answer: responseMarkdown,
        category: 'objection_intelligence',
        timestamp: new Date().toISOString()
      });
    }

    // 5. REP PERFORMANCE & LEADERBOARD
    if (
      qLower.includes('rep') ||
      qLower.includes('alex') ||
      qLower.includes('sarah') ||
      qLower.includes('leaderboard') ||
      qLower.includes('quota')
    ) {
      const responseMarkdown = `### 🏆 Floor Rep Leaderboard & Performance Analysis

| SDR Name | Assigned Campaign | Dials Today | Connect Rate | Appointments Booked | ARM Adherence | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Alex Mercer** | Apex Global BPO | **58 dials** | **36.2%** | **3 Bookings** 🎯 | 94.2% | 🟢 Floor Leader |
| **Sarah Jenkins** | SaaS SMB Pipeline | **64 dials** | **34.5%** | **2 Bookings** 🎯 | 91.0% | 🟢 High Performer |
| **Elena Rostova** | Fintech Scaleups | **48 dials** | **29.1%** | **2 Bookings** 🎯 | 86.5% | 🟡 On Target |
| **Marcus Vance** | Enterprise Outbound | **52 dials** | **31.0%** | **1 Booking** 🎯 | 82.0% | 🟡 On Target |
| **David Chen** | Tech Support / BDR | **42 dials** | **22.4%** | **1 Booking** 🎯 | 74.0% | 🟠 Coaching Needed |

**Coaching Insight:** Reps Alex and Sarah are driving 55% of floor bookings by strictly injecting prior email subjects into their first 5 seconds.`;

      return NextResponse.json({
        answer: responseMarkdown,
        category: 'rep_performance',
        timestamp: new Date().toISOString()
      });
    }

    // 6. GENERAL / FALLBACK INTELLIGENT AGENT QUERY
    const fallbackMarkdown = `### 🤖 AI Boris Executive Intelligence

**Query Received:** *"${question}"*

**Floor Summary & Live Telemetry Context:**
* **Active Working Shifts:** 5 Online SDRs across 4 Campaigns.
* **Total Outreach Today:** **284 activities** (168 phone dials, 114 emails, 60 LinkedIn touches).
* **Appointments Booked:** **9 meetings confirmed** today (88.9% attendance hold rate).
* **DNC Quarantined:** **4 accounts** suppressed organization-wide.
* **Carry-over Backlog:** **20 scheduled callbacks** queued for prior-week leads.

**Recommendations:**
1. Focus morning dial blocks on **Day 2 Phone Push** and **Day 9 Shifted Phone Calls** where connect rates peak at 38%.
2. Ensure all reps utilize the **email-injected opener** on Screen 1 to reduce cold-call friction.
3. Review the **Performance & KPIs Dashboard** at \`/analytics\` for granular daily, weekly, monthly, and quarterly reports.`;

    return NextResponse.json({
      answer: fallbackMarkdown,
      category: 'general_inquiry',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[AI ASSISTANT API ERROR]', error);
    return NextResponse.json({ error: 'Copilot hit a problem answering that. Please try again.' }, { status: 500 });
  }
}
