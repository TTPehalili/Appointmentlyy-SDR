import { isDemoWorkspace } from '@/lib/demoMode';

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
  customRepNotes
}: NoteSynthesizerParams): string {
  const ts = timestamp || 'LIVE CALL IN PROGRESS (Active Session)';

  // The broker / founder-demo talk track below is the platform owner's own pitch: only the demo
  // workspace uses it. Client workspaces get a neutral call log built from the lead's fields.
  if (!isDemoWorkspace()) {
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
    let neutral = `=== CALL LOG ===
PROSPECT: ${contactName || '-'}${companyName ? ` | ${companyName}` : ''}
ROLE: ${title || '-'}${headcount ? ` (${headcount})` : ''}
PHONE: ${phone || '-'}
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
    ? 'Outsource Accelerator / Broker Directories discussed'
    : 'Pending directory confirmation';

  const sharedLeadFrictionSummary = telemetry.sharedLeadConfirmed
    ? '✓ Confirmed: Competing against 3-5 BPOs on identical Outsource Accelerator lists ($8/hr price war)'
    : telemetry.directoryDiscussed
    ? '• Claims lists are exclusive / defended margins'
    : 'Pending lead sourcing confirmation';

  const sharedLeadComment = telemetry.sharedLeadComment || (
    telemetry.sharedLeadConfirmed
      ? 'Confirmed competing against 3-5 BPOs on identical Outsource Accelerator lists'
      : telemetry.directoryDiscussed
      ? 'Claims lists are exclusive'
      : 'No additional broker notes'
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
ROLE: ${title} (${headcount})
PHONE: ${phone}
CADENCE TOUCH: Day ${cadenceDay} (${stepName})
TIMESTAMP: ${ts}

1. ROLE VERIFICATION:
- Status: ${roleStatusText}
- Department / Title: ${department} as ${title}

2. LEAD SOURCING & PRICE TRAP AUDIT:
- Directory Anchor: ${directoryStatusText}
- Shared Lead Friction: ${sharedLeadFrictionSummary}
- Additional Intel: ${sharedLeadComment}

3. DIAGNOSTIC PROFILE:
- Primary Revenue Driver: ${telemetry.primaryService}
- Operational Bottleneck: Competing against 3-5 BPOs on identical lists ($8/hr margin crush)
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
