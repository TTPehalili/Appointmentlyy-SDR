/**
 * Server only. Reads a model's "JSON only" reply leniently: a direct parse first, then a fenced block anywhere in the
 * text, then the first balanced top-level {...} (the scan respects strings and escapes). Only a plain object is
 * accepted. Every caller still rebuilds the result field by field (validateTriage, validateProposal, validateChunk),
 * so this only decides WHERE the JSON is, never what is allowed in it.
 *
 * replyShape() describes a reply for the logs WITHOUT its content (replies are derived from untrusted customer text).
 */

export type JsonReply = { value: Record<string, unknown>; how: 'direct' | 'fenced' | 'extracted' } | { value: null; why: 'not JSON' | 'not an object' };

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const NOT_PARSED = Symbol('not parsed');
function tryParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return NOT_PARSED;
  }
}

/** End (exclusive) of the balanced {...} that starts at `start`, or -1 when it never closes (e.g. a cut-off reply). */
function balancedEnd(s: string, start: number): number {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  return -1;
}

const MAX_CANDIDATES = 50;

export function parseJsonReply(text: string): JsonReply {
  const t = (text || '').trim();
  const direct = tryParse(t);
  if (direct !== NOT_PARSED) return isPlainObject(direct) ? { value: direct, how: 'direct' } : { value: null, why: 'not an object' };
  for (const m of t.matchAll(/```[a-zA-Z]*[ \t]*\r?\n?([\s\S]*?)```/g)) {
    const v = tryParse(m[1].trim());
    if (isPlainObject(v)) return { value: v, how: 'fenced' };
  }
  // Top-level objects only: a region that never closes ends the scan (anything after it is nested in it), and a
  // balanced region that does not parse is skipped whole, so an inner object is never taken for the reply.
  let from = 0;
  for (let n = 0; n < MAX_CANDIDATES; n++) {
    const start = t.indexOf('{', from);
    if (start < 0) break;
    const end = balancedEnd(t, start);
    if (end < 0) break;
    const v = tryParse(t.slice(start, end));
    if (isPlainObject(v)) return { value: v, how: 'extracted' };
    from = end;
  }
  return { value: null, why: 'not JSON' };
}

/** Content-free description of a reply for the server log: stop reason, length, and how it starts. */
export function replyShape(text: string, stopReason?: string | null): string {
  const t = (text || '').trimStart();
  const first = t[0];
  const starts = !t ? 'empty' : first === '{' ? "'{'" : first === '`' ? "'`'" : first === '[' ? "'['" : 'other';
  return `stop=${stopReason || 'unknown'}, length=${(text || '').length}, starts=${starts}`;
}
