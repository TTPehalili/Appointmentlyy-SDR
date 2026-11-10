// Centralized Disposition Store & State

export type DispositionCategory = 'Positive' | 'Follow-up' | 'Negative' | 'Compliance' | 'Unreached';

export type ActionTrigger =
  | 'mark_booked'
  | 'schedule_callback'
  | 'dnc_quarantine'
  | 'resend_email_120s'
  | 'recycle_cadence'
  | 'none';

export interface CallDisposition {
  id: string;
  code: string;
  name: string;
  campaign: string;
  category: DispositionCategory;
  actionTrigger: ActionTrigger;
  rebuttalScriptPrompt: string;
  requiresNote: boolean;
  isActive: boolean;
  color: string;
  updatedAt: string;
  /**
   * Pipeline stage (PipelineStageConfig.id) a lead moves to when a rep picks this outcome.
   * Unset: a default from the outcome's automation, category and name (getDispositionStageId in
   * dispositionPipeline.ts). 'keep' leaves the lead in its current stage.
   */
  pipelineStageId?: string;
}

export const DISPOSITIONS_STORAGE_KEY = 'appointmentlyy_call_dispositions_v1';
export const DISPOSITIONS_CHANGED_EVENT = 'appointmentlyy_dispositions_changed';

export const INITIAL_DEFAULT_DISPOSITIONS: CallDisposition[] = [
  {
    id: 'disp-1',
    code: 'BOOKED_QUALIFIED',
    name: 'Booked: Qualified Demo',
    campaign: 'All Campaigns (Global)',
    category: 'Positive',
    actionTrigger: 'mark_booked',
    rebuttalScriptPrompt: 'Lock calendar invite, verify attendee cell phone, and state meeting agenda with Boris AI.',
    requiresNote: true,
    isActive: true,
    color: '#10B981',
    updatedAt: '2026-10-23'
  },
  {
    id: 'disp-user-callback',
    code: 'INTERESTED_CALLBACK',
    name: 'Interested - Callback',
    campaign: 'All Campaigns (Global)',
    category: 'Follow-up',
    actionTrigger: 'schedule_callback',
    rebuttalScriptPrompt: 'Confirm direct mobile & calendar slot: "Would tomorrow morning or Thursday at 2 PM work better for your calendar?"',
    requiresNote: true,
    isActive: true,
    color: '#10B981',
    updatedAt: '2026-10-23'
  },
  {
    id: 'disp-2',
    code: 'CALLBACK_REQUESTED',
    name: 'Callback Scheduled (Agreed Time)',
    campaign: 'All Campaigns (Global)',
    category: 'Follow-up',
    actionTrigger: 'schedule_callback',
    rebuttalScriptPrompt: 'Pinpoint exact day & hour: "Would Tuesday at 10 AM or Thursday at 2 PM work better for your calendar?"',
    requiresNote: true,
    isActive: true,
    color: '#F59E0B',
    updatedAt: '2026-10-23'
  },
  {
    id: 'disp-follow-up-cal',
    code: 'FOLLOW_UP_CALENDAR',
    name: 'Follow-up Required / Send Calendar',
    campaign: 'All Campaigns (Global)',
    category: 'Follow-up',
    actionTrigger: 'schedule_callback',
    rebuttalScriptPrompt: 'Confirm email address to dispatch 1-click booking invite link right after call.',
    requiresNote: true,
    isActive: true,
    color: '#F59E0B',
    updatedAt: '2026-10-23'
  },
  {
    id: 'disp-referral',
    code: 'REFERRAL_NEW_DM',
    name: 'Referral / New DM Identified',
    campaign: 'All Campaigns (Global)',
    category: 'Follow-up',
    actionTrigger: 'none',
    rebuttalScriptPrompt: 'Ask for direct extension and email of the decision maker: "Could you tell me who heads outbound operations?"',
    requiresNote: true,
    isActive: true,
    color: '#3B82F6',
    updatedAt: '2026-10-23'
  },
  {
    id: 'disp-3',
    code: 'NI_COMPETITOR',
    name: 'Not Interested: Using Competitor / Agency',
    campaign: 'All Campaigns (Global)',
    category: 'Negative',
    actionTrigger: 'none',
    rebuttalScriptPrompt: 'Pivot to hybrid validation: "Most of our enterprise clients were using existing partners too before testing our copilot."',
    requiresNote: true,
    isActive: true,
    color: '#EF4444',
    updatedAt: '2026-10-23'
  },
  {
    id: 'disp-4',
    code: 'NI_BUDGET_TIMING',
    name: 'Not Interested: No Budget / Next Fiscal Year',
    campaign: 'All Campaigns (Global)',
    category: 'Negative',
    actionTrigger: 'none',
    rebuttalScriptPrompt: 'De-escalate to quarterly proof-of-concept: "Understood on budget cycles. What month do you finalize H1 allocations?"',
    requiresNote: false,
    isActive: true,
    color: '#F43F5E',
    updatedAt: '2026-10-23'
  },
  {
    id: 'disp-5',
    code: 'DNC_TCPA_OPTOUT',
    name: 'DNC: Hostile Opt-Out & Suppress',
    campaign: 'All Campaigns (Global)',
    category: 'Compliance',
    actionTrigger: 'dnc_quarantine',
    rebuttalScriptPrompt: 'Politely acknowledge opt-out: "Apologies for disturbing your morning, I will immediately remove your number from our contact list."',
    requiresNote: true,
    isActive: true,
    color: '#8B5CF6',
    updatedAt: '2026-10-23'
  },
  {
    id: 'disp-6',
    code: 'GATEKEEPER_BLOCK',
    name: 'Gatekeeper Screened / No Transfer',
    campaign: 'All Campaigns (Global)',
    category: 'Unreached',
    actionTrigger: 'recycle_cadence',
    rebuttalScriptPrompt: 'Ask for direct assistant or mobile extension: "Could you tell me who handles their operations agenda?"',
    requiresNote: false,
    isActive: true,
    color: '#64748B',
    updatedAt: '2026-10-23'
  },
  {
    id: 'disp-7',
    code: 'VOICEMAIL_DROPPED',
    name: 'Left Voicemail (Drop Audio Script 1)',
    campaign: 'All Campaigns (Global)',
    category: 'Unreached',
    actionTrigger: 'resend_email_120s',
    rebuttalScriptPrompt: 'Drop crisp 18-second voicemail referencing the morning email sent.',
    requiresNote: false,
    isActive: true,
    color: '#6366F1',
    updatedAt: '2026-10-23'
  },
  {
    id: 'disp-8',
    code: 'WRONG_NUMBER',
    name: 'Wrong Number / Invalid Extension',
    campaign: 'All Campaigns (Global)',
    category: 'Compliance',
    actionTrigger: 'dnc_quarantine',
    rebuttalScriptPrompt: 'Confirm company name: "Did I reach [Company]? Apologies, will update our directory records."',
    requiresNote: false,
    isActive: true,
    color: '#DC2626',
    updatedAt: '2026-10-23'
  }
];

