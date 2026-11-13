import { isDemoWorkspace } from '@/lib/demoMode';
import { companySize } from '@/lib/companySize';

export interface CallTelemetryState {
  roleVerified: boolean;
  roleTitleStatus: string;
  directoryDiscussed: boolean;
  sharedLeadConfirmed: boolean;
  sharedLeadComment: string;
  problemFixDiscussed: boolean;
  primaryService: string;
  painPointIdentified: string;
  screenSharePitched: boolean;
  screenShareSlot: string;
  zeroPrepConfirmed: boolean;
  attendanceVerified: boolean;
  directMobileCaptured: string;
  /**
   * Script-pack beats (demo script packs only): the answer the rep picked per beat (beat id -> answer id),
   * and the matching CRM lines ("<label>: <answer>") in script order for the QUALIFICATION section.
   */
  beatAnswers?: Record<string, string>;
  qualifyNotes?: string[];
  /** Script-pack meeting answer that isn't a booked slot, e.g. "Other time requested (to confirm)". */
  meetingNote?: string;
}

export const INITIAL_TELEMETRY_STATE: CallTelemetryState = {
  roleVerified: false,
  roleTitleStatus: 'Role verification pending',
  directoryDiscussed: false,
  sharedLeadConfirmed: false,
  sharedLeadComment: '',
  problemFixDiscussed: false,
  primaryService: 'Customer Support',
  painPointIdentified: '',
  screenSharePitched: false,
  screenShareSlot: '',
  zeroPrepConfirmed: false,
  attendanceVerified: false,
  directMobileCaptured: ''
};

export interface NoteSynthesizerParams {
  contactName: string;
  companyName: string;
  title: string;
  department: string;
  headcount: string;
  phone: string;
  cadenceDay: number;
  stepName: string;
  timestamp?: string;
  telemetry: CallTelemetryState;
  disposition: string | null;
  customRepNotes?: string;
  /**
   * 'workspace' (default): the demo workspace's own talk track there, the generic call log elsewhere.
   * 'neutral': always the generic call log, with a QUALIFICATION section listing every answered
   * script beat (demo script packs).
   */
  template?: 'workspace' | 'neutral';
}

