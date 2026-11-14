'use client';

import * as React from 'react';
import { AlertTriangle, Check, Copy } from 'lucide-react';
import { Button, Checkbox, Dialog, Field, InlineError, Input } from '@/components/ui';
import {
  ACTIVITY_EVENT_LABEL,
  INTEGRATION_LIMITS,
  WEBHOOK_EVENT_TYPES,
  type ActivityEventType,
  type WebhookEndpointView,
} from '@/lib/integrations';
import { checkWebhookUrl, integrationsApi } from './integrationsClient';

const EVENT_HINT: Record<ActivityEventType, string> = {
  'contact.created': 'A contact is added: import, Lead Finder pull, or a new lead called from the Dialer.',
  'call.logged': "A rep logs a call outcome in the Dialer, with the rep's own call notes when they wrote any.",
  'meeting.booked': 'A call is logged with a booked outcome.',
  'callback.scheduled': 'A rep schedules a callback.',
  'pipeline.stage_changed': 'A lead moves to another Pipeline stage (by hand or by a call outcome).',
  'email.sent': 'A follow-up email is sent from the Dialer.',
};

/**
 * Add or edit a webhook endpoint. On create, the server returns the signing secret once and
 * `onSaved` receives it so the caller can show it.
 */
export function WebhookEndpointDialog({
  open,
  onClose,
  endpoint,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Present when editing. */
  endpoint: WebhookEndpointView | null;
  onSaved: (endpoint: WebhookEndpointView, signingSecret?: string) => void;
}) {
  const [url, setUrl] = React.useState('');
  const [events, setEvents] = React.useState<ActivityEventType[]>([]);
  const [description, setDescription] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; field?: string } | null>(null);
  const urlId = React.useId();
  const descId = React.useId();

  // Reset the form each time the dialog opens (render-phase sync, no effect needed).
  const [openedFor, setOpenedFor] = React.useState<string | null>(null);
  const key = open ? endpoint?.id ?? 'new' : null;
  if (key !== openedFor) {
    setOpenedFor(key);
    if (key !== null) {
      setUrl(endpoint?.url ?? '');
      setEvents(endpoint ? [...endpoint.events] : ['call.logged', 'meeting.booked']);
      setDescription(endpoint?.description ?? '');
      setTouched(false);
      setError(null);
      setSaving(false);
    }
  }

  const urlProblem = checkWebhookUrl(url, INTEGRATION_LIMITS.urlLength);
  const eventsProblem = events.length === 0 ? 'Pick at least one event.' : null;
  const descProblem = description.length > INTEGRATION_LIMITS.descriptionLength ? `Keep it under ${INTEGRATION_LIMITS.descriptionLength} characters.` : null;
  const serverField = (f: string) => (error?.field && error.field.toLowerCase().includes(f) ? error.message : undefined);

  const toggle = (t: ActivityEventType) => setEvents((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  const allOn = events.length === WEBHOOK_EVENT_TYPES.length;

  const save = async () => {
    setTouched(true);
    if (urlProblem || eventsProblem || descProblem || saving) return;
    setSaving(true);
    setError(null);
    // Keep the contract order so the endpoint's event list reads the same everywhere.
    const ordered = WEBHOOK_EVENT_TYPES.filter((t) => events.includes(t));
    const body = { url: url.trim(), events: ordered, description: description.trim() };
    const r = endpoint ? await integrationsApi.updateWebhook(endpoint.id, body) : await integrationsApi.createWebhook(body);
    setSaving(false);
    if (!r.ok) {
      setError({ message: r.error, field: r.field });
      return;
    }
    onSaved(r.endpoint, r.signingSecret);
  };

  // Errors not tied to a field shown here (URL / events / description errors sit under their field).
  const fieldErr = error && !serverField('url') && !serverField('event') && !serverField('description') ? error.message : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!saving}
      size="lg"
      title={endpoint ? 'Edit webhook endpoint' : 'Add webhook endpoint'}
      description="We POST a signed JSON body to this URL each time one of the chosen events happens."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving} data-testid="webhook-save">
            {endpoint ? 'Save changes' : 'Add endpoint'}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field
          label="Endpoint URL"
          htmlFor={urlId}
          hint="For Zapier use a “Catch Hook” URL; for Make, a custom webhook URL. HTTPS only."
          error={serverField('url') || (touched ? urlProblem ?? undefined : undefined)}
        >
          <Input
            id={urlId}
            mono
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://hooks.zapier.com/hooks/catch/…"
            value={url}
            maxLength={INTEGRATION_LIMITS.urlLength + 20}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={(touched && !!urlProblem) || !!serverField('url') || undefined}
            data-testid="webhook-url-input"
          />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <legend className="text-body-strong text-fg">Events to send</legend>
            <button
              type="button"
              className="focus-ring rounded-sm text-small text-fg-secondary underline underline-offset-2 hover:text-fg"
              onClick={() => setEvents(allOn ? [] : [...WEBHOOK_EVENT_TYPES])}
            >
              {allOn ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {WEBHOOK_EVENT_TYPES.map((t) => (
              <label
                key={t}
                className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line px-3 py-2.5 hover:bg-subtle has-[:checked]:border-selected has-[:checked]:bg-selected-soft"
              >
                <span className="pt-0.5">
                  <Checkbox checked={events.includes(t)} onChange={() => toggle(t)} data-testid={`webhook-event-${t}`} aria-describedby={`${urlId}-${t}`} />
                </span>
                <span className="min-w-0">
                  <span className="block text-body text-fg">{ACTIVITY_EVENT_LABEL[t]}</span>
                  <span className="block font-mono text-caption text-fg-tertiary">{t}</span>
                  <span id={`${urlId}-${t}`} className="mt-0.5 block text-small text-fg-secondary">
                    {EVENT_HINT[t]}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {(touched && eventsProblem) || serverField('event') ? (
            <p className="text-small text-danger-fg" role="alert">
              {serverField('event') || eventsProblem}
            </p>
          ) : null}
        </fieldset>

        <Field
          label="Description (optional)"
          htmlFor={descId}
          hint="So your team knows what this is, e.g. “Zapier → HubSpot deals”."
          error={serverField('description') || descProblem || undefined}
        >
          <Input
            id={descId}
            value={description}
            maxLength={INTEGRATION_LIMITS.descriptionLength + 20}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Zapier → HubSpot"
            data-testid="webhook-description-input"
          />
        </Field>

        {fieldErr && <InlineError message={fieldErr} />}
        {/* Enter in a field submits. */}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}

/** Shows a just-created or rotated signing secret, once. */
export function SigningSecretDialog({
  secret,
  rotated,
  onClose,
}: {
  secret: string | null;
  rotated?: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const boxRef = React.useRef<HTMLInputElement>(null);
  const [shownFor, setShownFor] = React.useState<string | null>(null);
  if (secret !== shownFor) {
    setShownFor(secret);
    setCopied(false);
  }

  const copy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      // Clipboard blocked: select the text so Ctrl/Cmd+C works.
      boxRef.current?.select();
    }
  };

  return (
    <Dialog
      open={!!secret}
      onClose={onClose}
      dismissible={false}
      size="md"
      title={rotated ? 'New signing secret' : 'Endpoint added: copy your signing secret'}
      description="Use it to check that requests really come from Appointmentlyy (see “How to verify signatures”)."
      footer={
        <Button variant="primary" onClick={onClose} data-testid="webhook-secret-done">
          I’ve saved it
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-2.5 rounded-md border border-warning-fg/30 bg-warning-bg px-3 py-2.5 text-small text-warning-fg" role="note">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            This is the only time we show this secret. Store it in your receiver (for example as an environment variable or in your Zapier
            step) now. {rotated ? 'The previous secret has stopped working.' : 'If you lose it, rotate the secret to get a new one.'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Input
            ref={boxRef}
            readOnly
            mono
            value={secret ?? ''}
            aria-label="Signing secret"
            onFocus={(e) => e.currentTarget.select()}
            data-testid="webhook-secret"
          />
          <Button variant="secondary" onClick={() => void copy()} icon={copied ? <Check /> : <Copy />} data-testid="webhook-secret-copy">
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