/**
 * Retrieve all dispositions from localStorage with fallback to default set
 */
export function getStoredDispositions(): CallDisposition[] {
  if (typeof window === 'undefined') {
    return INITIAL_DEFAULT_DISPOSITIONS;
  }

  try {
    const raw = localStorage.getItem(DISPOSITIONS_STORAGE_KEY);
    if (!raw) {
      // First run: save defaults
      localStorage.setItem(DISPOSITIONS_STORAGE_KEY, JSON.stringify(INITIAL_DEFAULT_DISPOSITIONS));
      return INITIAL_DEFAULT_DISPOSITIONS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (err) {
    console.error('Failed to parse stored dispositions:', err);
  }

  return INITIAL_DEFAULT_DISPOSITIONS;
}

let snapshotRaw: string | null | undefined;
let snapshotList: CallDisposition[] = INITIAL_DEFAULT_DISPOSITIONS;

/**
 * Read-only, referentially stable view of the stored dispositions for useSyncExternalStore
 * (pair with subscribeToDispositions). Never writes to storage.
 */
export function getDispositionsSnapshot(): CallDisposition[] {
  if (typeof window === 'undefined') return INITIAL_DEFAULT_DISPOSITIONS;
  try {
    const raw = localStorage.getItem(DISPOSITIONS_STORAGE_KEY);
    if (raw === snapshotRaw) return snapshotList;
    snapshotRaw = raw;
    const parsed = raw ? JSON.parse(raw) : null;
    snapshotList = Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_DEFAULT_DISPOSITIONS;
  } catch {
    snapshotList = INITIAL_DEFAULT_DISPOSITIONS;
  }
  return snapshotList;
}

/** Server snapshot for useSyncExternalStore. */
export function getServerDispositionsSnapshot(): CallDisposition[] {
  return INITIAL_DEFAULT_DISPOSITIONS;
}

/**
 * Persist dispositions to localStorage and notify all listeners across the app
 */
export function saveStoredDispositions(dispositions: CallDisposition[]): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(DISPOSITIONS_STORAGE_KEY, JSON.stringify(dispositions));
    // Dispatch custom event for same-window component updates
    window.dispatchEvent(new CustomEvent(DISPOSITIONS_CHANGED_EVENT, { detail: dispositions }));
  } catch (err) {
    console.error('Failed to save dispositions to localStorage:', err);
  }
}

/**
 * Add a new disposition and persist
 */
export function addStoredDisposition(newDisp: CallDisposition): CallDisposition[] {
  const current = getStoredDispositions();
  const next = [newDisp, ...current];
  saveStoredDispositions(next);
  return next;
}

/**
 * Update an existing disposition by ID and persist
 */
export function updateStoredDisposition(updated: CallDisposition): CallDisposition[] {
  const current = getStoredDispositions();
  const next = current.map((d) => (d.id === updated.id ? updated : d));
  saveStoredDispositions(next);
  return next;
}

/**
 * Delete a disposition by ID and persist
 */
export function deleteStoredDisposition(id: string): CallDisposition[] {
  const current = getStoredDispositions();
  const next = current.filter((d) => d.id !== id);
  saveStoredDispositions(next);
  return next;
}

/**
 * Reset all dispositions back to the clean default template and persist
 */
export function resetStoredDispositions(): CallDisposition[] {
  saveStoredDispositions(INITIAL_DEFAULT_DISPOSITIONS);
  return INITIAL_DEFAULT_DISPOSITIONS;
}

/**
 * Subscribe to disposition changes across tabs and within the same page
 */
export function subscribeToDispositions(callback: (dispositions: CallDisposition[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleCustomEvent = (e: Event) => {
    const custom = e as CustomEvent<CallDisposition[]>;
    if (custom.detail) {
      callback(custom.detail);
    } else {
      callback(getStoredDispositions());
    }
  };

  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === DISPOSITIONS_STORAGE_KEY) {
      callback(getStoredDispositions());
    }
  };

  window.addEventListener(DISPOSITIONS_CHANGED_EVENT, handleCustomEvent);
  window.addEventListener('storage', handleStorageEvent);

  return () => {
    window.removeEventListener(DISPOSITIONS_CHANGED_EVENT, handleCustomEvent);
    window.removeEventListener('storage', handleStorageEvent);
  };
}
