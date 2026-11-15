/**
 * CSV cells for every export (browser and server). Plain module with no imports.
 *
 * Formula injection: a spreadsheet treats a cell starting with = + - @ (or a tab or carriage
 * return, which some apps strip before those) as a formula, so lead data such as a name of
 * `=HYPERLINK("https://evil.example","Click")` could run when an admin opens the export. Such text
 * cells get a leading apostrophe, which spreadsheets show as plain text. Numbers stay numbers.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

/** The text to write for one cell, before CSV quoting. */
export function neutralizeCsvFormula(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  const text = String(value);
  return FORMULA_START.test(text) ? `'${text}` : text;
}

/** One CSV cell: formula-safe, always quoted, inner quotes doubled (RFC 4180). */
export function csvCell(value: unknown): string {
  return `"${neutralizeCsvFormula(value).replace(/"/g, '""')}"`;
}
