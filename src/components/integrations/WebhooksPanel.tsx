'use client';

import * as React from 'react';
import { CheckCircle2, KeyRound, ListChecks, Pencil, Plus, Send, Trash2, Webhook, XCircle } from 'lucide-react';
import { Badge, Button, Card, ConfirmDialog, EmptyState, IconButton, InlineError, Skeleton, StatusDot, Switch, useToast } from '@/components/ui';
import { ACTIVITY_EVENT_LABEL, INTEGRATION_LIMITS, type DeliveryAttemptResult, type WebhookEndpointView } from '@/lib/integrations';
import { cn } from '@/lib/cn';
import { absoluteTime, integrationsApi, relativeTime, shortUrl } from './integrationsClient';
import { SigningSecretDialog, WebhookEndpointDialog } from './WebhookDialogs';
import { VerifySignaturesPanel } from './VerifySignaturesPanel';
import { ApiErrorNotice, type PanelError } from './ApiErrorNotice';

type TestState = { running: boolean; result?: DeliveryAttemptResult; error?: string };

function endpointStatus(ep: WebhookEndpointView): { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string } {
  if (ep.disabledReason) return { tone: 'danger', label: 'Turned off automatically' };
  if (!ep.active) return { tone: 'neutral', label: 'Paused' };
  if (ep.consecutiveFailures > 0) return { tone: 'warning', label: 'Active, recent deliveries failing' };
  return { tone: 'success', label: 'Active' };
}

export function TestResult({ state }: { state: TestState }) {
  if (state.running) return <p className="text-small text-fg-secondary" data-testid="webhook-test-result" aria-live="polite">Sending a test ping…</p>;
  if (state.error) return <InlineError message={state.error} className="text-small" />;
  const r = state.result;
  if (!r) return null;
  return (
    <div
      role="status"
      data-testid="webhook-test-result"
      data-ok={r.ok ? 'true' : 'false'}
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-small',
        r.ok ? 'border-success-fg/30 bg-success-bg text-success-fg' : 'border-danger-fg/30 bg-danger-bg text-danger-fg',
      )}
    >
      {r.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <span>
        <span className="font-medium">{r.ok ? 'Test delivered.' : 'Test failed.'}</span> {r.message}
        <span className="ml-1 tabular-nums opacity-80">
          ({r.httpStatus ? `HTTP ${r.httpStatus}` : 'no response'} · {Math.round(r.durationMs)} ms)
        </span>
      </span>
    </div>
  );
}

