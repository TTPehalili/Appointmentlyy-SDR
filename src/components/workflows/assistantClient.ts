'use client';

import type { AssistantResponse } from '@/lib/workflowAssistant';

const CLIENT_TIMEOUT_MS = 35000;

/**
 * POST to the workflow assistant. Always resolves (never throws, never hangs): network errors,
 * timeouts and bad responses come back as a friendly, retryable error.
 */
export async function callWorkflowAssistant(body: Record<string, unknown>): Promise<AssistantResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
  let timezone = 'UTC';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    /* keep UTC */
  }
  try {
    const res = await fetch('/api/ai/workflow-assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, timezone }),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => null)) as AssistantResponse | null;
    if (data && typeof data.ok === 'boolean') return data;
    if (res.status === 401) return { ok: false, error: 'Your session ended. Please sign in again.', retryable: false };
    if (res.status === 403) return { ok: false, error: 'Only workspace admins can use the workflow assistant.', retryable: false };
    return { ok: false, error: 'Something went wrong. Please try again.', retryable: true };
  } catch {
    return {
      ok: false,
      error: ctrl.signal.aborted ? 'The assistant took too long to answer. Please try again.' : 'Couldn’t reach the server. Check your connection and try again.',
      retryable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Enter sends, Shift+Enter adds a line (and IME composition is left alone). */
export function isSendKey(e: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
  return e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing;
}
