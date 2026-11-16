'use client';

/** Agreements settings: notification address, owner identity, sender, payment details, saved signature. */
import * as React from 'react';
import { Button, Dialog, Field, InlineError, Input, Textarea, useToast } from '@/components/ui';
import { apiJson } from '@/lib/authClient';
import type { AgreementSettings } from '@/lib/agreements/envelope';
import { SignaturePad, type SignatureValue } from '@/components/agreements/SignaturePad';
import { BankTransferInputs, PaymentLinkInput, PaymentQrInput, PaypalLinkInput } from '@/components/agreements/PaymentInputs';
import { PAYMENT_LIMITS } from '@/lib/agreements/paymentOptions';

type Form = Omit<AgreementSettings, 'hasSavedSignature'>;

export function AgreementSettingsDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: () => void }) {
  const toast = useToast();
  const [form, setForm] = React.useState<Form | null>(null);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [newSig, setNewSig] = React.useState<SignatureValue | null>(null);
  const [drawing, setDrawing] = React.useState(false);
  const [clearSig, setClearSig] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const r = await apiJson<{ settings: AgreementSettings; savedSignature: string | null }>('/api/agreements/settings');
      if (!alive) return;
      if (!r.success) return setError(r.error || 'Could not load the settings.');
      const { hasSavedSignature: _h, ...rest } = r.settings;
      void _h;
      setForm(rest);
      setSaved(r.savedSignature);
      setNewSig(null);
      setDrawing(false);
      setClearSig(false);
      setError(null);
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f));

  const save = async () => {
    if (!form) return;
    setBusy(true);
    const body: Record<string, unknown> = { ...form };
    if (newSig) body.savedSignature = newSig.png;
    else if (clearSig) body.savedSignature = null;
    const r = await apiJson('/api/agreements/settings', { method: 'PUT', body });
    setBusy(false);
    if (!r.success) return setError(r.error || 'Could not save.');
    toast({ message: 'Agreements settings saved' });
    onSaved?.();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Agreements settings"
      description="Used for every agreement email, the Execution page and billing statements."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={!form}>
            Save settings
          </Button>
        </>
      }
    >
      {error && <InlineError message={error} className="mb-4" />}
      {form && (
        <div className="flex flex-col gap-5">
          <section className="grid gap-4 sm:grid-cols-2">
            <Field label="Send my notifications to" htmlFor="agr-owner-email" hint="First open, signed, declined, expiring soon." className="sm:col-span-2">
              <Input id="agr-owner-email" type="email" value={form.ownerEmail} onChange={set('ownerEmail')} />
            </Field>
            <Field label="My name (Execution page)" htmlFor="agr-owner-name">
              <Input id="agr-owner-name" value={form.ownerName} onChange={set('ownerName')} />
            </Field>
            <Field label="My title" htmlFor="agr-owner-title">
              <Input id="agr-owner-title" value={form.ownerTitle} onChange={set('ownerTitle')} />
            </Field>
          </section>
          <section className="grid gap-4 sm:grid-cols-2">
            <Field label="Sender name" htmlFor="agr-sender-name">
              <Input id="agr-sender-name" value={form.senderName} onChange={set('senderName')} />
            </Field>
            <Field label="Sender email" htmlFor="agr-sender-email" hint="Its domain must be verified in Resend.">
              <Input id="agr-sender-email" type="email" value={form.senderEmail} onChange={set('senderEmail')} />
            </Field>
            <Field label="Reply-to" htmlFor="agr-reply-to" className="sm:col-span-2">
              <Input id="agr-reply-to" type="email" value={form.replyTo} onChange={set('replyTo')} />
            </Field>
          </section>
          <section className="flex flex-col gap-4" aria-label="Billing statement payment options">
            <div>
              <p className="text-body-strong text-fg">Billing statement payment options</p>
              <p className="text-small text-fg-tertiary">Each is optional and shown only when filled, in this order. You can change them on each statement.</p>
            </div>
            <PaymentLinkInput id="agr-pay-link" label="1. Wise payment link (Pay now)" hint="https:// only." value={form.paymentLink} onChange={(v) => setForm((f) => (f ? { ...f, paymentLink: v } : f))} />
            <BankTransferInputs
              value={{ bankName: form.bankName, bankAccountName: form.bankAccountName, bankAccountNumber: form.bankAccountNumber, bankSwift: form.bankSwift, bankBranch: form.bankBranch, bankCurrency: form.bankCurrency }}
              onChange={(k, v) => setForm((f) => (f ? { ...f, [k]: v } : f))}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <PaypalLinkInput id="agr-paypal-link" label="3. PayPal link" hint="paypal.me or paypal.com, https:// only." value={form.paypalLink} onChange={(v) => setForm((f) => (f ? { ...f, paypalLink: v } : f))} />
              <Field label="PayPal fee note" htmlFor="agr-paypal-fee" hint='Optional, e.g. "PayPal payments: please add 4.5% to cover PayPal fees".'>
                <Input id="agr-paypal-fee" value={form.paypalFeeNote} onChange={set('paypalFeeNote')} maxLength={PAYMENT_LIMITS.paypalFeeNote} />
              </Field>
            </div>
            <PaymentQrInput label="Payment QR (any provider)" value={form.paymentQr} onChange={(v) => setForm((f) => (f ? { ...f, paymentQr: v } : f))} />
            <Field label="Payment note (optional)" htmlFor="agr-payment" hint="Any extra payment instructions, printed last. Filled in on new billing statements.">
              <Textarea id="agr-payment" value={form.paymentInstructions} onChange={set('paymentInstructions')} rows={3} maxLength={2000} />
            </Field>
          </section>
          <section className="flex flex-col gap-2">
            <p className="text-body-strong text-fg">Saved countersignature</p>
            {saved && !clearSig && !drawing && (
              <div className="flex flex-wrap items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL of the owner's own signature */}
                <img src={saved} alt="Your saved signature" className="h-16 rounded-md border border-line bg-white px-2" />
                <Button size="sm" variant="secondary" onClick={() => setDrawing(true)}>
                  Replace
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setClearSig(true)}>
                  Remove
                </Button>
              </div>
            )}
            {(!saved || drawing || clearSig) && (
              <>
                {clearSig && !drawing ? (
                  <p className="text-small text-fg-secondary">The saved signature will be removed when you save.</p>
                ) : (
                  <SignaturePad label="Draw or type your signature" onChange={setNewSig} defaultTyped={form.ownerName} />
                )}
              </>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}
