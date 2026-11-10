'use client';

import React, { useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, RefreshCw, Check, ShieldCheck, Unplug } from 'lucide-react';
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, PageHeader, Tabs, Tooltip } from '@/components/ui';
import { isDemoWorkspace } from '@/lib/demoMode';

interface FieldMapping {
  id: string;
  lmsField: string;
  crmField: string;
  direction: 'Two-Way' | 'LMS-to-CRM' | 'CRM-to-LMS';
  syncTrigger: 'On Call Finished' | 'On Cert Passed' | 'Immediate';
}

interface CrmConnector {
  id: string;
  name: string;
  logo: string;
  category: string;
  isConnected: boolean;
  locationId?: string;
  syncFrequency: string;
  recordsSynced: number;
}

export default function UniversalCrmStudio() {
  const [activeTab, setActiveTab] = useState<'connectors' | 'mapper' | 'stream'>('mapper');
  const [retryingDlq, setRetryingDlq] = useState(false);
  const [dlqSuccess, setDlqSuccess] = useState(false);
  const [savedMappings, setSavedMappings] = useState(false);
  const [pendingDisconnect, setPendingDisconnect] = useState<CrmConnector | null>(null);

  // Connected CRMs, record counts and the sync log are sample data for the demo workspace only.
  const [connectors, setConnectors] = useState<CrmConnector[]>(() => {
    const all: CrmConnector[] = [
    {
      id: 'ghl',
      name: 'GoHighLevel (GHL)',
      logo: '⚡',
      category: 'Agency Multi-Location CRM',
      isConnected: true,
      locationId: 'loc_apex_bpo_88192',
      syncFrequency: 'Real-time Webhook',
      recordsSynced: 342
    },
    {
      id: 'hubspot',
      name: 'HubSpot CRM',
      logo: '🟧',
      category: 'Enterprise Sales & Deal Pipeline',
      isConnected: true,
      locationId: 'portal_2948102',
      syncFrequency: 'Every 5 mins',
      recordsSynced: 128
    },
    {
      id: 'salesforce',
      name: 'Salesforce Enterprise',
      logo: '☁️',
      category: 'Global Enterprise CRM',
      isConnected: false,
      syncFrequency: 'OAuth 2.0 Webhook',
      recordsSynced: 0
    },
    {
      id: 'activecampaign',
      name: 'ActiveCampaign',
      logo: '🔵',
      category: 'Marketing Automation & Tags',
      isConnected: false,
      syncFrequency: 'REST API v3',
      recordsSynced: 0
    }
    ];
    if (isDemoWorkspace()) return all;
    return all.map((c) => ({ ...c, isConnected: false, locationId: undefined, recordsSynced: 0 }));
  });

  const [mappings, setMappings] = useState<FieldMapping[]>([
    {
      id: 'map-1',
      lmsField: 'Rep Name (Sales Representative)',
      crmField: 'contact.owner_name',
      direction: 'LMS-to-CRM',
      syncTrigger: 'On Call Finished'
    },
    {
      id: 'map-2',
      lmsField: 'AI Sparring Score (0 - 100%)',
      crmField: 'contact.custom_field_ai_sparring_score',
      direction: 'LMS-to-CRM',
      syncTrigger: 'On Call Finished'
    },
    {
      id: 'map-3',
      lmsField: 'Boris Certification Status',
      crmField: 'contact.tags ("BORIS_CERTIFIED_SDR")',
      direction: 'LMS-to-CRM',
      syncTrigger: 'On Cert Passed'
    },
    {
      id: 'map-4',
      lmsField: 'Lead Phone & Contact Name',
      crmField: 'contact.phone & contact.name',
      direction: 'Two-Way',
      syncTrigger: 'Immediate'
    },
    {
      id: 'map-5',
      lmsField: 'Objection History & ARM Audit Log',
      crmField: 'contact.notes / timeline_activity',
      direction: 'LMS-to-CRM',
      syncTrigger: 'On Call Finished'
    },
    {
      id: 'map-6',
      lmsField: 'WebRTC Call Recording Audio Link',
      crmField: 'contact.custom_field_call_recording_url',
      direction: 'LMS-to-CRM',
      syncTrigger: 'On Call Finished'
    }
  ]);

  const [syncLogs, setSyncLogs] = useState<{ id: string; time: string; crm: string; event: string; rep: string; status: string; error: string | null }[]>(() => !isDemoWorkspace() ? [] : [
    { id: '1', time: '1 min ago', crm: 'GoHighLevel', event: 'contact.sparring_score.updated', rep: 'Alex Mercer', status: '200 OK', error: null },
    { id: '2', time: '4 mins ago', crm: 'HubSpot', event: 'deal.pipeline_stage.updated', rep: 'Jordan Smith', status: '200 OK', error: null },
    { id: '3', time: '12 mins ago', crm: 'GoHighLevel', event: 'contact.tag.added ("BORIS_CERTIFIED")', rep: 'Elena Rostova', status: '200 OK', error: null },
    { id: '4', time: '28 mins ago', crm: 'GoHighLevel', event: 'contact.sparring_score.updated', rep: 'Marcus Brody', status: '429 Rate Limited', error: 'API token bucket depleted. Event rerouted to Dead Letter Queue (DLQ).' },
  ]);

  const toggleConnector = (id: string) => {
    setConnectors(prev =>
      prev.map(c => c.id === id ? { ...c, isConnected: !c.isConnected } : c)
    );
  };

  const handleRetryDlq = () => {
    setRetryingDlq(true);
    setTimeout(() => {
      setRetryingDlq(false);
      setDlqSuccess(true);
      setSyncLogs(prev =>
        prev.map(l => l.status.includes('429') ? { ...l, status: '200 OK (Retried from DLQ)', error: null } : l)
      );
      setTimeout(() => setDlqSuccess(false), 3000);
    }, 1200);
  };

  const handleSaveMappings = () => {
    setSavedMappings(true);
    setTimeout(() => setSavedMappings(false), 2000);
  };

  return (
    <div className="space-y-6">

      <PageHeader
        title="CRM & field mapping"
        description="Sync reps, call activity, practice scores and objections with your CRM."
        tabs={
          <Tabs
            label="CRM sections"
            value={activeTab}
            onChange={(v) => setActiveTab(v as any)}
            items={[
              { value: 'mapper', label: 'Field mapping' },
              { value: 'connectors', label: 'Connections' },
              { value: 'stream', label: 'Sync log' },
            ]}
          />
        }
      />

      {/* TAB 1: FIELD SCHEMA MAPPER */}
      {activeTab === 'mapper' && (
        <Card>
          <CardHeader
            className="pb-4"
            title="Field mapping"
            description="Controls what is sent to the CRM when a practice session ends or a Boris certificate is issued."
            actions={
              <Button
                variant="brand"
                onClick={handleSaveMappings}
                icon={savedMappings ? <Check /> : undefined}
              >
                {savedMappings ? 'Saved' : 'Save mappings'}
              </Button>
            }
          />

          <div className="overflow-x-auto">
            <table className="w-full text-left text-small">
              <thead className="bg-subtle text-caption text-fg-tertiary">
                <tr>
                  <th className="px-4 py-2.5 font-medium">App field</th>
                  <th className="px-4 py-2.5 font-medium">Direction</th>
                  <th className="px-4 py-2.5 font-medium">CRM field</th>
                  <th className="px-4 py-2.5 font-medium">Trigger</th>
                  <th className="px-4 py-2.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr key={m.id} className="border-t border-line transition-colors hover:bg-subtle">
                    <td className="px-4 py-3 text-body-strong text-fg">
                      {m.lmsField}
                    </td>
                    <td className="px-4 py-3 text-fg-secondary">
                      {m.direction}
                    </td>
                    <td className="px-4 py-3 font-mono text-fg">
                      {m.crmField}
                    </td>
                    <td className="px-4 py-3 text-fg-secondary">
                      {m.syncTrigger}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge tone="success">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Syncing</span>
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 2: CRM GATEWAYS */}
      {activeTab === 'connectors' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {connectors.map((c) => (
            <Card key={c.id} className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-subtle">
                    <Building2 className="h-4 w-4 text-fg-secondary" />
                  </div>
                  <div>
                    <h3 className="text-h3 text-fg">{c.name}</h3>
                    <p className="text-small text-fg-secondary">{c.category}</p>
                  </div>
                </div>

                {c.isConnected ? (
                  <Badge tone="success">Connected</Badge>
                ) : (
                  <Badge tone="neutral">Not connected</Badge>
                )}
              </div>

              {c.isConnected && (
                <dl className="space-y-1.5 rounded-md bg-subtle p-3 text-small">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-fg-secondary">Location / portal ID</dt>
                    <dd className="flex items-center gap-1">
                      <span className="font-mono text-fg">{c.locationId}</span>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-fg-secondary">Sync frequency</dt>
                    <dd className="text-fg">{c.syncFrequency}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-fg-secondary">Records synced</dt>
                    <dd className="tabular-nums text-fg">{c.recordsSynced} records</dd>
                  </div>
                </dl>
              )}

              <div className="flex items-center justify-between border-t border-line pt-3">
                <span className="inline-flex items-center gap-1.5 text-small text-fg-tertiary">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <Tooltip content="Each webhook is signed with a shared secret so forged requests are rejected.">
                    <span className="cursor-help underline decoration-dotted decoration-fg-tertiary underline-offset-4">HMAC</span>
                  </Tooltip>
                  signature verified
                </span>
                {c.isConnected ? (
                  <Button size="sm" variant="danger" onClick={() => setPendingDisconnect(c)} icon={<Unplug />}>
                    Disconnect
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => toggleConnector(c.id)}>
                    Connect
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* TAB 3: SYNC STREAM & DEAD LETTER QUEUE (DLQ) */}
      {activeTab === 'stream' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-h2 text-fg">Sync log</h3>
              <p className="text-small text-fg-secondary">Outgoing webhook deliveries and queue worker results.</p>
            </div>

            <Button
              variant="primary"
              onClick={handleRetryDlq}
              disabled={retryingDlq || !syncLogs.some((l) => l.error)}
              icon={<RefreshCw className={retryingDlq ? 'animate-spin' : ''} />}
            >
              {retryingDlq ? 'Retrying...' : 'Retry failed events'}
            </Button>
          </div>

          {dlqSuccess && (
            <div className="flex items-center gap-2 rounded-lg border border-success-fg/20 bg-success-bg p-3 text-small text-success-fg">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Retry queue cleared. 1 event delivered with 200 OK.</span>
            </div>
          )}

          {syncLogs.length === 0 && (
            <Card>
              <EmptyState
                icon={<RefreshCw />}
                title="No sync events yet"
                description="Once a CRM is connected, every delivery to it is logged here."
              />
            </Card>
          )}

          {syncLogs.length > 0 && (
          <Card className="divide-y divide-line overflow-hidden text-small">
            {syncLogs.map((log) => (
              <div key={log.id} className="flex flex-col justify-between gap-3 p-4 transition-colors hover:bg-subtle sm:flex-row sm:items-center">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-body-strong text-fg">{log.crm}</span>
                    <span className="font-mono text-fg">{log.event}</span>
                    <span className="text-fg-secondary">&bull; Rep: {log.rep}</span>
                  </div>
                  {log.error && (
                    <p className="mt-1 flex items-start gap-1.5 rounded-md bg-warning-bg p-2 text-small text-warning-fg">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{log.error}</span>
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone={log.status.includes('200') ? 'success' : 'warning'}>
                    <span className="font-mono">{log.status}</span>
                  </Badge>
                  <span className="text-small text-fg-tertiary">{log.time}</span>
                </div>
              </div>
            ))}
          </Card>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingDisconnect !== null}
        onClose={() => setPendingDisconnect(null)}
        onConfirm={() => {
          if (pendingDisconnect) toggleConnector(pendingDisconnect.id);
        }}
        title={`Disconnect ${pendingDisconnect?.name ?? 'connector'}?`}
        description="Records stop syncing to this CRM until you connect it again."
        confirmLabel="Disconnect"
        icon={<Unplug />}
      />

    </div>
  );
}