export function synthesizeCrmNotes({
  contactName,
  companyName,
  title,
  department,
  headcount,
  phone,
  cadenceDay,
  stepName,
  timestamp,
  telemetry,
  disposition,
  customRepNotes,
  template = 'workspace'
}: NoteSynthesizerParams): string {
  const ts = timestamp || 'LIVE CALL IN PROGRESS (Active Session)';
  const forceNeutral = template === 'neutral';

  // The lead-quality / founder-demo talk track below is the platform owner's own pitch: only the demo
  // workspace uses it. Client workspaces get a neutral call log built from the lead's fields.
  if (forceNeutral || !isDemoWorkspace()) {
    const outcome = disposition
      ? disposition.toUpperCase()
      : telemetry.screenShareSlot
      ? 'MEETING BOOKED'
      : 'IN PROGRESS';
    const roleLine = telemetry.roleVerified
      ? (telemetry.roleTitleStatus || 'Verified in role')
      : 'Pending verification';
    const meetingLine = telemetry.screenShareSlot
      ? `Booked: ${telemetry.screenShareSlot}`
      : telemetry.screenSharePitched
      ? 'Meeting proposed'
      : 'Not booked yet';
    if (forceNeutral) {
      // Script packs (demo workspace): every beat the rep recorded an answer for, in script order.
      const qualifyLines = telemetry.qualifyNotes && telemetry.qualifyNotes.length > 0
        ? telemetry.qualifyNotes.map((n) => `- ${n}`)
        : ['- No answers recorded yet'];
      const packMeetingLine = telemetry.screenShareSlot
        ? `Booked: ${telemetry.screenShareSlot}`
        : telemetry.meetingNote || (telemetry.screenSharePitched ? 'Meeting proposed' : 'Not booked yet');
      let generic = `=== CALL LOG ===
PROSPECT: ${contactName || '-'}${companyName ? ` | ${companyName}` : ''}
ROLE: ${title || '-'}
${companySize(headcount) ? `COMPANY SIZE: ${companySize(headcount)!.exact}
` : ''}PHONE: ${phone || '-'}
CADENCE TOUCH: Day ${cadenceDay} (${stepName})
TIMESTAMP: ${ts}

1. QUALIFICATION:
${qualifyLines.join('\n')}

2. MEETING:
- Status: ${packMeetingLine}
- Direct mobile: ${telemetry.directMobileCaptured || phone || 'Not provided'}

OUTCOME / DISPOSITION: ${outcome}`;
      if (customRepNotes && customRepNotes.trim()) {
        generic += `\n\nREP NOTES:\n${customRepNotes.trim()}`;
      }
      return generic;
    }
    let neutral = `=== CALL LOG ===
PROSPECT: ${contactName || '-'}${companyName ? ` | ${companyName}` : ''}
ROLE: ${title || '-'}
${companySize(headcount) ? `COMPANY SIZE: ${companySize(headcount)!.exact}
` : ''}PHONE: ${phone || '-'}
CADENCE TOUCH: Day ${cadenceDay} (${stepName})
TIMESTAMP: ${ts}

1. ROLE VERIFICATION:
- Status: ${roleLine}

2. MEETING:
- Status: ${meetingLine}
- Direct mobile: ${telemetry.directMobileCaptured || phone || 'Not provided'}

OUTCOME / DISPOSITION: ${outcome}`;
    if (customRepNotes && customRepNotes.trim()) {
      neutral += `\n\nREP NOTES:\n${customRepNotes.trim()}`;
    }
    return neutral;
  }

  const roleStatusText = telemetry.roleVerified
    ? (telemetry.roleTitleStatus || '✓ Verified active in role')
    : (telemetry.roleTitleStatus || 'Pending verification');

  const directoryStatusText = telemetry.directoryDiscussed
    ? 'Lead data quality discussed'
    : 'Pending lead quality check';

  const sharedLeadFrictionSummary = telemetry.sharedLeadConfirmed
    ? '✓ Confirmed: Thin, unpredictable pipeline (reps burn dials on stale or bad-fit leads)'
    : telemetry.directoryDiscussed
    ? '• Says pipeline is healthy / data is clean'
    : 'Pending pipeline health check';

  const sharedLeadComment = telemetry.sharedLeadComment || (
    telemetry.sharedLeadConfirmed
      ? 'Confirmed bounced emails, wrong numbers and deals stalling between stages'
      : telemetry.directoryDiscussed
      ? 'Says contact data is accurate'
      : 'No additional lead quality notes'
  );

  const problemFixStatusText = telemetry.problemFixDiscussed
    ? 'Pitched Claude AI Private Lists + AI Voice Sparring Dojo (Zero lead burn warm-ups)'
    : 'Pending solution discussion';

  const screenShareStatusText = telemetry.screenSharePitched && telemetry.screenShareSlot
    ? `📅 Locked: ${telemetry.screenShareSlot} (20-min Founder Screen Share with Emil)`
    : telemetry.screenSharePitched
    ? 'Pitched 20-min screen share with Founder Emil'
    : 'Pending demo booking';

  const attendanceStatusText = telemetry.attendanceVerified
    ? 'Laptop / Desktop screen share confirmed (Zero prep needed guaranteed)'
    : 'Unspecified attendance mode';

  const directMobileCaptured = telemetry.directMobileCaptured
    ? `${telemetry.directMobileCaptured} (Queued for 10-minute SMS heads-up)`
    : phone || 'Not provided';

  const callDispositionUppercase = disposition
    ? disposition.toUpperCase()
    : telemetry.screenShareSlot
    ? 'MEETING BOOKED'
    : 'IN PROGRESS';

  let log = `=== APPOINTMENTLYY SDR CALL LOG ===
PROSPECT: ${contactName} | ${companyName}
ROLE: ${title || '-'}
${companySize(headcount) ? `COMPANY SIZE: ${companySize(headcount)!.exact}
` : ''}PHONE: ${phone}
CADENCE TOUCH: Day ${cadenceDay} (${stepName})
TIMESTAMP: ${ts}

1. ROLE VERIFICATION:
- Status: ${roleStatusText}
- Department / Title: ${department} as ${title}

2. LEAD QUALITY & PIPELINE HEALTH:
- Data Quality: ${directoryStatusText}
- Pipeline Health: ${sharedLeadFrictionSummary}
- Additional Intel: ${sharedLeadComment}

3. DIAGNOSTIC PROFILE:
- Primary Revenue Driver: ${telemetry.primaryService}
- Operational Bottleneck: Stale contact data and a thin, hard-to-forecast pipeline
- Practice Swings & Ramp: ${problemFixStatusText}

4. DEMO / MEETING OUTCOME:
- Screen Share with Emil: ${screenShareStatusText}
- Attendance Verification: ${attendanceStatusText}
- Direct Heads-Up Mobile: ${directMobileCaptured}
- Calendar Dispatch: Calendar invite dispatched via emil@appointmentlyy.com

OUTCOME / DISPOSITION: ${callDispositionUppercase}`;

  if (customRepNotes && customRepNotes.trim()) {
    log += `\n\nREP NOTES:\n${customRepNotes.trim()}`;
  }

  return log;
}
