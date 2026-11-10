import { DEMO_LOGIN } from '@/lib/demoMode';
export interface CadenceActivityRecord {
  id: string;
  timestamp: string; // e.g. "10:45 AM"
  isoDate: string;   // ISO string for filtering
  repName: string;
  prospectName: string;
  companyName: string;
  channel: 'Phone' | 'Email' | 'LinkedIn';
  cadenceDay: number;
  touchNumber: number;
  stepName: string;
  disposition: string;
  notesSnippet: string;
  signalsContext?: string[];
  website?: string;
  linkedinUrl?: string;
}

export interface DailyActivitySummary {
  date: string;
  repName: string;
  totalActivities: number;
  callsMade: number;
  emailsSent: number;
  linkedInTouches: number;
  cadenceStepsCompleted: number;
  appointmentsBooked: number;
  dncFlagged: number;
  notInterested: number;
  callbacksScheduled: number;
  activities: CadenceActivityRecord[];
}

const STORAGE_KEY = 'appointmentlyy_sdr_activity_log_v1';
const BROADCAST_CHANNEL_NAME = 'appointmentlyy_activity_sync';

const DEMO_INITIAL_DEMO_ACTIVITIES: CadenceActivityRecord[] = [
  {
    id: 'act_demo_1',
    timestamp: '10:42 AM',
    isoDate: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    repName: 'Emil Halili',
    prospectName: 'Julian Vance',
    companyName: 'Apex Global BPO',
    channel: 'Phone',
    cadenceDay: 2,
    touchNumber: 3,
    stepName: 'The Phone Push — Phone #1',
    disposition: 'Meeting Booked',
    notesSnippet: 'Addressed rookie tax and margin compression. Booked 20-min strategy session for Thursday 2:00 PM with Founder Emil.',
    signalsContext: ['Hiring 15 Outbound SDRs', 'Pain: 35% broker margin loss'],
    website: 'https://apexglobalbpo.ph',
    linkedinUrl: 'https://linkedin.com/in/julianvance'
  },
  {
    id: 'act_demo_2',
    timestamp: '10:15 AM',
    isoDate: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
    repName: 'Emil Halili',
    prospectName: 'Marcus Brody',
    companyName: 'Nexus Call Solutions',
    channel: 'Email',
    cadenceDay: 7,
    touchNumber: 7,
    stepName: 'Value Add — Email #3',
    disposition: 'Follow-Up Email',
    notesSnippet: 'Sent 90s Loom teardown video on 100% call QA vs 2% Excel sampling. Referenced current HubSpot & Apollo stack.',
    signalsContext: ['Tech: HubSpot + Apollo', 'Evaluating QA automation'],
    website: 'https://nexuscallsolutions.com',
    linkedinUrl: 'https://linkedin.com/in/marcusbrody'
  },
  {
    id: 'act_demo_3',
    timestamp: '09:40 AM',
    isoDate: new Date(Date.now() - 1000 * 60 * 85).toISOString(),
    repName: 'Emil Halili',
    prospectName: 'Sarah Lin',
    companyName: 'ClearDial Telephony',
    channel: 'LinkedIn',
    cadenceDay: 1,
    touchNumber: 2,
    stepName: 'Social Awareness — LinkedIn #1',
    disposition: 'Cadence Touch Completed',
    notesSnippet: 'Sent personalized zero-pitch connection note on LinkedIn referencing their new Cebu center expansion.',
    signalsContext: ['Opening 120-seat facility in Cebu', 'Incumbent: Five9'],
    website: 'https://cleardialbpo.com',
    linkedinUrl: 'https://linkedin.com/in/sarahlin'
  }
];

export function getStoredActivities(): CadenceActivityRecord[] {
  if (typeof window === 'undefined') {
    return INITIAL_DEMO_ACTIVITIES;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DEMO_ACTIVITIES));
      return INITIAL_DEMO_ACTIVITIES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      let changed = false;
      const migrated = parsed.map(a => {
        if (a.repName === 'Alex Mercer') {
          changed = true;
          return { ...a, repName: 'Emil Halili' };
        }
        return a;
      });
      if (changed) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      }
      return migrated;
    }
    return INITIAL_DEMO_ACTIVITIES;
  } catch (err) {
    console.warn('[ActivityStore] Failed to parse stored activities:', err);
    return INITIAL_DEMO_ACTIVITIES;
  }
}

