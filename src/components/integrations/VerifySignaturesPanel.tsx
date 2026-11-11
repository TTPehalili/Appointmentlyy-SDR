'use client';

import * as React from 'react';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { Button, Card, Select } from '@/components/ui';
import { ACTIVITY_EVENT_LABEL, INTEGRATION_LIMITS, WEBHOOK_EVENT_TYPES, type ActivityEventType } from '@/lib/integrations';
import { MAX_CONTACT_EVENTS_PER_IMPORT } from '@/lib/activityEvents';
import { cn } from '@/lib/cn';
import { NODE_VERIFY_EXAMPLE, SIGNATURE_HEADERS, samplePayload } from './webhookDocs';

function CodeBlock({ code, label, testId }: { code: string; label: string; testId?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="relative">
      <pre
        aria-label={label}
        data-testid={testId}
        className="max-h-[420px] overflow-auto rounded-md border border-line bg-subtle p-3 font-mono text-caption leading-relaxed text-fg"
      >
        <code>{code}</code>
      </pre>
      <Button
        size="sm"
        variant="secondary"
        className="absolute right-2 top-2"
        icon={copied ? <Check /> : <Copy />}
        onClick={() => {
          void navigator.clipboard?.writeText(code).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            },
            () => {},
          );
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

/** "How to verify signatures" + a sample payload per event type. Collapsed by default. */
export function VerifySignaturesPanel() {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<ActivityEventType | 'test.ping'>('call.logged');
  const bodyId = React.useId();

  return (
    <Card as="section" aria-label="How to verify signatures">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className="focus-ring flex w-full items-center justify-between gap-4 rounded-lg px-5 py-4 text-left"
        data-testid="webhook-verify-toggle"
      >
        <span>
          <span className="block text-h3 text-fg">How to verify signatures</span>
          <span className="mt-0.5 block text-small text-fg-secondary">Headers, a Node example and a sample payload for each event.</span>
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-fg-tertiary transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div id={bodyId} className="flex flex-col gap-5 border-t border-line px-5 py-4">
          <div className="flex flex-col gap-2 text-body text-fg-secondary">
            <p>Every request is a JSON POST with these headers:</p>
            <ul className="flex flex-col gap-1.5 text-small">
              <li>
                <code className="font-mono text-fg">{SIGNATURE_HEADERS.signature}: t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</code>, where v1 is the
                HMAC-SHA256 of <code className="font-mono text-fg">{'`${t}.${rawBody}`'}</code> keyed with your signing secret.
              </li>
              <li>
                <code className="font-mono text-fg">{SIGNATURE_HEADERS.eventId}</code>: the event id. It is the same on retries, so use it to
                ignore duplicates.
              </li>
              <li>
                <code className="font-mono text-fg">{SIGNATURE_HEADERS.eventType}</code>: for example{' '}
                <code className="font-mono text-fg">call.logged</code>, or <code className="font-mono text-fg">test.ping</code> from the
                Send test button.
              </li>
            </ul>
            <p className="text-small">
              Compute the HMAC over the raw request body (before any JSON parsing), compare in constant time, and reject timestamps older than
              5 minutes. Reply with any 2xx within {INTEGRATION_LIMITS.receiverTimeoutMs / 1000} seconds; anything else is retried. After{' '}
              {INTEGRATION_LIMITS.autoDisableAfter} failures in a row the endpoint is turned off automatically.
            </p>
            <p className="text-small">
              Zapier and Make don’t need to check the signature to work, but check it in your own code so nobody can post fake events to your
              URL. Large imports send contact.created for the first {MAX_CONTACT_EVENTS_PER_IMPORT} new contacts of each import.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="text-body-strong text-fg">Node.js (Express)</h4>
            <CodeBlock code={NODE_VERIFY_EXAMPLE} label="Node.js signature verification example" testId="webhook-node-example" />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-body-strong text-fg">Sample payload</h4>
              <div className="w-64">
                <Select
                  aria-label="Event type for the sample payload"
                  value={type}
                  onChange={(e) => setType(e.target.value as ActivityEventType | 'test.ping')}
                  data-testid="webhook-sample-type"
                >
                  {WEBHOOK_EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ACTIVITY_EVENT_LABEL[t]} ({t})
                    </option>
                  ))}
                  <option value="test.ping">Test ping (test.ping)</option>
                </Select>
              </div>
            </div>
            <CodeBlock code={samplePayload(type)} label={`Sample ${type} payload`} testId="webhook-sample-payload" />
          </div>
        </div>
      )}
    </Card>
  );
}
