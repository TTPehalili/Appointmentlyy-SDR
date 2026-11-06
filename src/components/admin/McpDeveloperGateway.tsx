'use client';

import React, { useState } from 'react';
import { Copy, Check, Lock } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, PageHeader, Select, Tooltip } from '@/components/ui';

export default function McpDeveloperGateway() {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [selectedTenant, setSelectedTenant] = useState('Apex Global BPO');

  const mcpToken = 'mcp_tok_demo_tenant_sample';
  const apiKey = 'lms_demo_key_example';
  const webhookUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/api/webhooks/inbound/demo`
    : 'https://api.yourdomain.com/api/webhooks/inbound/demo';

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(id);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const copyButton = (text: string, id: string, label: string) => (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => copyText(text, id)}
      icon={copiedToken === id ? <Check className="text-success-fg" /> : <Copy />}
    >
      {copiedToken === id ? 'Copied' : label}
    </Button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="MCP server & webhooks"
        description="Give Cursor, Claude Desktop and AI agents scoped access to leads, practice scores and battlecards."
        meta={
          <div className="w-60">
          <Select
            aria-label="Workspace"
            value={selectedTenant}
            onChange={(e) => setSelectedTenant(e.target.value)}
          >
            <option value="Apex Global BPO">Apex Global BPO</option>
            <option value="Outsource Accelerator Partner A">Outsource Accelerator Partner A</option>
            <option value="Horizon Solar Sales Floor">Horizon Solar</option>
          </Select>
          </div>
        }
      />

      {/* 1. MODEL CONTEXT PROTOCOL (MCP) CARD */}
      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Tooltip content="Model Context Protocol: lets AI tools read workspace data through a standard interface.">
                <span className="cursor-help underline decoration-dotted decoration-fg-tertiary underline-offset-4">MCP server</span>
              </Tooltip>
              <Badge tone="success">Active</Badge>
            </span>
          }
          description={
            <>
              Bearer token scoped to <span className="text-body-strong text-fg">{selectedTenant}</span>.
            </>
          }
        />
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-subtle px-3 py-2.5">
            <div className="truncate font-mono text-small text-fg">
              <span className="mr-2 text-fg-secondary">Authorization: Bearer</span>
              <span>{mcpToken}</span>
            </div>
            {copyButton(mcpToken, 'mcp', 'Copy token')}
          </div>

          <div className="space-y-2">
            <span className="block text-caption text-fg-tertiary">Exposed resources</span>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1 rounded-md border border-line p-3">
                <span className="block font-mono text-small text-fg">lms://{selectedTenant.toLowerCase().replace(/[^a-z0-9]/g, '-')}/leads</span>
                <p className="text-small text-fg-secondary">Fetch assigned B2B leads, company tech stacks and current cadence stages.</p>
              </div>
              <div className="space-y-1 rounded-md border border-line p-3">
                <span className="block font-mono text-small text-fg">lms://{selectedTenant.toLowerCase().replace(/[^a-z0-9]/g, '-')}/sparring-sessions</span>
                <p className="text-small text-fg-secondary">
                  Stream practice objections, rubric scorecards and{' '}
                  <Tooltip content="Acknowledge, Respond, Move: the objection handling method.">
                    <span className="cursor-help underline decoration-dotted decoration-fg-tertiary underline-offset-4">ARM</span>
                  </Tooltip>{' '}
                  feedback.
                </p>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 2. PUBLIC REST API KEYS */}
      <Card>
        <CardHeader
          title="REST API key"
          description="Server-to-server key for external dialers and CRMs."
          actions={<span className="text-small tabular-nums text-fg-secondary">Rate limit: 60 req/min</span>}
        />
        <CardBody>
          <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-subtle px-3 py-2.5">
            <div className="truncate font-mono text-small text-fg">
              <span className="mr-2 text-fg-secondary">API secret:</span>
              <span>{apiKey}</span>
            </div>
            {copyButton(apiKey, 'api', 'Copy key')}
          </div>
        </CardBody>
      </Card>

      {/* 3. INBOUND WEBHOOK INGRESS GATEWAY */}
      <Card>
        <CardHeader
          title="Inbound webhook"
          description="Endpoint for inbound events from GoHighLevel, HubSpot or custom dialers."
        />
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-subtle px-3 py-2.5">
            <div className="truncate font-mono text-small text-fg">
              <span className="mr-2 text-success-fg">POST</span>
              <span>{webhookUrl}</span>
            </div>
            {copyButton(webhookUrl, 'wh', 'Copy URL')}
          </div>

          <p className="flex items-center gap-2 text-small text-fg-secondary">
            <Lock className="h-4 w-4 shrink-0 text-fg-secondary" />
            <span>
              Verification header <span className="font-mono text-fg">X-Appointmentlyy-Signature: sha256=...</span>. Payloads are validated in under 15ms.
            </span>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
