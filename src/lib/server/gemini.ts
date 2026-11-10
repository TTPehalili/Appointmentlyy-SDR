/**
 * Gemini calls for the Copilot (platform GOOGLE_API_KEY). Several models race in parallel and the first
 * non-empty answer wins, which keeps latency low; every call has a hard timeout and resolves to null on
 * any failure so callers can fall back to deterministic answers.
 */
import https from 'https';

export interface GeminiOptions {
  /** Ask for a JSON response (responseMimeType application/json). */
  json?: boolean;
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
}

export const COPILOT_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.6-flash'];

export function callGemini(model: string, apiKey: string, prompt: string, opts: GeminiOptions = {}): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: opts.temperature ?? 0.35,
          maxOutputTokens: opts.maxTokens ?? 4096,
          ...(opts.json ? { responseMimeType: 'application/json' } : {}),
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
                const parsed = JSON.parse(rawData);
                const text = (parsed.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('');
                resolve(text || null);
              } else {
                console.warn(`[Gemini ${model}] Status:`, res.statusCode, rawData.substring(0, 120));
                resolve(null);
              }
            } catch {
              resolve(null);
            }
          });
        },
      );
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.on('error', (err) => {
        console.warn(`[Gemini ${model}] Request error:`, err.message);
        resolve(null);
      });
      req.write(payload);
      req.end();
    } catch {
      resolve(null);
    }
  });
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