export function saveStoredActivities(activities: CadenceActivityRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activities));
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.postMessage({ type: 'ACTIVITIES_UPDATED', activities });
      channel.close();
    }
  } catch (err) {
    console.warn('[ActivityStore] Failed to save activities:', err);
  }
}

export function logCadenceActivity(
  item: Omit<CadenceActivityRecord, 'id' | 'timestamp' | 'isoDate'> & { id?: string; timestamp?: string }
): CadenceActivityRecord {
  const current = getStoredActivities();
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const record: CadenceActivityRecord = {
    id: item.id || `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: item.timestamp || timeStr,
    isoDate: now.toISOString(),
    repName: item.repName,
    prospectName: item.prospectName,
    companyName: item.companyName,
    channel: item.channel,
    cadenceDay: item.cadenceDay,
    touchNumber: item.touchNumber,
    stepName: item.stepName,
    disposition: item.disposition,
    notesSnippet: item.notesSnippet,
    signalsContext: item.signalsContext || [],
    website: item.website,
    linkedinUrl: item.linkedinUrl
  };

  const updated = [record, ...current];
  saveStoredActivities(updated);
  return record;
}

export const INITIAL_DAILY_SUMMARY: DailyActivitySummary = {
  date: 'Today',
  repName: 'Emil Halili',
  totalActivities: 0,
  callsMade: 0,
  emailsSent: 0,
  linkedInTouches: 0,
  cadenceStepsCompleted: 0,
  appointmentsBooked: 0,
  dncFlagged: 0,
  notInterested: 0,
  callbacksScheduled: 0,
  activities: []
};

export function getDailyActivitySummary(repName?: string): DailyActivitySummary {
  if (typeof window === 'undefined') {
    return INITIAL_DAILY_SUMMARY;
  }
  const all = getStoredActivities();
  const today = new Date().toDateString();

  const todayActivities = all.filter(a => {
    const actDate = new Date(a.isoDate).toDateString();
    const isToday = actDate === today;
    if (!isToday) return false;
    if (repName && repName !== 'All Reps' && a.repName.toLowerCase() !== repName.toLowerCase()) {
      return false;
    }
    return true;
  });

  const callsMade = todayActivities.filter(a => a.channel === 'Phone').length;
  const emailsSent = todayActivities.filter(a => a.channel === 'Email').length;
  const linkedInTouches = todayActivities.filter(a => a.channel === 'LinkedIn').length;
  
  const appointmentsBooked = todayActivities.filter(a => 
    a.disposition.toLowerCase().includes('meeting') || a.disposition.toLowerCase().includes('booked')
  ).length;

  const dncFlagged = todayActivities.filter(a => 
    a.disposition.toLowerCase().includes('dnc') || a.disposition.toLowerCase().includes('quarantine')
  ).length;

  const notInterested = todayActivities.filter(a => 
    a.disposition.toLowerCase().includes('not interested')
  ).length;

  const callbacksScheduled = todayActivities.filter(a => 
    a.disposition.toLowerCase().includes('callback') || a.disposition.toLowerCase().includes('scheduled')
  ).length;

  return {
    date: new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
    repName: repName || 'Emil Halili',
    totalActivities: todayActivities.length,
    callsMade,
    emailsSent,
    linkedInTouches,
    cadenceStepsCompleted: todayActivities.length,
    appointmentsBooked,
    dncFlagged,
    notInterested,
    callbacksScheduled,
    activities: todayActivities
  };
}

export function subscribeToActivities(callback: (activities: CadenceActivityRecord[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        callback(parsed);
      } catch (err) {
        console.warn('[ActivityStore] Storage event parse error:', err);
      }
    }
  };

  window.addEventListener('storage', handleStorage);

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    channel.onmessage = (event) => {
      if (event.data?.type === 'ACTIVITIES_UPDATED' && Array.isArray(event.data.activities)) {
        callback(event.data.activities);
      }
    };
  }

  return () => {
    window.removeEventListener('storage', handleStorage);
    if (channel) channel.close();
  };
}

// Sample data is for demo builds only: real workspaces start empty.
export const INITIAL_DEMO_ACTIVITIES: CadenceActivityRecord[] = DEMO_LOGIN ? DEMO_INITIAL_DEMO_ACTIVITIES : [];
