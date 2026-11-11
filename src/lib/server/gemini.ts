/**
 * Gemini calls for the Copilot (platform GOOGLE_API_KEY). Several models race in parallel and the first
 * non-empty answer wins, which keeps latency low; every call has a hard timeout and resolves to null on
 * any failure so callers can fall back to deterministic answers.
 *
 * `groundedGemini` adds Google Search grounding (used by Meeting Action Plans research). Grounding on
 * Gemini 3+ models is a PAID-tier feature (5,000 search queries/month free across Gemini 3+, then billed
 * per search query; free-tier keys get an error), so it runs models one at a time, never in parallel.
 */
import https from 'https';
import type { ResearchSource } from '@/lib/meetingPlan';

export interface GeminiOptions {
  /** Ask for a JSON response (responseMimeType application/json). Ignored when googleSearch is on. */
  json?: boolean;
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
  /** Sent as the request's systemInstruction. */
  systemInstruction?: string;
  /**
   * Enable Google Search grounding (tools: [{ google_search: {} }]). Many models reject a JSON mime type
   * together with tools, so `json` is not sent with it: ask for JSON in the prompt and use parseJsonObject.
   */
  googleSearch?: boolean;
}

export const COPILOT_MODELS = ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];

/** Models tried (in order) for grounded calls; the docs list these as supporting the google_search tool. */
export const GROUNDED_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    groundingMetadata?: {
      groundingChunks?: { web?: { uri?: string; title?: string } }[];
      webSearchQueries?: string[];
    };
  }[];
}

type GeminiResult = { ok: true; data: GeminiResponse } | { ok: false; status: number; body: string };

function requestGemini(model: string, apiKey: string, prompt: string, opts: GeminiOptions = {}): Promise<GeminiResult> {
  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify({
        ...(opts.systemInstruction ? { systemInstruction: { parts: [{ text: opts.systemInstruction }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        ...(opts.googleSearch ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: {
          temperature: opts.temperature ?? 0.35,
          maxOutputTokens: opts.maxTokens ?? 4096,
          ...(opts.json && !opts.googleSearch ? { responseMimeType: 'application/json' } : {}),
        },
      });

      const req = https.request(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'x-goog-api-key': apiKey,
          },
          family: 4,
          timeout: opts.timeoutMs ?? 18000,
        },
        (res) => {
          let rawData = '';
          res.on('data', (chunk) => {
            rawData += chunk;
          });
          res.on('end', () => {
            try {
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                resolve({ ok: true, data: JSON.parse(rawData) as GeminiResponse });
              } else {
                console.warn(`[Gemini ${model}] Status:`, res.statusCode, rawData.substring(0, 120));
                resolve({ ok: false, status: res.statusCode || 0, body: rawData.substring(0, 2000) });
              }
            } catch {
              resolve({ ok: false, status: 0, body: 'parse' });
            }
          });
        },
      );
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, status: 0, body: 'timeout' });
      });
      req.on('error', (err) => {
        console.warn(`[Gemini ${model}] Request error:`, err.message);
        resolve({ ok: false, status: 0, body: 'network' });
      });
      req.write(payload);
      req.end();
    } catch {
      resolve({ ok: false, status: 0, body: 'exception' });
    }
  });
}

/** Answer text without thought-summary parts. */
function responseText(data: GeminiResponse): string {
  return (data.candidates?.[0]?.content?.parts || [])
    .filter((p) => !p.thought)
    .map((p) => p.text || '')
    .join('');
}

export function callGemini(model: string, apiKey: string, prompt: string, opts: GeminiOptions = {}): Promise<string | null> {
  return requestGemini(model, apiKey, prompt, opts).then((r) => (r.ok ? responseText(r.data) || null : null));
}

/**
 * Race the Copilot models; the first answer that `accept` approves wins. Resolves null when every model
 * fails, times out or is rejected. Also capped overall at the timeout, so nothing ever hangs.
 */
export function raceGemini(
  apiKey: string | undefined,
  prompt: string,
  opts: GeminiOptions & { accept?: (text: string) => boolean } = {},
): Promise<{ model: string; text: string } | null> {
  if (!apiKey) return Promise.resolve(null);
  const timeoutMs = opts.timeoutMs ?? 18000;
  return new Promise((resolve) => {
    let pending = COPILOT_MODELS.length;
    let done = false;
    const finish = (v: { model: string; text: string } | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs + 500);
    COPILOT_MODELS.forEach((model) => {
      callGemini(model, apiKey, prompt, { ...opts, timeoutMs }).then((text) => {
        const t = text?.trim();
        if (t && (!opts.accept || opts.accept(t))) finish({ model, text: t });
        else if (--pending === 0) finish(null);
      });
    });
  });
}

