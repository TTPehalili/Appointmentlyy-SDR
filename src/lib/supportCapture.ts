/**
 * Browser-side context for "Report a problem" (installed ONCE, from src/instrumentation-client.ts, before the app
 * becomes interactive, so errors during start-up are seen too).
 *
 * Keeps, in memory only (never stored, never sent until the person files a report):
 *   - the last 20 browser errors (`error`, `unhandledrejection`): message, script file and line, each capped and redacted;
 *   - the last 20 FAILED same-origin /api/ requests: method, path (query parameter names only), status, duration, time.
 *     Network failures are status 0. Aborted requests are not failures and are not kept.
 *
 * The fetch wrapper is transparent: it calls the real fetch with exactly the same `this` and arguments and returns the
 * very same promise, so behaviour, timing, streaming and errors are unchanged. It never reads, clones or records a
 * request or response body or any header; it only looks at the URL, the method and, once the answer arrives, the status.
 *
 * Never captured: form values, notes, email or lead content, cookies, tokens, localStorage, bodies.
 */
import {
  SUPPORT_LIMITS,
  describeUserAgent,
  redactSensitive,
  safePath,
  safeSource,
  type CapturedError,
  type CapturedRequest,
  type SupportContext,
} from '@/lib/supportReport';

interface CaptureState {
  errors: CapturedError[];
  requests: CapturedRequest[];
}

type CaptureWindow = Window & { __appySupportCapture?: CaptureState };

const push = <T,>(list: T[], item: T, max: number) => {
  list.push(item);
  if (list.length > max) list.splice(0, list.length - max);
};

/** Method and safe path of a same-origin /api/ request, or null for anything else (never throws). */
function describeRequest(input: unknown, init: unknown): { method: string; path: string } | null {
  try {
    let url = '';
    let method = '';
    if (typeof input === 'string') url = input;
    else if (input instanceof URL) url = input.href;
    else if (typeof Request !== 'undefined' && input instanceof Request) {
      url = input.url;
      method = input.method;
    } else return null;
    const m = init && typeof init === 'object' ? (init as { method?: unknown }).method : undefined;
    if (typeof m === 'string') method = m;
    const u = new URL(url, window.location.href);
    if (u.origin !== window.location.origin || !u.pathname.startsWith('/api/')) return null;
    return { method: (method || 'GET').toUpperCase().slice(0, 10), path: safePath(u.pathname + u.search) };
  } catch {
    return null;
  }
}

export function installSupportCapture(): void {
  if (typeof window === 'undefined') return;
  const w = window as CaptureWindow;
  if (w.__appySupportCapture) return;
  const state: CaptureState = { errors: [], requests: [] };
  w.__appySupportCapture = state;

  window.addEventListener('error', (e) => {
    try {
      if (!(e instanceof ErrorEvent)) return; // a failed <img>/<script> load, not a script error
      push(
        state.errors,
        {
          at: new Date().toISOString(),
          kind: 'error',
          message: redactSensitive(e.message || (e.error instanceof Error ? e.error.message : '') || 'Unknown error'),
          source: safeSource(e.filename, window.location.origin),
          line: Number(e.lineno) || 0,
          col: Number(e.colno) || 0,
        },
        SUPPORT_LIMITS.ringErrors,
      );
    } catch {
      /* capture must never break the page */
    }
  });

  window.addEventListener('unhandledrejection', (e) => {
    try {
      const r: unknown = e.reason;
      const message = r instanceof Error ? `${r.name}: ${r.message}` : typeof r === 'string' ? r : 'Unhandled promise rejection';
      push(state.errors, { at: new Date().toISOString(), kind: 'rejection', message: redactSensitive(message), source: '', line: 0, col: 0 }, SUPPORT_LIMITS.ringErrors);
    } catch {
      /* ignore */
    }
  });

  const realFetch = window.fetch;
  if (typeof realFetch !== 'function') return;
  const record = (info: { method: string; path: string }, startedAt: number, status: number) => {
    try {
      push(
        state.requests,
        { at: new Date().toISOString(), method: info.method, path: info.path, status, ms: Math.max(0, Math.round(performance.now() - startedAt)) },
        SUPPORT_LIMITS.ringRequests,
      );
    } catch {
      /* ignore */
    }
  };
  const wrapped = function fetch(this: unknown, ...args: Parameters<typeof window.fetch>): Promise<Response> {
    const info = describeRequest(args[0], args[1]);
    const startedAt = info ? performance.now() : 0;
    const p = Reflect.apply(realFetch, this, args) as Promise<Response>;
    if (info && p && typeof p.then === 'function') {
      // Observe only. The caller gets `p` itself, untouched.
      p.then(
        (res) => {
          if (res && !res.ok && res.type !== 'opaqueredirect') record(info, startedAt, res.status);
        },
        (err: unknown) => {
          if ((err as { name?: string } | null)?.name !== 'AbortError') record(info, startedAt, 0);
        },
      );
    }
    return p;
  };
  // Same name and arity as the browser's own (minifiers rename function expressions).
  try {
    Object.defineProperty(wrapped, 'name', { value: 'fetch' });
    Object.defineProperty(wrapped, 'length', { value: realFetch.length });
  } catch {
    /* cosmetic only */
  }
  try {
    window.fetch = wrapped as typeof window.fetch;
  } catch {
    /* a locked-down environment: no request capture */
  }
}

/** The context a report carries, right now. `errorText` is the message next to the link the person clicked. */
export function snapshotSupportContext(opts: { errorText?: string; workspace?: string; role?: string } = {}): SupportContext {
  const w = window as CaptureWindow;
  const st = w.__appySupportCapture ?? { errors: [], requests: [] };
  const ua = navigator.userAgent || '';
  const d = describeUserAgent(ua);
  let timeZone = '';
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    /* ignore */
  }
  const html = document.documentElement;
  return {
    v: 1,
    page: { path: safePath(window.location.pathname + window.location.search), title: redactSensitive(document.title, SUPPORT_LIMITS.title) },
    app: { version: process.env.NEXT_PUBLIC_APP_VERSION || '' },
    time: { at: new Date().toISOString(), timeZone, utcOffsetMinutes: -new Date().getTimezoneOffset() },
    workspace: opts.workspace,
    role: opts.role,
    env: {
      browser: d.browser,
      os: d.os,
      userAgent: ua.slice(0, SUPPORT_LIMITS.userAgent),
      language: navigator.language || '',
      screen: `${window.screen?.width ?? 0} x ${window.screen?.height ?? 0}`,
      viewport: `${window.innerWidth} x ${window.innerHeight}`,
      pixelRatio: Math.round((window.devicePixelRatio || 1) * 100) / 100,
      online: navigator.onLine !== false,
      colorMode: html.classList.contains('dark') || html.dataset.theme === 'dark' ? 'dark' : 'light',
    },
    errors: st.errors.map((e) => ({ ...e })),
    failedRequests: st.requests.map((r) => ({ ...r })),
    ...(opts.errorText ? { errorText: redactSensitive(opts.errorText, SUPPORT_LIMITS.errorText) } : {}),
  };
}
