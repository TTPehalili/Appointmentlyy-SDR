/**
 * Temporary AI provider switch (server-only).
 *
 * With AI_PROVIDER=anthropic and ANTHROPIC_API_KEY set, every server-side Gemini `generateContent`
 * call is answered by Claude instead, with no change to the features that make those calls: the
 * Gemini request is translated to a Claude request and the reply is returned in Gemini's response
 * shape. Remove AI_PROVIDER (or set it to anything else) to go back to Gemini.
 *
 * Installed once at server start from src/instrumentation.ts.
 */
import Anthropic from '@anthropic-ai/sdk';

const GEMINI_GENERATE = /^https:\/\/generativelanguage\.googleapis\.com\/v1(beta)?\/models\/[^/:?]+:generateContent/;
const DEFAULT_MODEL = 'claude-opus-5-5';

type GeminiPart = { text?: string; inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } };
type GeminiContent = { role?: string; parts?: GeminiPart[] };
type GeminiRequest = {
  contents?: GeminiContent[];
  systemInstruction?: { parts?: GeminiPart[] };
  system_instruction?: { parts?: GeminiPart[] };
  generationConfig?: { maxOutputTokens?: number; responseMimeType?: string; responseSchema?: unknown };
  generation_config?: { max_output_tokens?: number; response_mime_type?: string; response_schema?: unknown };
};

type Reply = { status: number; body: string };

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

function toBlocks(parts: GeminiPart[] = []): Anthropic.ContentBlockParam[] | null {
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const p of parts) {
    if (typeof p.text === 'string') {
      if (p.text.trim()) blocks.push({ type: 'text', text: p.text });
      continue;
    }
    const inline = p.inlineData ?? (p.inline_data ? { mimeType: p.inline_data.mime_type, data: p.inline_data.data } : undefined);
    if (inline?.data && inline.mimeType) {
      if (IMAGE_TYPES.has(inline.mimeType)) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: inline.mimeType as 'image/png', data: inline.data } });
      } else if (inline.mimeType === 'application/pdf') {
        blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: inline.data } });
      } else {
        return null; // audio/video etc.: Claude can't take it, so leave this request to Gemini
      }
    }
  }
  return blocks;
}

/** Gemini request -> Claude request. Returns null when the request can't be expressed for Claude. */
function translate(req: GeminiRequest): { system: string; messages: Anthropic.MessageParam[]; maxTokens: number; json: boolean } | null {
  const cfg = req.generationConfig ?? {};
  const cfgSnake = req.generation_config ?? {};
  const json = (cfg.responseMimeType ?? cfgSnake.response_mime_type) === 'application/json';
  const schema = cfg.responseSchema ?? cfgSnake.response_schema;

  const sysParts = (req.systemInstruction ?? req.system_instruction)?.parts ?? [];
  let system = sysParts.map((p) => p.text ?? '').filter(Boolean).join('\n\n');
  if (json) {
    system +=
      (system ? '\n\n' : '') +
      'Respond with only one valid JSON value. No markdown code fences, no text before or after the JSON.' +
      (schema ? `\nThe JSON must match this schema:\n${JSON.stringify(schema)}` : '');
  }

  const messages: Anthropic.MessageParam[] = [];
  for (const c of req.contents ?? []) {
    const blocks = toBlocks(c.parts);
    if (blocks === null) return null;
    if (!blocks.length) continue;
    const role = c.role === 'model' || c.role === 'assistant' ? 'assistant' : 'user';
    const last = messages[messages.length - 1];
    if (last && last.role === role && Array.isArray(last.content)) last.content.push(...blocks);
    else messages.push({ role, content: blocks });
  }
  if (!messages.length) return null;
  // Claude needs the conversation to start with the user and end with the user (no prefill).
  if (messages[0].role !== 'user') messages.unshift({ role: 'user', content: 'Begin.' });
  if (messages[messages.length - 1].role !== 'user') messages.push({ role: 'user', content: 'Continue.' });

  const requested = cfg.maxOutputTokens ?? cfgSnake.max_output_tokens ?? 0;
  // Thinking shares the output budget, so leave room above what the feature asked for.
  const maxTokens = Math.min(Math.max(requested + 2048, 4096), 16000);
  return { system, messages, maxTokens, json };
}

