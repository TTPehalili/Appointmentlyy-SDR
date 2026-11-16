/**
 * Billing statement payment options (client-safe; used by the PDF template, the owner UI and the server).
 *
 * Up to three ways to pay, each optional and shown only when filled, in this order in "How to pay":
 *   1. Wise payment link (`paymentLink`, the "Pay now" button);
 *   2. bank transfer details (structured: bank, account name, account number, SWIFT/BIC, branch, currency);
 *   3. PayPal link (`paypalLink`, paypal.me / paypal.com only) with an optional fee note;
 * then the payment QR (any provider) and the free-text note (`paymentInstructions`).
 *
 * Every key below is both an Agreements setting (the default) and a template field (the per-statement
 * value), stored as plain strings inside the existing jsonb columns. Bank details are sensitive: never
 * log them; they are shown only in owner views, the statement PDF and the signer page of statements.
 */

export const BANK_KEYS = ['bankName', 'bankAccountName', 'bankAccountNumber', 'bankSwift', 'bankBranch', 'bankCurrency'] as const;
export type BankKey = (typeof BANK_KEYS)[number];

/** Settings keys copied into a new billing statement when its template has a field of the same key. */
export const PAYMENT_DEFAULT_KEYS = [
  'paymentLink',
  ...BANK_KEYS,
  'paypalLink',
  'paypalFeeNote',
  'paymentQr',
  'paymentInstructions',
] as const;
export type PaymentDefaultKey = (typeof PAYMENT_DEFAULT_KEYS)[number];

export const PAYMENT_LIMITS = {
  bankName: 120,
  bankAccountName: 120,
  bankAccountNumber: 40,
  bankSwift: 11,
  bankBranch: 200,
  bankCurrency: 3,
  paypalLink: 500,
  paypalFeeNote: 160,
} as const;

export const BANK_LABELS: Record<BankKey, string> = {
  bankName: 'Bank',
  bankAccountName: 'Account name',
  bankAccountNumber: 'Account number',
  bankSwift: 'SWIFT/BIC',
  bankBranch: 'Branch / address',
  bankCurrency: 'Currency',
};

export const PAYPAL_HOSTS = ['paypal.me', 'www.paypal.me', 'paypal.com', 'www.paypal.com'] as const;

