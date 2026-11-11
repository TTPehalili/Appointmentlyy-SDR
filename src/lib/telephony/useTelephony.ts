'use client';

/**
 * Dialer telephony. Two modes:
 *  - 'vicidial': the server has VICIdial configured for this workspace and an admin has linked this
 *    person to a VICIdial agent (Admin › Phone system). The server enforces the link on every call.
 *    Call / Hang up / outcomes drive the rep's logged-in VICIdial agent session.
 *  - 'tel': the original behaviour (tel: link opens the computer's phone app). Used whenever VICIdial
 *    isn't set up, so nothing changes for workspaces without it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getOutcomeCodes } from './settings';

export type AgentState = 'logged_out' | 'ready' | 'paused' | 'in_call' | 'wrap_up' | 'unknown';

export interface TelephonyResult {
  ok: boolean;
  message: string;
}

interface ApiReply {
  ok: boolean;
  configured?: boolean;
  unreachable?: boolean;
  message?: string;
  state?: AgentState;
  /** config only: the VICIdial agent linked to the signed-in person. */
  agentUser?: string | null;
}

async function api(action: string, body: Record<string, unknown> = {}): Promise<ApiReply> {
  try {
    const res = await fetch(`/api/telephony/vicidial/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await res.json()) as ApiReply;
  } catch {
    return { ok: false, unreachable: true, message: 'Could not reach the Appointmentlyy server.' };
  }
}

export interface CallbackDetails {
  dueAt: string;
  note?: string;
  userOnly?: boolean;
}

export function useTelephony() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [agentUser, setAgentUser] = useState('');
  const [agentState, setAgentState] = useState<AgentState>('unknown');
  const [problem, setProblem] = useState<string | null>(null);
  const mode: 'vicidial' | 'tel' = configured && agentUser ? 'vicidial' : 'tel';
  const busy = useRef(false);
  const agentStateRef = useRef<AgentState>('unknown');
  useEffect(() => {
    agentStateRef.current = agentState;
  }, [agentState]);

  useEffect(() => {
    let alive = true;
    api('config').then((r) => {
      if (!alive) return;
      setConfigured(Boolean(r.configured));
      setAgentUser(typeof r.agentUser === 'string' ? r.agentUser : '');
    });
    return () => {
      alive = false;
    };
  }, []);

  const refreshStatus = useCallback(async () => {
    if (mode !== 'vicidial') return;
    const r = await api('status', { agentUser });
    if (r.ok && r.state) {
      setAgentState(r.state);
      setProblem(null);
    } else {
      setAgentState('unknown');
      setProblem(r.message || 'VICIdial status unavailable');
    }
  }, [mode, agentUser]);

  // Poll the agent's state: every 2 s during a call, 6 s otherwise; paused while the tab is hidden.
  useEffect(() => {
    if (mode !== 'vicidial') return;
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const tick = async () => {
      if (!document.hidden) await refreshStatus();
      if (alive) timer = setTimeout(tick, agentStateRef.current === 'in_call' ? 2000 : 6000);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [mode, refreshStatus]);

  const dial = useCallback(
    async (phone: string, leadId?: string): Promise<TelephonyResult> => {
      if (busy.current) return { ok: false, message: 'Already dialing' };
      busy.current = true;
      try {
        const r = await api('dial', { agentUser, phone, leadId });
        if (r.ok) setAgentState('in_call');
        return { ok: r.ok, message: r.message || '' };
      } finally {
        busy.current = false;
      }
    },
    [agentUser]
  );

  const hangup = useCallback(async (): Promise<TelephonyResult> => {
    const r = await api('hangup', { agentUser });
    if (r.ok) setAgentState('wrap_up');
    return { ok: r.ok, message: r.message || '' };
  }, [agentUser]);

  /** Send the outcome to VICIdial (hanging up first if the call is still live). */
  const setOutcome = useCallback(
    async (outcomeName: string, callback?: CallbackDetails): Promise<TelephonyResult> => {
      const status = getOutcomeCodes()[outcomeName];
      if (!status) return { ok: false, message: `No VICIdial status mapped for "${outcomeName}"` };
      if (agentStateRef.current === 'in_call') await api('hangup', { agentUser });
      const r = await api('disposition', { agentUser, status, callback });
      if (r.ok) setAgentState('paused');
      return { ok: r.ok, message: r.message || '' };
    },
    [agentUser]
  );

  return { mode, configured, agentUser, agentState, problem, dial, hangup, setOutcome, refreshStatus };
}
