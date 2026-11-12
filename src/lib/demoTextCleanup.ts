/**
 * Outsource Accelerator was taken out of the demo content (2026-11-12). Browsers that loaded the old
 * sample text still hold it in localStorage; these helpers rewrite it once per store. A stored
 * record whose field still has old sample text gets the current sample text for that field. Other
 * stale text is only rewritten in the demo workspace (in client workspaces it's their own content).
 * Real call history and notes are kept.
 */

export const DEMO_STALE_TEXT = /outsource ?accelerator|\$8\/hr|chopped on price|margin crush/i;

export function scrubDemoText(s: string): string {
  return s
    .replace(/Outsource Accelerator BPO & Virtual Assistant Leaders/g, 'BPO & VA Agency Leaders')
    .replace(/Outsource Accelerator & BPO Directory/g, 'B2B lead list')
    .replace(/\s*\(\$8\/hr[^)]*\)/g, '')
    .replace(/outsourceaccelerator\.com,\s*/gi, '')
    .replace(/,?\s*outsourceaccelerator\.com/gi, '')
    .replace(/Outsource Accelerator (shared |lead )?lists/gi, 'shared lead lists')
    .replace(/Outsource Accelerator/gi, 'a lead directory');
}

/** `seedOnly`: replace stale strings only where the current sample has a clean value. */
export function scrubDemoValue(v: unknown, seed: unknown, seedOnly = false): unknown {
  if (typeof v === 'string') {
    if (!DEMO_STALE_TEXT.test(v)) return v;
    if (typeof seed === 'string' && !DEMO_STALE_TEXT.test(seed)) return seed;
    return seedOnly ? v : scrubDemoText(v);
  }
  if (Array.isArray(v)) {
    const seedArr = Array.isArray(seed) ? seed : [];
    return v.map((item, i) => {
      // Align by id when items have one (activity lists grow); by position only when nothing moved.
      const id = item && typeof item === 'object' ? (item as { id?: unknown }).id : undefined;
      const match =
        id !== undefined
          ? seedArr.find((x) => x && typeof x === 'object' && (x as { id?: unknown }).id === id)
          : seedArr.length === v.length
            ? seedArr[i]
            : undefined;
      return scrubDemoValue(item, match, seedOnly);
    });
  }
  if (v && typeof v === 'object') {
    const seedObj = seed && typeof seed === 'object' ? (seed as Record<string, unknown>) : {};
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = scrubDemoValue(x, seedObj[k], seedOnly);
    return out;
  }
  return v;
}

/**
 * One pass per storage key. Returns the same array when nothing needed cleaning (or it was already
 * done). Records of Outsource Accelerator's own staff are dropped.
 */
export function cleanStoredDemoText<T extends { id: string; email?: string }>(
  storageKey: string,
  stored: T[],
  seeds: T[],
  seedOnly = false,
): T[] {
  if (typeof window === 'undefined') return stored;
  const doneKey = `appy_demo_oa_cleanup_v1:${storageKey}`;
  try {
    if (localStorage.getItem(doneKey) === '1') return stored;
    const seedById = new Map(seeds.map((x) => [x.id, x]));
    const kept = seedOnly ? stored : stored.filter((x) => !/@outsourceaccelerator\.com$/i.test(String(x.email || '')));
    const changed = kept.length !== stored.length || kept.some((x) => DEMO_STALE_TEXT.test(JSON.stringify(x)));
    localStorage.setItem(doneKey, '1');
    if (!changed) return stored;
    const cleaned = kept.map((x) => scrubDemoValue(x, seedById.get(x.id), seedOnly) as T);
    if (JSON.stringify(cleaned) === JSON.stringify(stored)) return stored;
    localStorage.setItem(storageKey, JSON.stringify(cleaned));
    return cleaned;
  } catch {
    return stored;
  }
}

/** Demo workspace only: playbook text the Frameworks page synthesized into this browser. */
export function cleanDemoPlaybookKeys(): void {
  if (typeof window === 'undefined') return;
  const doneKey = 'appy_demo_oa_cleanup_v1:playbook';
  try {
    if (localStorage.getItem(doneKey) === '1') return;
    for (const key of ['tenant_phone_scripts', 'tenant_cadence_touches', 'tenant_arm_rebuttals', 'tenant_playbook_name', 'tenant_value_prop']) {
      const raw = localStorage.getItem(key);
      if (!raw || !DEMO_STALE_TEXT.test(raw)) continue;
      let next: string;
      try {
        next = JSON.stringify(scrubDemoValue(JSON.parse(raw), undefined));
      } catch {
        next = scrubDemoText(raw);
      }
      localStorage.setItem(key, next);
    }
    localStorage.setItem(doneKey, '1');
  } catch {
    // storage unavailable: try again next load
  }
}