/** One line, no control characters, trimmed and length-limited. */
export function oneLine(raw: unknown, max: number): string {
  return String(raw ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** The PayPal link exactly as set, if it is https:// on paypal.me / paypal.com (or www.); otherwise null. */
export function safePaypalLink(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v || v.length > PAYMENT_LIMITS.paypalLink || /[\s<>"'`\\]/.test(v) || !/^https:\/\//i.test(v)) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  return (PAYPAL_HOSTS as readonly string[]).includes(u.hostname.toLowerCase()) ? v : null;
}

/** The PayPal link's domain for display beside the field (any https host, so a lookalike is visible). */
export function linkDomain(raw: string): string | null {
  const s = (raw ?? '').trim();
  if (!s || /[\s<>"'`]/.test(s)) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && u.hostname.includes('.') && !u.username && !u.password ? u.hostname : null;
  } catch {
    return null;
  }
}

/** Normalised bank fields (one line each; SWIFT and currency upper-case, currency defaults to USD). */
export function cleanBank(v: Record<string, unknown>): Record<BankKey, string> {
  return {
    bankName: oneLine(v.bankName, PAYMENT_LIMITS.bankName),
    bankAccountName: oneLine(v.bankAccountName, PAYMENT_LIMITS.bankAccountName),
    bankAccountNumber: oneLine(v.bankAccountNumber, 64),
    bankSwift: oneLine(v.bankSwift, 32).replace(/\s+/g, '').toUpperCase(),
    bankBranch: oneLine(v.bankBranch, PAYMENT_LIMITS.bankBranch),
    bankCurrency: oneLine(v.bankCurrency, 8).toUpperCase() || 'USD',
  };
}

/** True when any bank detail is filled (currency alone does not count: it defaults to USD). */
export function hasBank(v: Record<string, unknown>): boolean {
  return ['bankName', 'bankAccountName', 'bankAccountNumber', 'bankSwift', 'bankBranch'].some((k) => String(v[k] ?? '').trim() !== '');
}

/** Why the bank details cannot be used, or null when they are empty or valid. */
export function bankProblem(raw: Record<string, unknown>): string | null {
  if (!hasBank(raw)) {
    const cur = String(raw.bankCurrency ?? '').trim();
    return cur && !/^[A-Za-z]{3}$/.test(cur) ? 'Bank transfer: the currency must be a 3-letter code, e.g. USD.' : null;
  }
  const b = cleanBank(raw);
  const len = (k: BankKey) => String(raw[k] ?? '').trim().length;
  if (!b.bankName || !b.bankAccountName || !b.bankAccountNumber || !b.bankSwift) {
    return 'Bank transfer: fill in the bank name, account name, account number and SWIFT/BIC, or leave them all empty.';
  }
  if (len('bankName') > PAYMENT_LIMITS.bankName) return `Bank transfer: the bank name is too long (max ${PAYMENT_LIMITS.bankName}).`;
  if (len('bankAccountName') > PAYMENT_LIMITS.bankAccountName) return `Bank transfer: the account name is too long (max ${PAYMENT_LIMITS.bankAccountName}).`;
  if (!/^[0-9][0-9 -]*$/.test(b.bankAccountNumber) || b.bankAccountNumber.length > PAYMENT_LIMITS.bankAccountNumber) {
    return `Bank transfer: the account number may contain only digits, spaces and dashes (max ${PAYMENT_LIMITS.bankAccountNumber}).`;
  }
  if (!/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(b.bankSwift)) return 'Bank transfer: the SWIFT/BIC must be 8 or 11 letters and digits.';
  if (len('bankBranch') > PAYMENT_LIMITS.bankBranch) return `Bank transfer: the branch / address is too long (max ${PAYMENT_LIMITS.bankBranch}).`;
  if (!/^[A-Z]{3}$/.test(b.bankCurrency)) return 'Bank transfer: the currency must be a 3-letter code, e.g. USD.';
  return null;
}

/** A per-field format hint for the owner's form (the all-or-nothing rule is checked on save/send). */
export function bankFieldError(key: BankKey, raw: string): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  if (key === 'bankAccountNumber') return /^[0-9][0-9 -]*$/.test(v) && v.length <= PAYMENT_LIMITS.bankAccountNumber ? null : 'Digits, spaces and dashes only.';
  if (key === 'bankSwift') return /^[A-Za-z0-9]{8}([A-Za-z0-9]{3})?$/.test(v.replace(/\s+/g, '')) ? null : '8 or 11 letters and digits.';
  if (key === 'bankCurrency') return /^[A-Za-z]{3}$/.test(v) ? null : 'A 3-letter code, e.g. USD.';
  return v.length > PAYMENT_LIMITS[key] ? `At most ${PAYMENT_LIMITS[key]} characters.` : null;
}

/** Labelled bank rows to print (empty when no bank details or when they are invalid). Branch only when set. */
export function bankRows(raw: Record<string, unknown>): { key: BankKey; label: string; value: string }[] {
  if (!hasBank(raw) || bankProblem(raw)) return [];
  const b = cleanBank(raw);
  return BANK_KEYS.filter((k) => b[k]).map((k) => ({ key: k, label: BANK_LABELS[k], value: b[k] }));
}

/** Why the PayPal link or fee note cannot be used, or null. */
export function paypalProblem(raw: Record<string, unknown>): string | null {
  const link = String(raw.paypalLink ?? '').trim();
  if (link && !safePaypalLink(link)) return 'The PayPal link must be an https:// address on paypal.me or paypal.com.';
  if (String(raw.paypalFeeNote ?? '').trim().length > PAYMENT_LIMITS.paypalFeeNote) return `The PayPal fee note is too long (max ${PAYMENT_LIMITS.paypalFeeNote}).`;
  return null;
}

/** Bank + PayPal problems together (the Wise link and QR have their own checks). */
export function paymentOptionsProblem(raw: Record<string, unknown>): string | null {
  return bankProblem(raw) ?? paypalProblem(raw);
}
