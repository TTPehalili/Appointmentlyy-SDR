'use client';

import * as React from 'react';
import Link from 'next/link';
import { Mail, Webhook } from 'lucide-react';
import { Badge, Button, Card, buttonClasses } from '@/components/ui';
import { useSession } from '@/lib/session';

const SUPPORT_EMAIL = 'support@appointmentlyy.com';

const CRMS: { id: string; name: string; does: string }[] = [
  { id: 'zoho', name: 'Zoho CRM', does: 'Create and update leads and contacts, log calls, add booked meetings as events.' },
  { id: 'hubspot', name: 'HubSpot', does: 'Create contacts, log calls and emails on the timeline, move deals through your pipeline.' },
  { id: 'gohighlevel', name: 'GoHighLevel', does: 'Create contacts, add notes, move opportunities and trigger your workflows.' },
  { id: 'salesforce', name: 'Salesforce', does: 'Create leads, log calls as tasks, add events for booked meetings.' },
];

/** CRM connections tab: honest "coming soon" cards with a way to ask for setup. */
export function CrmConnectionsPanel({ onOpenWebhooks }: { onOpenWebhooks: () => void }) {
  const { tenantName, email } = useSession();

  const mailto = (crm: string) => {
    const subject = `CRM setup request: ${crm}`;
    const body = [
      `Hi Appointmentlyy team,`,
      ``,
      `We'd like to connect ${crm} to our workspace${tenantName ? ` (${tenantName})` : ''}.`,
      ``,
      `What we want to sync (contacts / calls / meetings / pipeline stages):`,
      `Who should we work with on our side:`,
      ``,
      email ? `Requested by ${email}` : '',
    ].join('\n');
    return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="max-w-[70ch]">
        <h2 className="text-h3 text-fg">CRM connections</h2>
        <p className="mt-0.5 text-small text-fg-secondary">
          Direct, two-click CRM connections are not available yet. We set them up with you during onboarding.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-label="CRM connections">
        {CRMS.map((crm) => (
          <li key={crm.id} data-testid={`crm-card-${crm.id}`}>
            <Card className="flex h-full flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-h3 text-fg">{crm.name}</h3>
                <Badge>Coming soon</Badge>
              </div>
              <p className="text-small text-fg-secondary">{crm.does}</p>
              <p className="text-small text-fg-tertiary">Coming soon — set up with you during onboarding.</p>
              <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
                <a href={mailto(crm.name)} className={buttonClasses('secondary', 'sm')} data-testid={`crm-request-${crm.id}`}>
                  <Mail aria-hidden />
                  Request setup
                </a>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="max-w-[70ch] text-body text-fg-secondary">
          Until then, use Webhooks with Zapier, Make or your CRM’s own webhook/automation tools. Prefer a ticket?{' '}
          <Link href="/admin/support" className="focus-ring rounded-sm text-fg underline underline-offset-2">
            Open one in Support
          </Link>
          .
        </p>
        <Button variant="secondary" size="sm" icon={<Webhook />} onClick={onOpenWebhooks} data-testid="crm-open-webhooks">
          Set up a webhook
        </Button>
      </Card>
    </div>
  );
}
