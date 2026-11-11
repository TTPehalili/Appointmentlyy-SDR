'use client';

import * as React from 'react';
import { History, RefreshCw, RotateCcw } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Select, Skeleton, useToast } from '@/components/ui';
import {
  ACTIVITY_EVENT_LABEL,
  INTEGRATION_LIMITS,
  type DeliveryStatusView,
  type DeliveryView,
  type WebhookEndpointView,
} from '@/lib/integrations';
import { ApiErrorNotice, type PanelError } from './ApiErrorNotice';
import { DELIVERY_STATUS, EVENT_TYPE_LABEL, absoluteTime, integrationsApi, relativeTime, shortUrl } from './integrationsClient';

const STATUS_FILTERS: { value: DeliveryStatusView | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'succeeded', label: 'Delivered' },
  { value: 'failed', label: 'Failed (will retry)' },
  { value: 'dead', label: 'Gave up' },
  { value: 'skipped', label: 'Skipped' },
];

const POLL_MS = 5_000;

/** Delivery log tab: every delivery and its last attempt, with retry. */
export function DeliveryLogPanel({
  endpoints,
  endpointId,
  onEndpointChange,
}: {
  endpoints: WebhookEndpointView[];
  endpointId: string;
  onEndpointChange: (id: string) => void;
}) {
  const toast = useToast();
  const [status, setStatus] = React.useState<DeliveryStatusView | ''>('');
  const [rows, setRows] = React.useState<DeliveryView[] | null>(null);
  const [error, setError] = React.useState<PanelError | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [retrying, setRetrying] = React.useState<Record<string, boolean>>({});
  const [, setTick] = React.useState(0); // re-render relative times
  const seq = React.useRef(0);

  const load = React.useCallback(
    async (opts?: { quiet?: boolean }) => {
      const mine = ++seq.current;
      if (!opts?.quiet) setRefreshing(true);
      const r = await integrationsApi.listDeliveries({ status, endpointId, limit: 100 });
      if (mine !== seq.current) return; // a newer request (filters changed) wins
      setRefreshing(false);
      if (!r.ok) {
        // Keep showing the last good rows during a quiet background refresh.
        if (!opts?.quiet) setError({ error: r.error, kind: r.kind });
        return;
      }
      setError(null);
      setRows(r.deliveries);
    },
    [status, endpointId],
  );

  // Load on mount and whenever the filters change.
  React.useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // Auto-refresh while anything is pending or waiting for a retry (and the tab is visible).
  const waiting = !!rows?.some((d) => d.status === 'pending' || (d.status === 'failed' && !!d.nextAttemptAt));
  React.useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void load({ quiet: true });
      setTick((n) => n + 1);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [waiting, load]);

  const retry = async (d: DeliveryView) => {
    setRetrying((m) => ({ ...m, [d.id]: true }));
    const r = await integrationsApi.retryDelivery(d.id);
    setRetrying((m) => ({ ...m, [d.id]: false }));
    if (!r.ok) {
      toast({ message: r.error });
      return;
    }
    setRows((cur) => (cur ? cur.map((x) => (x.id === d.id ? r.delivery : x)) : cur));
    toast({ message: 'Retry queued. It will be sent within a minute.' });
  };

  const endpointName = (d: DeliveryView) => {
    const ep = endpoints.find((e) => e.id === d.destination.endpointId);
    return ep?.description || shortUrl(d.destination.url || ep?.url || '');
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-52">
            <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as DeliveryStatusView | '')} data-testid="delivery-filter-status">
              {STATUS_FILTERS.map((f) => (
                <option key={f.value || 'all'} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-72">
            <Select aria-label="Filter by endpoint" value={endpointId} onChange={(e) => onEndpointChange(e.target.value)} data-testid="delivery-filter-endpoint">
              <option value="">All endpoints</option>
              {endpoints.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.description ? `${ep.description} · ${shortUrl(ep.url)}` : shortUrl(ep.url)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {waiting && <span className="text-small text-fg-tertiary">Refreshing every 5 seconds while deliveries are pending</span>}
          <Button size="sm" variant="secondary" icon={<RefreshCw />} loading={refreshing} onClick={() => void load()} data-testid="delivery-refresh">
            Refresh
          </Button>
        </div>
      </div>

      {error && <ApiErrorNotice error={error} onRetry={() => void load()} />}

      {rows === null && !error ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading deliveries">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : rows && rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<History />}
            title={status || endpointId ? 'No deliveries match these filters' : 'No deliveries yet'}
            description={
              status || endpointId
                ? 'Try another status or endpoint.'
                : 'When reps log calls, book meetings or move leads, each event sent to your endpoints shows up here. Use “Send test” on the Webhooks tab to try it.'
            }
          />
        </Card>
      ) : rows ? (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full border-collapse text-body tabular-nums" aria-label="Webhook deliveries" data-testid="delivery-table">
            <thead>
              <tr className="h-9 bg-subtle text-left text-caption text-fg-tertiary">
                <th scope="col" className="px-4">Time</th>
                <th scope="col" className="px-4">Event</th>
                <th scope="col" className="px-4">Destination</th>
                <th scope="col" className="px-4">Status</th>
                <th scope="col" className="px-4 text-right">Attempts</th>
                <th scope="col" className="px-4">Next attempt</th>
                <th scope="col" className="px-4">Last result</th>
                <th scope="col" className="w-24 px-4">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const st = DELIVERY_STATUS[d.status] ?? { label: d.status, tone: 'neutral' as const };
                const canRetry = d.status === 'failed' || d.status === 'dead';
                return (
                  <tr key={d.id} className="border-t border-line align-top" data-testid="delivery-row" data-delivery-id={d.id} data-status={d.status}>
                    <td className="whitespace-nowrap px-4 py-3 text-small text-fg-secondary" title={absoluteTime(d.createdAt)}>
                      {relativeTime(d.createdAt)}
                    </td>
                    <td className="max-w-[280px] px-4 py-3">
                      <span className="block truncate text-body text-fg" title={d.summary}>
                        {d.summary || EVENT_TYPE_LABEL(d.eventType, ACTIVITY_EVENT_LABEL)}
                      </span>
                      <span className="block font-mono text-caption text-fg-tertiary">{d.eventType}</span>
                    </td>
                    <td className="max-w-[220px] px-4 py-3">
                      <span className="block truncate text-small text-fg-secondary" title={d.destination.url}>
                        {endpointName(d)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-small text-fg-secondary">
                      {d.attempts}/{INTEGRATION_LIMITS.maxAttempts}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-small text-fg-secondary" title={absoluteTime(d.nextAttemptAt)}>
                      {d.nextAttemptAt && (d.status === 'pending' || d.status === 'failed') ? relativeTime(d.nextAttemptAt) : '—'}
                    </td>
                    <td className="max-w-[260px] px-4 py-3 text-small">
                      {d.lastResult ? (
                        <span className={d.lastResult.ok ? 'text-fg-secondary' : 'text-danger-fg'} title={d.lastResult.message}>
                          <span className="block line-clamp-2">{d.lastResult.message}</span>
                          <span className="block text-caption text-fg-tertiary">
                            {d.lastResult.httpStatus ? `HTTP ${d.lastResult.httpStatus}` : 'No response'} · {Math.round(d.lastResult.durationMs)} ms
                          </span>
                        </span>
                      ) : (
                        <span className="text-fg-tertiary">Not sent yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canRetry && (
                        <Button size="sm" variant="secondary" icon={<RotateCcw />} loading={!!retrying[d.id]} onClick={() => void retry(d)} data-testid="delivery-retry">
                          Retry
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {rows && rows.length >= 100 && <p className="text-small text-fg-tertiary">Showing the latest 100 deliveries. Use the filters to narrow it down.</p>}
    </div>
  );
}
