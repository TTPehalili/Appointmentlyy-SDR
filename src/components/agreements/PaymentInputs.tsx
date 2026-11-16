'use client';

/**
 * Billing statement payment inputs: the Wise "Pay now" link (https:// only, domain shown), bank transfer
 * details, the PayPal link (paypal.me / paypal.com only, domain shown) and the QR image upload.
 */
import * as React from 'react';
import { ImageUp, Trash2 } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui';
import { apiJson } from '@/lib/authClient';
import { cn } from '@/lib/cn';
import { BANK_KEYS, PAYMENT_LIMITS, bankFieldError, bankProblem, hasBank, linkDomain, safePaypalLink, type BankKey } from '@/lib/agreements/paymentOptions';

/** The link's domain, or null when it is not a full https:// address. */
export function httpsDomain(v: string): string | null {
  const s = v.trim();
  if (!s || /[\s<>"'`]/.test(s)) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && u.hostname.includes('.') && !u.username && !u.password ? u.hostname : null;
  } catch {
    return null;
  }
}

export function PaymentLinkInput({ id, label, value, onChange, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const domain = httpsDomain(value);
  const bad = value.trim() !== '' && !domain;
  return (
    <Field label={label} htmlFor={id} error={bad ? 'Use a full https:// address.' : undefined} hint={hint}>
      <div className="flex items-center gap-2">
        <Input id={id} type="url" inputMode="url" placeholder="https://wise.com/pay/..." value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={bad || undefined} maxLength={500} />
        {domain && (
          <span className="shrink-0 rounded-sm bg-subtle px-2 py-1 font-mono text-caption text-fg" data-testid="pay-domain" title="The link goes to this domain">
            {domain}
          </span>
        )}
      </div>
    </Field>
  );
}

/** PayPal link: https:// on paypal.me or paypal.com only; the domain is shown beside the field, as for Wise. */
export function PaypalLinkInput({ id, label, value, onChange, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const domain = linkDomain(value);
  const ok = Boolean(safePaypalLink(value));
  const bad = value.trim() !== '' && !ok;
  return (
    <Field label={label} htmlFor={id} error={bad ? 'Use a full https:// address on paypal.me or paypal.com.' : undefined} hint={hint}>
      <div className="flex items-center gap-2">
        <Input id={id} type="url" inputMode="url" placeholder="https://paypal.me/..." value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={bad || undefined} maxLength={500} />
        {domain && (
          <span
            className={cn('shrink-0 rounded-sm px-2 py-1 font-mono text-caption', ok ? 'bg-subtle text-fg' : 'bg-danger-bg text-danger-fg')}
            data-testid="paypal-domain"
            title="The link goes to this domain"
          >
            {domain}
          </span>
        )}
      </div>
    </Field>
  );
}

/** One bank transfer detail, with its format hint (digits for the account number, 8/11 for SWIFT, 3-letter currency). */
export function BankFieldInput({ id, k, label, value, onChange, hint }: { id: string; k: BankKey; label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const err = bankFieldError(k, value);
  return (
    <Field label={label} htmlFor={id} error={err ?? undefined} hint={err ? undefined : hint}>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(err) || undefined}
        maxLength={k === 'bankCurrency' ? 3 : k === 'bankSwift' ? 11 : PAYMENT_LIMITS[k]}
        autoComplete="off"
        spellCheck={false}
        inputMode={k === 'bankAccountNumber' ? 'numeric' : undefined}
        className={k === 'bankSwift' || k === 'bankCurrency' ? 'uppercase' : undefined}
        placeholder={k === 'bankCurrency' ? 'USD' : undefined}
      />
    </Field>
  );
}

const BANK_FIELD_LABELS: Record<BankKey, string> = {
  bankName: 'Bank name',
  bankAccountName: 'Account name',
  bankAccountNumber: 'Account number',
  bankSwift: 'SWIFT/BIC',
  bankBranch: 'Branch / address (optional)',
  bankCurrency: 'Currency',
};

/** Settings: the default bank transfer details as one block. */
export function BankTransferInputs({ value, onChange }: { value: Record<BankKey, string>; onChange: (k: BankKey, v: string) => void }) {
  const problem = bankProblem(value);
  const hints: Partial<Record<BankKey, string>> = { bankAccountNumber: 'Digits, spaces and dashes.', bankSwift: '8 or 11 letters and digits.', bankCurrency: '3-letter code.' };
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-line p-4" data-testid="bank-inputs">
      <legend className="px-1 text-body-strong text-fg">2. Bank transfer details</legend>
      <p className="text-small text-fg-tertiary">Optional. Shown on billing statements only when filled. Leave all empty to hide bank transfer.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {BANK_KEYS.map((k) => (
          <BankFieldInput key={k} id={`agr-${k}`} k={k} label={BANK_FIELD_LABELS[k]} value={value[k] ?? ''} onChange={(v) => onChange(k, v)} hint={hints[k]} />
        ))}
      </div>
      {problem && hasBank(value) && !BANK_KEYS.some((k) => bankFieldError(k, value[k] ?? '')) && (
        <p role="alert" className="text-small text-danger-fg">
          {problem}
        </p>
      )}
    </fieldset>
  );
}

const MAX_UPLOAD = 1024 * 1024;

/** Re-encode a PNG/JPEG upload to PNG in the browser (drops metadata), then the server rebuilds it. */
async function toPngDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(16, Math.round(bmp.width * scale));
  c.height = Math.max(16, Math.round(bmp.height * scale));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingEnabled = scale === 1 ? false : true;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

export function PaymentQrInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const pick = async (file: File | undefined) => {
    setErr(null);
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) return setErr('Use a PNG or JPEG image.');
    if (file.size > MAX_UPLOAD) return setErr('The image must be under 1 MB.');
    setBusy(true);
    try {
      const png = await toPngDataUrl(file);
      const r = await apiJson<{ image: string }>('/api/agreements/qr', { body: { image: png } });
      if (!r.success) setErr(r.error || 'Could not use that image.');
      else onChange(r.image);
    } catch {
      setErr('That image could not be read.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-body-strong text-fg">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL checked and rebuilt on the server
          <img src={value} alt="Payment QR code" className="size-24 rounded-md border border-line bg-white object-contain p-1" data-testid="qr-preview" />
        ) : (
          <span className="flex size-24 items-center justify-center rounded-md border border-dashed border-line-strong text-caption text-fg-tertiary">No QR</span>
        )}
        <div className="flex flex-col gap-2">
          <input ref={input} type="file" accept="image/png,image/jpeg" className="sr-only" aria-label={`Upload ${label}`} data-testid="qr-file" onChange={(e) => void pick(e.target.files?.[0])} />
          <Button size="sm" variant="secondary" icon={<ImageUp />} loading={busy} onClick={() => input.current?.click()}>
            {value ? 'Replace image' : 'Upload PNG or JPEG'}
          </Button>
          {value && (
            <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => onChange('')}>
              Remove
            </Button>
          )}
        </div>
      </div>
      {err ? <p role="alert" className="text-small text-danger-fg">{err}</p> : <p className="text-small text-fg-tertiary">PNG or JPEG, up to 1 MB.</p>}
    </div>
  );
}