/** When the key can't use grounding at all (free tier, billing off), skip grounded calls for a while. */
let groundingBlockedUntil = 0;
const GROUNDING_BLOCK_MS = 10 * 60 * 1000;

/**
 * Errors that mean "this key can't use Search grounding" (bad key, or a 400 saying the tool isn't
 * available). A 429 is NOT enough on its own: Google sends the same generic "exceeded your current quota"
 * body for a free-tier key without grounding and for a busy model (verified 2026-11), so groundedGemini
 * only blocks after every grounded model answered 429.
 */
function isGroundingUnavailable(status: number, body: string): boolean {
  if (status === 401 || status === 403) return true;
  if (status !== 400) return false;
  const b = body.toLowerCase();
  return /(google_?search|grounding|search tool|free[_ -]?tier|billing)/.test(b) && /(not (available|supported|enabled)|unsupported|limit: ?0|requires|enable billing)/.test(b);
}

function hostOf(uri: string): string {
  try {
    return new URL(uri).hostname;
  } catch {
    return uri;
  }
}

/** Grounding sources: web chunks, deduped by URI and by the domain title Google gives. */
function groundingSources(data: GeminiResponse): ResearchSource[] {
  const out: ResearchSource[] = [];
  const seenUri = new Set<string>();
  const seenTitle = new Set<string>();
  for (const chunk of data.candidates?.[0]?.groundingMetadata?.groundingChunks || []) {
    const uri = (chunk.web?.uri || '').trim();
    if (!/^https?:\/\//i.test(uri)) continue;
    // Google usually returns a vertexaisearch redirect link; its `title` is the source domain ("acme.com").
    const title = (chunk.web?.title || '').trim() || hostOf(uri);
    const tKey = title.toLowerCase();
    if (seenUri.has(uri) || seenTitle.has(tKey)) continue;
    seenUri.add(uri);
    seenTitle.add(tKey);
    out.push({ title: title.slice(0, 200), url: uri });
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * One Gemini call with Google Search grounding. Tries GROUNDED_MODELS one after another (never in
 * parallel: each grounded call can be billed per search query) within a total budget (default and max 25s).
 * Resolves null on failure, including keys without grounding access (then skipped for 10 minutes).
 */
export async function groundedGemini(
  apiKey: string | undefined,
  prompt: string,
  opts: GeminiOptions & { accept?: (text: string) => boolean } = {},
): Promise<{ model: string; text: string; sources: ResearchSource[]; searchQueries: string[] } | null> {
  if (!apiKey || Date.now() < groundingBlockedUntil) return null;
  const deadline = Date.now() + Math.min(opts.timeoutMs ?? 25000, 25000);
  let quota429 = 0;
  for (const model of GROUNDED_MODELS) {
    const remaining = deadline - Date.now();
    if (remaining < 4000) break;
    const r = await requestGemini(model, apiKey, prompt, { ...opts, googleSearch: true, timeoutMs: Math.min(remaining, 20000) });
    if (!r.ok) {
      if (isGroundingUnavailable(r.status, r.body)) {
        groundingBlockedUntil = Date.now() + GROUNDING_BLOCK_MS;
        return null;
      }
      if (r.status === 429 && ++quota429 === GROUNDED_MODELS.length) {
        // Every grounded model is out of quota (or the key is free tier, where Gemini 3 grounding isn't offered).
        groundingBlockedUntil = Date.now() + GROUNDING_BLOCK_MS;
      }
      continue;
    }
    const text = responseText(r.data).trim();
    if (!text || (opts.accept && !opts.accept(text))) continue;
    const meta = r.data.candidates?.[0]?.groundingMetadata;
    return {
      model,
      text,
      sources: groundingSources(r.data),
      searchQueries: (meta?.webSearchQueries || []).filter((q) => typeof q === 'string').slice(0, 10),
    };
  }
  return null;
}

/** Parse a JSON object from a model reply (tolerates ```json fences and surrounding text). */
export function parseJsonObject<T = Record<string, unknown>>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const tryParse = (s: string) => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(cleaned);
  if (direct) return direct;
  const a = cleaned.indexOf('{');
  const b = cleaned.lastIndexOf('}');
  return a >= 0 && b > a ? tryParse(cleaned.slice(a, b + 1)) : null;
}
