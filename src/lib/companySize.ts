/**
 * Readable company size. Lead data stores headcount as free text; leads pulled from Lead Finder
 * before 2026-11-12 hold the raw provider value, e.g. "184,452 (10001+)" (employee count + size
 * code). This turns it into { short: "184K employees", exact: "184,452 employees" }. Values that
 * already carry a unit ("65 seats", "51-200 employees") are kept as they are.
 */
const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 3 });

const shortCount = (digits: string) => {
  const n = Number(digits.replace(/,/g, ''));
  return Number.isFinite(n) ? compactNumber.format(n) : digits;
};

export function companySize(raw: string | undefined | null): { short: string; exact: string } | null {
  const v = (raw || '').trim();
  if (!v) return null;
  const count = v.match(/^([\d,]+)(?:\s*\([^)]*\)|\s+employees)?$/i);
  if (count) {
    const n = Number(count[1].replace(/,/g, ''));
    const exact = Number.isFinite(n) ? n.toLocaleString('en-US') : count[1];
    return { short: `${shortCount(count[1])} employees`, exact: `${exact} employees` };
  }
  if (/^[\d,+\-\s]+(employees)?$/i.test(v)) {
    const range = v.replace(/\s*employees$/i, '');
    return {
      short: `${range.replace(/[\d,]{4,}/g, shortCount)} employees`,
      exact: `${range.replace(/\d{4,}/g, (d) => Number(d).toLocaleString('en-US'))} employees`,
    };
  }
  return { short: v, exact: v };
}