function stripFences(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1] : t;
}

/**
 * Claude's answer in Gemini's shape, or null when Claude can't answer (no credit, outage, a request
 * it can't take): the caller then sends its original request to Gemini as a backup.
 */
async function askClaude(client: Anthropic, bodyText: string): Promise<Reply | null> {
  let req: GeminiRequest;
  try {
    req = JSON.parse(bodyText) as GeminiRequest;
  } catch {
    return null;
  }
  const t = translate(req);
  if (!t) return null;

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const effort = (process.env.ANTHROPIC_EFFORT || 'low') as 'low' | 'medium' | 'high';
  const started = Date.now();
  try {
    const params = {
      model,
      max_tokens: t.maxTokens,
      ...(t.system ? { system: t.system } : {}),
      messages: t.messages,
      output_config: { effort },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
    const msg = await client.beta.messages.create(params);
    if (msg.stop_reason === 'refusal') {
      console.warn(`[ai-bridge] Claude declined (${model}, ${Date.now() - started}ms); using Gemini.`);
      return null;
    }
    let text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    if (t.json) text = stripFences(text);
    console.info(`[ai-bridge] answered by ${msg.model} in ${Date.now() - started}ms`);
    return {
      status: 200,
      body: JSON.stringify({
        candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: msg.stop_reason === 'max_tokens' ? 'MAX_TOKENS' : 'STOP', index: 0 }],
        usageMetadata: { promptTokenCount: msg.usage.input_tokens, candidatesTokenCount: msg.usage.output_tokens },
        modelVersion: msg.model,
      }),
    };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) console.error('[ai-bridge] ANTHROPIC_API_KEY was rejected; using Gemini.');
    else if (err instanceof Anthropic.APIError) console.error(`[ai-bridge] Claude error ${err.status}; using Gemini. ${err.message.slice(0, 160)}`);
    else console.error('[ai-bridge] Claude unreachable; using Gemini.', err instanceof Error ? err.message : err);
    return null;
  }
}

export function installAnthropicBridge(): void {
  if (process.env.AI_PROVIDER !== 'anthropic') return;
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[ai-bridge] AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set; staying on Gemini.');
    return;
  }
  const g = globalThis as typeof globalThis & { __anthropicBridge?: boolean };
  if (g.__anthropicBridge) return;
  g.__anthropicBridge = true;

  const previous = globalThis.fetch;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 60_000, fetch: previous });
  // Several features race 2-3 Gemini models with the same request; share one Claude call between them.
  const inflight = new Map<string, Promise<Reply | null>>();

  const bridged = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (!GEMINI_GENERATE.test(url) || method !== 'POST' || typeof init?.body !== 'string') return previous(input, init);

    const body = init.body;
    let pending = inflight.get(body);
    if (!pending) {
      pending = askClaude(client, body).finally(() => inflight.delete(body));
      inflight.set(body, pending);
    }
    const signal = init.signal;
    const result = signal
      ? await new Promise<Reply | null>((resolve, reject) => {
          if (signal.aborted) return reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
          const onAbort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
          signal.addEventListener('abort', onAbort, { once: true });
          pending!.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
        })
      : await pending;
    // Claude couldn't answer: each caller falls back to its own original Gemini request.
    if (!result) return previous(input, init);
    return new Response(result.body, { status: result.status, headers: { 'Content-Type': 'application/json' } });
  };

  // Keep any markers Next.js put on its patched fetch.
  Object.assign(bridged, previous);
  globalThis.fetch = bridged as typeof fetch;
  console.info(`[ai-bridge] AI calls go to Claude (${process.env.ANTHROPIC_MODEL || DEFAULT_MODEL}).`);
}
