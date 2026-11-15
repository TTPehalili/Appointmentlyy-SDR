/**
 * Company-size bands (LinkedIn's), and the Lead Finder "Company size" label that covers a set of
 * them. A label is either one band ("51-200 employees"), a range spanning several bands
 * ("51-500 employees" = 51-200 + 201-500) or an open range ("501+ employees", "1,000+ employees").
 * Client-safe: used by the Lead Finder UI, the AI filter builder and both data providers.
 */

export interface CompanySizeBand {
  /** Provider-neutral key, e.g. "51-200" or "10001+". */
  key: string;
  lo: number;
  hi: number;
}

export const COMPANY_SIZE_BANDS: readonly CompanySizeBand[] = [
  { key: '1-10', lo: 1, hi: 10 },
  { key: '11-50', lo: 11, hi: 50 },
  { key: '51-200', lo: 51, hi: 200 },
  { key: '201-500', lo: 201, hi: 500 },
  { key: '501-1000', lo: 501, hi: 1000 },
  { key: '1001-5000', lo: 1001, hi: 5000 },
  { key: '5001-10000', lo: 5001, hi: 10000 },
  { key: '10001+', lo: 10001, hi: Infinity },
];

const fmt = (n: number) => n.toLocaleString('en-US');

/**
 * The bands a size label covers, in order. Accepts band keys, the UI labels, "N to M", "N-M",
 * "N+" (with or without "employees" and thousands separators). A range covers every band it
 * overlaps by more than its edge, so "50-250" is 51-200 + 201-500 (not 11-50). Unknown -> [].
 */
export function companySizeBandKeys(label?: string): string[] {
  const clean = (label || '')
    .toLowerCase()
    .replace(/employees?|seats?|people|staff|headcount/g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return [];
  const exact = COMPANY_SIZE_BANDS.find((b) => b.key === clean.replace(/\s/g, ''));
  if (exact) return [exact.key];

  const open = clean.match(/^(\d+)\s*\+$/);
  if (open) {
    const n = Number(open[1]);
    return COMPANY_SIZE_BANDS.filter((b) => b.hi > n || b.lo >= n).map((b) => b.key);
  }
  const range = clean.match(/^(\d+)\s*(?:-|–|—|to)\s*(\d+)$/);
  if (range) {
    const lo = Math.min(Number(range[1]), Number(range[2]));
    const hi = Math.max(Number(range[1]), Number(range[2]));
    return COMPANY_SIZE_BANDS.filter((b) => {
      const overlap = Math.min(hi, b.hi) - Math.max(lo, b.lo);
      return overlap > 0 || (overlap === 0 && lo === hi);
    }).map((b) => b.key);
  }
  return [];
}

/** The label for a set of bands ('' when none). Bands that are not contiguous get their hull. */
export function companySizeLabel(keys: string[]): string {
  const bands = COMPANY_SIZE_BANDS.filter((b) => keys.includes(b.key));
  if (!bands.length) return '';
  const lo = bands[0].lo;
  const hi = bands[bands.length - 1].hi;
  if (hi === Infinity) return lo === 1001 ? '1,000+ employees' : `${fmt(lo)}+ employees`;
  return `${fmt(lo)}-${fmt(hi)} employees`;
}