/** Webhooks tab: endpoints, add/edit, secrets, tests, and the signature guide. */
export function WebhooksPanel({
  endpoints,
  loading,
  error,
  onReload,
  onChange,
  onViewDeliveries,
}: {
  endpoints: WebhookEndpointView[];
  loading: boolean;
  error: PanelError | null;
  onReload: () => void;
  onChange: (next: WebhookEndpointView[]) => void;
  onViewDeliveries: (endpointId: string) => void;
}) {
  const toast = useToast();
  const [dialog, setDialog] = React.useState<{ open: boolean; endpoint: WebhookEndpointView | null }>({ open: false, endpoint: null });
  const [secret, setSecret] = React.useState<{ value: string; rotated: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<WebhookEndpointView | null>(null);
  const [confirmRotate, setConfirmRotate] = React.useState<WebhookEndpointView | null>(null);
  const [busy, setBusy] = React.useState<Record<string, boolean>>({});
  const [rowError, setRowError] = React.useState<Record<string, string>>({});
  const [tests, setTests] = React.useState<Record<string, TestState>>({});

  const atLimit = endpoints.length >= INTEGRATION_LIMITS.endpointsPerWorkspace;
  const replace = (ep: WebhookEndpointView) => onChange(endpoints.some((e) => e.id === ep.id) ? endpoints.map((e) => (e.id === ep.id ? ep : e)) : [...endpoints, ep]);
  const setRow = (id: string, b: boolean) => setBusy((m) => ({ ...m, [id]: b }));
  const setErr = (id: string, msg: string) => setRowError((m) => ({ ...m, [id]: msg }));

  const toggleActive = async (ep: WebhookEndpointView, active: boolean) => {
    setRow(ep.id, true);
    setErr(ep.id, '');
    const r = await integrationsApi.updateWebhook(ep.id, { active });
    setRow(ep.id, false);
    if (!r.ok) return setErr(ep.id, r.error);
    replace(r.endpoint);
    toast({ message: active ? 'Endpoint turned on' : 'Endpoint paused. Events are not sent to it while paused.' });
  };

  const rotate = async (ep: WebhookEndpointView) => {
    setRow(ep.id, true);
    setErr(ep.id, '');
    const r = await integrationsApi.updateWebhook(ep.id, { rotateSecret: true });
    setRow(ep.id, false);
    if (!r.ok) return setErr(ep.id, r.error);
    replace(r.endpoint);
    if (r.signingSecret) setSecret({ value: r.signingSecret, rotated: true });
    else setErr(ep.id, 'The secret was rotated, but the server did not return it. Rotate again to see the new secret.');
  };

  const remove = async (ep: WebhookEndpointView) => {
    setRow(ep.id, true);
    setErr(ep.id, '');
    const r = await integrationsApi.deleteWebhook(ep.id);
    setRow(ep.id, false);
    if (!r.ok) return setErr(ep.id, r.error);
    onChange(endpoints.filter((e) => e.id !== ep.id));
    toast({ message: 'Endpoint deleted' });
  };

  const test = async (ep: WebhookEndpointView) => {
    setTests((m) => ({ ...m, [ep.id]: { running: true } }));
    const r = await integrationsApi.testWebhook(ep.id);
    setTests((m) => ({ ...m, [ep.id]: r.ok ? { running: false, result: r.result } : { running: false, error: r.error } }));
  };

  const addButton = (
    <Button
      variant="brand"
      icon={<Plus />}
      onClick={() => setDialog({ open: true, endpoint: null })}
      disabled={atLimit || loading || !!error}
      title={atLimit ? `A workspace can have up to ${INTEGRATION_LIMITS.endpointsPerWorkspace} endpoints.` : undefined}
      data-testid="webhook-add"
    >
      Add endpoint
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[70ch]">
          <h2 className="text-h3 text-fg">Webhook endpoints</h2>
          <p className="mt-0.5 text-small text-fg-secondary">
            Each event is sent as a signed JSON POST. Failed deliveries are retried for about 15 hours (1m, 5m, 30m, 2h, 12h) and every attempt is
            listed in the Delivery log.
          </p>
        </div>
        {addButton}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading webhook endpoints">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : error ? (
        <ApiErrorNotice error={error} onRetry={onReload} />
      ) : endpoints.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Webhook />}
            title="No webhooks yet"
            description="Add one to send call outcomes and booked meetings to your CRM or Zapier."
            action={addButton}
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Webhook endpoints">
          {endpoints.map((ep) => {
            const st = endpointStatus(ep);
            const isBusy = !!busy[ep.id];
            const t = tests[ep.id];
            return (
              <li key={ep.id} data-testid="webhook-endpoint" data-endpoint-id={ep.id}>
                <Card className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-small text-fg" title={ep.url} data-testid="webhook-endpoint-url">
                        {ep.url}
                      </p>
                      {ep.description && <p className="mt-0.5 text-small text-fg-secondary">{ep.description}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-fg-secondary">
                        <StatusDot tone={st.tone} label={<span className="text-small">{st.label}</span>} />
                        <span title={absoluteTime(ep.lastDeliveryAt)}>Last delivery: {ep.lastDeliveryAt ? relativeTime(ep.lastDeliveryAt) : 'none yet'}</span>
                        {ep.consecutiveFailures > 0 && (
                          <span className="text-warning-fg tabular-nums">
                            {ep.consecutiveFailures} failed in a row
                            {!ep.disabledReason && ` (turns off at ${INTEGRATION_LIMITS.autoDisableAfter})`}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <KeyRound className="size-3.5" aria-hidden />
                          Secret ends in <span className="font-mono">{ep.secretHint || '····'}</span>
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-small text-fg-secondary">{ep.active ? 'On' : 'Off'}</span>
                      <span data-testid="webhook-active-toggle">
                        <Switch
                          checked={ep.active}
                          disabled={isBusy}
                          label={ep.active ? `Pause ${shortUrl(ep.url)}` : `Turn on ${shortUrl(ep.url)}`}
                          onCheckedChange={(v) => void toggleActive(ep, v)}
                        />
                      </span>
                    </div>
                  </div>

                  {ep.disabledReason && (
                    <div className="rounded-md border border-danger-fg/30 bg-danger-bg px-3 py-2 text-small text-danger-fg" role="note">
                      Turned off automatically: {ep.disabledReason.trim().replace(/\.?$/, '.')} Fix the receiver, send a test, then switch it back on.
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5" aria-label="Subscribed events">
                    {ep.events.map((e) => (
                      <Badge key={e}>{ACTIVITY_EVENT_LABEL[e] ?? e}</Badge>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    <Button size="sm" variant="secondary" icon={<Send />} loading={!!t?.running} onClick={() => void test(ep)} data-testid="webhook-test">
                      Send test
                    </Button>
                    <Button size="sm" variant="ghost" icon={<ListChecks />} onClick={() => onViewDeliveries(ep.id)} data-testid="webhook-view-deliveries">
                      Deliveries
                    </Button>
                    <Button size="sm" variant="ghost" icon={<Pencil />} disabled={isBusy} onClick={() => setDialog({ open: true, endpoint: ep })} data-testid="webhook-edit">
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" icon={<KeyRound />} disabled={isBusy} onClick={() => setConfirmRotate(ep)} data-testid="webhook-rotate">
                      Rotate secret
                    </Button>
                    <span className="flex-1" />
                    <IconButton label={`Delete ${shortUrl(ep.url)}`} size="sm" variant="danger" disabled={isBusy} onClick={() => setConfirmDelete(ep)} data-testid="webhook-delete">
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>

                  {t && <TestResult state={t} />}
                  {rowError[ep.id] && <InlineError message={rowError[ep.id]} />}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <VerifySignaturesPanel />

      <WebhookEndpointDialog
        open={dialog.open}
        endpoint={dialog.endpoint}
        onClose={() => setDialog({ open: false, endpoint: null })}
        onSaved={(ep, signingSecret) => {
          const wasEdit = !!dialog.endpoint;
          replace(ep);
          setDialog({ open: false, endpoint: null });
          if (signingSecret) setSecret({ value: signingSecret, rotated: false });
          else toast({ message: wasEdit ? 'Endpoint saved' : 'Endpoint added' });
        }}
      />
      <SigningSecretDialog secret={secret?.value ?? null} rotated={secret?.rotated} onClose={() => setSecret(null)} />
      <ConfirmDialog
        open={!!confirmRotate}
        onClose={() => setConfirmRotate(null)}
        onConfirm={() => confirmRotate && void rotate(confirmRotate)}
        title="Rotate the signing secret?"
        description="The current secret stops working right away. Deliveries sent after this are signed with the new secret, so update your receiver straight after."
        confirmLabel="Rotate secret"
        tone="primary"
        icon={<KeyRound />}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && void remove(confirmDelete)}
        title="Delete this endpoint?"
        description={confirmDelete ? `${shortUrl(confirmDelete.url)} will stop receiving events. This can’t be undone.` : undefined}
        confirmLabel="Delete endpoint"
        icon={<Trash2 />}
      />
    </div>
  );
}
