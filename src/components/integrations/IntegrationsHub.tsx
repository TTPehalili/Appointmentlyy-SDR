'use client';

import * as React from 'react';
import { PageHeader, Tabs } from '@/components/ui';
import type { WebhookEndpointView } from '@/lib/integrations';
import { integrationsApi } from './integrationsClient';
import { ApiErrorNotice, type PanelError } from './ApiErrorNotice';
import { WebhooksPanel } from './WebhooksPanel';
import { DeliveryLogPanel } from './DeliveryLogPanel';
import { CrmConnectionsPanel } from './CrmConnectionsPanel';

type Tab = 'webhooks' | 'deliveries' | 'crm';
const TABS: Tab[] = ['webhooks', 'deliveries', 'crm'];

/** The tab in the URL (?tab=deliveries), so the log can be linked to. */
function readTab(): Tab {
  if (typeof window === 'undefined') return 'webhooks';
  const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
  return t && TABS.includes(t) ? t : 'webhooks';
}

function writeTab(t: Tab) {
  try {
    const url = new URL(window.location.href);
    if (t === 'webhooks') url.searchParams.delete('tab');
    else url.searchParams.set('tab', t);
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // URL sync is a nicety only
  }
}

/**
 * Admin › Integrations: webhook endpoints, their delivery log, and the (coming soon) CRM
 * connections. Admin+ (the Admin shell shows a no-access page to others; the API enforces it too).
 */
export default function IntegrationsHub() {
  const [tab, setTabState] = React.useState<Tab>(readTab);
  const [endpoints, setEndpoints] = React.useState<WebhookEndpointView[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<PanelError | null>(null);
  const [deliveryEndpoint, setDeliveryEndpoint] = React.useState('');

  const setTab = (t: Tab) => {
    setTabState(t);
    writeTab(t);
  };

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    const r = await integrationsApi.listWebhooks(signal);
    if (signal?.aborted) return;
    setLoading(false);
    if (!r.ok) {
      setError({ error: r.error, kind: r.kind });
      return;
    }
    setError(null);
    setEndpoints(r.endpoints);
  }, []);

  React.useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => void load(ctrl.signal), 0);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [load]);

  const forbidden = error?.kind === 'forbidden';

  return (
    <div className="w-full max-w-[1100px] px-4 py-6 md:px-8" data-testid="integrations-page">
      <PageHeader
        title="Integrations"
        description="Send calls, booked meetings and new contacts to your CRM, Zapier or Make."
        tabs={
          forbidden ? undefined : (
            <div data-testid="integrations-tabs">
              <Tabs
                label="Integrations sections"
                value={tab}
                onChange={(v) => setTab(v as Tab)}
                items={[
                  { value: 'webhooks', label: 'Webhooks', count: loading || error ? undefined : endpoints.length },
                  { value: 'deliveries', label: 'Delivery log' },
                  { value: 'crm', label: 'CRM connections' },
                ]}
              />
            </div>
          )
        }
      />

      {forbidden && error ? (
        <ApiErrorNotice error={error} />
      ) : (
        <div role="tabpanel" aria-label={tab === 'webhooks' ? 'Webhooks' : tab === 'deliveries' ? 'Delivery log' : 'CRM connections'} data-testid={`integrations-panel-${tab}`}>
          {tab === 'webhooks' && (
            <WebhooksPanel
              endpoints={endpoints}
              loading={loading}
              error={error}
              onReload={() => void load()}
              onChange={setEndpoints}
              onViewDeliveries={(id) => {
                setDeliveryEndpoint(id);
                setTab('deliveries');
              }}
            />
          )}
          {tab === 'deliveries' && <DeliveryLogPanel endpoints={endpoints} endpointId={deliveryEndpoint} onEndpointChange={setDeliveryEndpoint} />}
          {tab === 'crm' && <CrmConnectionsPanel onOpenWebhooks={() => setTab('webhooks')} />}
        </div>
      )}
    </div>
  );
}
